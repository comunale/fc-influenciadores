-- 036 — Programa de Indicação: qualquer pessoa indica, a FOX premia por fora.
--
-- Spec: docs/superpowers/specs/2026-11-17-programa-de-indicacao-design.md
-- Plano: docs/superpowers/plans/2026-11-18-programa-de-indicacao.md
--
-- O QUE ENTRA
--
--   indicadores        — quem divulga. Não é influenciador: não tem parceria,
--                        não tem contrato, e os termos são do programa.
--   indicador_cliques  — quantas pessoas abriram o link. É o que mede eficácia:
--                        hoje o sistema só sabe que um cupom nasceu.
--   coupons.indicador_id / indicador_cpf
--                      — o cupom da indicação é um cupom como qualquer outro.
--                        O balcão, a conferência de NF, a impressão e
--                        /cupom/[numero] passam a servir ao programa sem cópia.
--
-- POR QUE CHECK, E NÃO TRIGGER
--
-- Os dois triggers de coupons (coupons_guard_insert e
-- coupons_guard_non_admin_update) começam com
-- `if auth.uid() is null or public.is_admin() then return new`, e as rotas que
-- criam cupom usam service_role, para quem auth.uid() é NULL. Regra nova
-- escrita nesse padrão nasceria SEM EFEITO. As travas daqui são CHECK e índice,
-- que valem para todo mundo, inclusive para a chave de serviço.
--
-- O QUE DEIXA DE SER NOT NULL EM coupons, E POR QUÊ
--
--   influencer_id   — o cupom da indicação não tem influenciador. O CHECK
--                     coupons_dono_unico garante que tem exatamente um dono.
--   customer_email  — o comprador do programa dá nome, CPF e telefone. E-mail
--                     não é pedido (decisão do César, 17/11).
--   expires_at      — o cupom da indicação não vence (decisão 11). Quem encerra
--                     o benefício é a empresa, pela tela.
--
-- A DIVIDA DA NF QUE NAO EXISTIA
--
-- A spec de 02/09 anotou "indice unico em invoice_number" como divida aberta, e
-- esta migracao chegou a cria-lo. O verifica-036, caso 15, mostrou que ele JA
-- existia como coupons_invoice_number_unico -- e melhor que o novo, porque
-- tambem exclui string vazia. O indice duplicado foi removido; a divida estava
-- paga e a spec nao sabia. Licao: medir o objeto, nao confiar na anotacao.
--
-- PARA DESFAZER (na ordem):
--
--   drop policy if exists indicadores_select on public.indicadores;
--   drop policy if exists indicadores_update on public.indicadores;
--   drop policy if exists indicador_cliques_select on public.indicador_cliques;
--   drop function if exists public.indicacao_minhas_indicacoes();
--   drop function if exists public.indicacao_meus_cliques();
--   drop function if exists public.indicador_do_usuario();
--   alter table public.admin_profiles drop constraint admin_profiles_vinculo_coerente;
--   alter table public.admin_profiles add constraint admin_profiles_vinculo_coerente
--     check ((role = 'influencer' and influencer_id is not null)
--            or (role <> 'influencer' and influencer_id is null));
--   alter table public.admin_profiles drop constraint admin_profiles_role_check;
--   alter table public.admin_profiles add constraint admin_profiles_role_check
--     check (role in ('admin','finance','moderator','influencer'));
--   alter table public.admin_profiles drop column indicador_id;
--   alter table public.coupons drop constraint coupons_sem_autoindicacao;
--   alter table public.coupons drop constraint coupons_indicacao_coerente;
--   alter table public.coupons drop constraint coupons_dono_unico;
--   drop index if exists public.coupons_indicador_id_idx;
--   -- Só volta a ser NOT NULL se não houver cupom de indicação na base:
--   alter table public.coupons alter column expires_at set not null;
--   alter table public.coupons alter column customer_email set not null;
--   alter table public.coupons alter column influencer_id set not null;
--   alter table public.coupons drop column indicador_cpf;
--   alter table public.coupons drop column indicador_id;
--   drop table public.indicador_cliques;
--   drop table public.indicadores;
--   delete from public.campaigns where name = 'Programa de Indicação';

-- ---------------------------------------------------------------- indicadores

