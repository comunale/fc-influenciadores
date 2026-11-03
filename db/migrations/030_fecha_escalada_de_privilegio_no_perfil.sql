-- 030 — Fecha a escalada de privilégio no cadastro de perfil.
--
-- A BRECHA (aberta de 22/05/2026 a 03/11/2026, não explorada)
--
-- A política `admin_profiles_insert` tinha três ramos no WITH CHECK, e DOIS
-- deles deixavam qualquer usuário logado se inserir com o cargo que quisesse:
--
--   Ramo 1 — `not exists (select 1 from admin_profiles)`, para o setup inicial.
--     Esse select passa pela RLS. Para quem não tem perfil, `profiles_select`
--     não devolve linha nenhuma, então a tabela PARECE vazia e o ramo dá true.
--     Medido em 03/11: conta nova vê 0 linhas, `not exists` = true.
--
--   Ramo 3 — auto-insert do próprio perfil quando já existe algum admin.
--     Nasceu no commit a0daab7 (22/05) como plano B de `create-user`, para
--     quando SUPABASE_SERVICE_ROLE_KEY não estivesse configurada. O plano A
--     (auth.admin.createUser com a chave de serviço) veio no MESMO commit e é
--     o que roda em produção desde então. O ramo nunca teve uso real.
--
-- Nenhum dos dois limitava `role`. Somado a `disable_signup: false` e
-- `mailer_autoconfirm: true`, qualquer pessoa da internet criava conta e fazia
-- POST em /rest/v1/admin_profiles com role='admin'. Provado em 03/11 com
-- identidade simulada dentro de begin/rollback: a conta nova virou admin e
-- alcançou 248 cupons (CPF, telefone, e-mail) e a ficha bancária.
--
-- O CONSERTO
--
-- As duas checagens de existência passam a rodar por `security definer`, que
-- vê a tabela de verdade em vez da visão filtrada pela RLS. É isso que fecha —
-- remover o ramo 3 sozinho NÃO fecharia, porque o ramo 1 vaza igual.
--
-- O setup continua possível enquanto a tabela estiver realmente vazia, e passa
-- a ser impossível no instante em que existir o primeiro perfil.
--
-- PARA DESFAZER (restaura o estado vulnerável de 22/05 — só em emergência):
--
--   drop policy admin_profiles_insert on public.admin_profiles;
--   create policy admin_profiles_insert on public.admin_profiles
--     for insert to public with check (
--       (not exists (select 1 from admin_profiles))
--       or (exists (select 1 from admin_profiles ap
--                   where ap.id = auth.uid() and ap.role='admin' and ap.active=true))
--       or ((auth.uid() = id) and (auth.role() = 'authenticated')
--           and (not exists (select 1 from admin_profiles where id = auth.uid()))
--           and (exists (select 1 from admin_profiles where role='admin' and active=true))));
--   drop function if exists public.sem_nenhum_perfil();

-- A checagem do setup, por fora da RLS.
create or replace function public.sem_nenhum_perfil()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select not exists (select 1 from public.admin_profiles);
$fn$;

comment on function public.sem_nenhum_perfil() is
  'True enquanto admin_profiles estiver vazia. É security definer de propósito: '
  'a mesma conta via RLS não enxerga linha nenhuma e leria a tabela como vazia.';

revoke all on function public.sem_nenhum_perfil() from public;
grant execute on function public.sem_nenhum_perfil() to anon, authenticated;

drop policy if exists admin_profiles_insert on public.admin_profiles;

create policy admin_profiles_insert on public.admin_profiles
  for insert to public
  with check (
    -- Setup inicial: só enquanto não existir nenhum perfil, de verdade.
    public.sem_nenhum_perfil()
    -- Operação normal: quem insere é admin ativo.
    or public.is_admin()
  );
