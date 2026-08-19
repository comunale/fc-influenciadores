-- Portal do influenciador: o papel novo, o vínculo, e o aperto que ele obriga.
--
-- Até aqui todas as políticas diziam `to authenticated using (true)`. Era seguro
-- porque só existiam três papéis, todos da FoxCycles. O portal quebra essa
-- premissa: o influenciador vira um usuário logado e entraria pela mesma porta.
--
-- Sem este aperto ele leria todo cupom com CPF e telefone, leria o cadastro
-- interno inteiro, criaria cupom em nome de qualquer influenciador e -- o pior --
-- VALIDARIA cupom, aprovando a venda que gera a própria comissão.
--
-- É a mesma classe de falha da migration 013: regra escrita larga porque, no dia
-- em que foi escrita, não havia ninguém de fora para se aproveitar dela.
--
-- Aplicada em 2026-08-19.

-- Quem é da casa. Security definer para não recursar na política de
-- admin_profiles, que é a própria tabela que a função consulta.
create or replace function public.eh_interno()
returns boolean language sql stable security definer set search_path to 'public'
as $$
  select exists (
    select 1 from public.admin_profiles
    where id = auth.uid() and role in ('admin','finance','moderator') and active = true
  );
$$;

alter table public.admin_profiles
  add column if not exists influencer_id uuid references public.influencers(id) on delete cascade;

-- Vem DEPOIS do alter acima: o corpo de uma função sql é validado na
-- criação, e a coluna precisa existir antes.
-- O influenciador dono da sessão atual. Null para usuário interno -- e null
-- nunca casa com `influencer_id = meu_influencer_id()`, então um interno não
-- entra nas políticas do portal por acidente.
create or replace function public.meu_influencer_id()
returns uuid language sql stable security definer set search_path to 'public'
as $$
  select influencer_id from public.admin_profiles
  where id = auth.uid() and role = 'influencer' and active = true;
$$;

-- A lista de papéis válidos é travada no banco. Sem abrir espaço aqui, o papel
-- novo não entra -- e é bom que seja assim: um papel só existe se o banco souber.
alter table public.admin_profiles drop constraint if exists admin_profiles_role_check;
alter table public.admin_profiles add constraint admin_profiles_role_check
  check (role in ('admin','finance','moderator','influencer'));

-- Um influenciador tem no máximo um acesso.
create unique index if not exists admin_profiles_influencer_unico
  on public.admin_profiles (influencer_id) where influencer_id is not null;

-- O papel e o vínculo andam juntos. Sem isto daria para criar um usuário
-- 'influencer' solto, sem dono -- e `meu_influencer_id()` devolveria null,
-- deixando a conta num limbo silencioso em vez de falhar na hora.
alter table public.admin_profiles drop constraint if exists admin_profiles_vinculo_coerente;
alter table public.admin_profiles add constraint admin_profiles_vinculo_coerente check (
  (role = 'influencer' and influencer_id is not null)
  or (role <> 'influencer' and influencer_id is null)
);

-- Parceria visível no portal. Nasce true; as que já existem viram false porque
-- vieram de planilha e foram acertadas por fora -- mostrá-las em detalhe criaria
-- cobrança sobre o que já foi pago.
alter table public.partnerships
  add column if not exists portal_visible boolean not null default true;

update public.partnerships set portal_visible = false;

-- ---------------------------------------------------------------------------
-- Aperto das políticas que hoje valem para qualquer autenticado
-- ---------------------------------------------------------------------------

drop policy if exists coupons_select_authenticated on public.coupons;
create policy coupons_select_interno on public.coupons
  for select to authenticated using (public.eh_interno());

drop policy if exists coupons_insert_authenticated on public.coupons;
create policy coupons_insert_interno on public.coupons
  for insert to authenticated with check (public.eh_interno());

-- O Lojista valida cupom pendente; admin e Financeiro mexem em qualquer um.
-- Antes o `status = 'pending'` valia sozinho, para QUALQUER autenticado.
drop policy if exists coupons_update_admin_or_validation on public.coupons;
create policy coupons_update_interno on public.coupons
  for update to authenticated
  using (public.is_admin() or public.is_finance() or (public.eh_interno() and status = 'pending'));

drop policy if exists influencers_select_authenticated on public.influencers;
create policy influencers_select_interno on public.influencers
  for select to authenticated using (public.eh_interno());

drop policy if exists partnerships_select_authenticated on public.partnerships;
create policy partnerships_select_interno on public.partnerships
  for select to authenticated using (public.eh_interno());

-- Todo mundo lê o próprio perfil -- é o que sustenta o login. A lista dos
-- outros é dos internos.
drop policy if exists authenticated_read_profiles on public.admin_profiles;
create policy profiles_select on public.admin_profiles
  for select to authenticated using (public.eh_interno() or id = auth.uid());

-- ---------------------------------------------------------------------------
-- O que o influenciador enxerga: só o que é dele, e só leitura
-- ---------------------------------------------------------------------------

drop policy if exists coupons_select_influencer on public.coupons;
create policy coupons_select_influencer on public.coupons
  for select to authenticated
  using (influencer_id = public.meu_influencer_id());

drop policy if exists partnerships_select_influencer on public.partnerships;
create policy partnerships_select_influencer on public.partnerships
  for select to authenticated
  using (influencer_id = public.meu_influencer_id() and portal_visible = true);

drop policy if exists influencers_select_proprio on public.influencers;
create policy influencers_select_proprio on public.influencers
  for select to authenticated
  using (id = public.meu_influencer_id());