create table public.indicadores (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cpf text not null unique,
  telefone text not null,
  sexo text not null check (sexo in ('F','M','outro')),
  data_nascimento date not null,
  -- O código do link dela: /i/<codigo>.
  codigo text not null unique,
  -- Teto de USOS. Nulo = sem teto, e é como nasce (decisão 15 da spec).
  teto_usos integer check (teto_usos is null or teto_usos > 0),
  ativo boolean not null default true,
  encerrado_em timestamptz,
  encerrado_por text,
  -- Dois aceites, não um. Os termos do programa são obrigatórios; o de
  -- comunicação e publicidade é livre, porque consentimento de marketing que
  -- se exige para usar o serviço não é consentimento sob a LGPD.
  aceite_termos boolean not null check (aceite_termos = true),
  aceite_comunicacoes boolean not null default false,
  aceite_at timestamptz not null default now(),
  aceite_ip text,
  created_at timestamptz not null default now(),
  constraint indicadores_encerramento_coerente
    check ((ativo and encerrado_em is null) or (not ativo and encerrado_em is not null))
);

comment on table public.indicadores is
  'Programa de Indicação (036). Quem divulga sem ser influenciador: sem parceria, '
  'sem contrato, termos do programa. O prêmio é pago por fora — nada aqui paga.';

comment on column public.indicadores.teto_usos is
  'Quantos usos esta pessoa pode ter. Nulo = sem teto. Batido, a rota do link '
  'para de gerar cupom. Editável por admin e financeiro.';

create table public.indicador_cliques (
  id bigserial primary key,
  indicador_id uuid not null references public.indicadores(id) on delete cascade,
  created_at timestamptz not null default now(),
  ip text,
  user_agent text
);

create index indicador_cliques_indicador_id_idx
  on public.indicador_cliques (indicador_id, created_at desc);

comment on table public.indicador_cliques is
  'Um registro por carregamento de /i/<codigo>. Mede quem divulgou e não '
  'converteu — o cupom sozinho não conta essa parte.';

-- -------------------------------------------------------------------- coupons

alter table public.coupons
  add column indicador_id uuid references public.indicadores(id),
  add column indicador_cpf text;

comment on column public.coupons.indicador_cpf is
  'CPF de quem indicou, desnormalizado de propósito: é o que permite o CHECK '
  'coupons_sem_autoindicacao na própria linha, sem subconsulta.';

alter table public.coupons alter column influencer_id drop not null;
alter table public.coupons alter column customer_email drop not null;
alter table public.coupons alter column expires_at drop not null;

create index coupons_indicador_id_idx
  on public.coupons (indicador_id) where indicador_id is not null;

alter table public.coupons
  add constraint coupons_dono_unico check (
    (influencer_id is not null and indicador_id is null)
    or (influencer_id is null and indicador_id is not null)
  ),
  add constraint coupons_indicacao_coerente check (
    (indicador_id is null and indicador_cpf is null)
    or (indicador_id is not null and indicador_cpf is not null)
  ),
  add constraint coupons_sem_autoindicacao check (
    indicador_cpf is null or indicador_cpf <> customer_cpf
  );


-- ------------------------------------------------------------- admin_profiles

alter table public.admin_profiles
  add column indicador_id uuid references public.indicadores(id);

alter table public.admin_profiles drop constraint admin_profiles_role_check;
alter table public.admin_profiles add constraint admin_profiles_role_check
  check (role = any (array['admin','finance','moderator','influencer','indicador']));

-- Três casos, e nenhum outro: influenciador aponta para influencers, indicador
-- aponta para indicadores, papel interno não aponta para nada.
alter table public.admin_profiles drop constraint admin_profiles_vinculo_coerente;
alter table public.admin_profiles add constraint admin_profiles_vinculo_coerente
  check (
    (role = 'influencer' and influencer_id is not null and indicador_id is null)
    or (role = 'indicador' and indicador_id is not null and influencer_id is null)
    or (role in ('admin','finance','moderator') and influencer_id is null and indicador_id is null)
  );

-- ------------------------------------------------- quem sou eu, do lado do SQL

-- O indicador dono da sessão. É security definer pelo mesmo motivo de
-- sem_nenhum_perfil() (migration 030): subconsulta dentro de policy também
-- passa pela RLS, e profiles_select filtraria a leitura.
create or replace function public.indicador_do_usuario()
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select p.indicador_id
  from public.admin_profiles p
  where p.id = auth.uid() and p.active and p.role = 'indicador';
$fn$;

revoke all on function public.indicador_do_usuario() from public;
grant execute on function public.indicador_do_usuario() to authenticated;

-- ----------------------------------------------------------------------- RLS

alter table public.indicadores enable row level security;
alter table public.indicador_cliques enable row level security;

-- Ela lê a PRÓPRIA linha (são os dados dela). Admin e financeiro leem todas.
-- Nunca using(true): em 18/08 foi assim que o CPF de cliente ficou exposto.
create policy indicadores_select on public.indicadores
  for select to authenticated
  using (
    public.is_admin()
    or public.is_finance()
    or id = public.indicador_do_usuario()
  );

-- Teto e encerramento: admin e financeiro (decisão 9). A tela só expõe esses
-- dois campos; a RLS não filtra coluna, então o resto fica na tela e na rota.
create policy indicadores_update on public.indicadores
  for update to authenticated
  using (public.is_admin() or public.is_finance())
  with check (public.is_admin() or public.is_finance());

-- Clique guarda IP de visitante. Só quem administra lê a linha; a pessoa vê o
-- NÚMERO pela função indicacao_meus_cliques().
create policy indicador_cliques_select on public.indicador_cliques
  for select to authenticated
  using (public.is_admin() or public.is_finance());

-- Insert em indicadores e em indicador_cliques: nenhuma policy, de propósito.
-- Só o service_role escreve, pelas rotas /api/indicacao/*.

-- ------------------------------------------- o que a pessoa vê das indicações
--
-- NÃO existe policy de select em coupons para o indicador, e isso é deliberado:
-- RLS filtra LINHA, não COLUNA. Uma policy por indicador_id deixaria a pessoa
-- pedir /rest/v1/coupons?select=* e ler nome, CPF, telefone e e-mail de cada
-- comprador que ela indicou. O painel dela passa por estas duas funções, que
-- devolvem só o que ela precisa ver.

create or replace function public.indicacao_minhas_indicacoes()
returns table (
  coupon_number text,
  primeiro_nome text,
  status text,
  verified boolean,
  premio numeric,
  criado_em timestamptz,
  usado_em timestamptz
)
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select c.coupon_number,
         split_part(btrim(c.customer_name), ' ', 1) as primeiro_nome,
         c.status,
         c.verified,
         c.commission_per_sale as premio,
         c.created_at,
         c.used_at
  from public.coupons c
  where c.indicador_id = public.indicador_do_usuario()
  order by c.created_at desc;
$fn$;

comment on function public.indicacao_minhas_indicacoes() is
  'As indicações da pessoa logada, sem PII do comprador: só o primeiro nome. '
  'Existe para NÃO precisar de policy de select em coupons, que exporia CPF.';

revoke all on function public.indicacao_minhas_indicacoes() from public;
grant execute on function public.indicacao_minhas_indicacoes() to authenticated;

create or replace function public.indicacao_meus_cliques()
returns integer
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select count(*)::integer
  from public.indicador_cliques k
  where k.indicador_id = public.indicador_do_usuario();
$fn$;

revoke all on function public.indicacao_meus_cliques() from public;
grant execute on function public.indicacao_meus_cliques() to authenticated;

-- ------------------------------------------------- a campanha do programa

-- validity_days recebe 3650 e NÃO é lido: o cupom da indicação nasce com
-- expires_at nulo (decisão 11). A coluna é NOT NULL na tabela, por isso o valor.
insert into public.campaigns (name, discount_type, discount_value, validity_days,
                              coupon_title, coupon_description, active)
select 'Programa de Indicação', 'fixed', 300, 3650,
       'R$ 300 de desconto',
       'Desconto de R$ 300 na sua FOX, por indicação de quem já conhece a marca.',
       true
where not exists (select 1 from public.campaigns where name = 'Programa de Indicação');

-- --------------------------------------------------------------- verificação

select 'indicadores' as objeto, count(*)::text as valor from public.indicadores
union all
select 'campanha do programa', count(*)::text from public.campaigns
  where name = 'Programa de Indicação'
union all
select 'coupons.influencer_id nullable',
       (select is_nullable from information_schema.columns
         where table_schema='public' and table_name='coupons' and column_name='influencer_id')
union all
select 'checks novos em coupons', count(*)::text from pg_constraint
  where conrelid = 'public.coupons'::regclass
    and conname in ('coupons_dono_unico','coupons_indicacao_coerente','coupons_sem_autoindicacao')
union all
select 'papel indicador aceito',
       case when pg_get_constraintdef(oid) like '%indicador%' then 'sim' else 'NAO' end
  from pg_constraint where conname = 'admin_profiles_role_check';
