-- 031 — O livro de lançamentos: fechamentos e pagamentos a influenciadores.
--
-- POR QUE EXISTE
--
-- Até hoje o pagamento a influenciador é um booleano no cupom (`coupons.paid`).
-- Ele diz "pago", mas não diz quanto, quando, como, nem a qual conjunto de
-- cupons se refere. Renovar a parceria ou corrigir um cupom reescreve o passado
-- sem deixar rastro. Esta migration cria o livro: cada pagamento vira um
-- LANÇAMENTO CONGELADO (`settlements`), com os cupons que ele quitou
-- (`settlement_items`) e o valor da época.
--
-- O QUE FICA TRAVADO NO BANCO (e não só na tela ou na rota)
--
--   * Um cupom entra em UM lançamento só: índice único em settlement_items.
--     Sem ele, o mesmo cupom pago duas vezes passaria despercebido.
--   * Só entra cupom usado no balcão (status 'used' e used_at preenchido),
--     conferido (verified) e da MESMA parceria do lançamento. O lançamento
--     precisa estar 'aberto'. Quem decide é um trigger que valida DADOS, não
--     identidade -- por isso dispara também para service_role, ao contrário da
--     armadilha de 2026 em que regra dependente de auth.uid() virava trigger
--     inerte (auth.uid() é nulo para a chave de serviço). Regra sobre QUEM
--     chama vai para política, nunca para o trigger.
--   * status 'pago' exige paid_at E forma (constraint).
--   * Parceria com lançamento não pode ser apagada (on delete restrict): o
--     livro-razão não pode perder a referência de a quem se pagou.
--   * Só admin e financeiro enxergam e escrevem. `moderator` (o Lojista na
--     interface) e `influencer` NÃO têm política nenhuma nas duas tabelas --
--     é ausência de política, não política restritiva. O anon perde o grant.
--
-- A ARMADILHA QUE ESTA MIGRATION EVITA (03/11/2026, ver migration 030)
--
-- Subconsulta dentro de política de RLS também passa pela RLS. Aqui as
-- políticas só chamam is_admin() e is_finance(), que são security definer e
-- leem a tabela de verdade. As funções que consultam `coupons` e `settlements`
-- (para o trigger) também são security definer, pelo mesmo motivo: o resultado
-- não pode variar conforme o que a RLS deixa o chamador enxergar.
--
-- Nomes das constraints são fixos de propósito: o scripts/verifica-031.sql
-- confere QUAL constraint barrou, para um erro de chave estrangeira em outra
-- coisa não passar por prova.
--
-- PARA DESFAZER (apaga o livro inteiro, inclusive os lançamentos gravados):
--
--   drop trigger if exists settlement_items_valida on public.settlement_items;
--   drop function if exists public.settlement_items_valida();
--   drop function if exists public.settlement_pode_incluir(uuid, uuid);
--   drop function if exists public.settlement_motivo_recusa(uuid, uuid);
--   drop table if exists public.settlement_items;
--   drop table if exists public.settlements;

create table if not exists public.settlements (
  id             uuid primary key default gen_random_uuid(),
  partnership_id uuid not null,
  tipo           text not null,
  status         text not null default 'aberto',
  periodo_de     date,
  periodo_ate    date,
  valor          numeric not null,
  paid_at        timestamptz,
  forma          text,
  identificador  text,
  created_at     timestamptz not null default now(),
  created_by     text,

  constraint settlements_partnership_id_fkey
    foreign key (partnership_id) references public.partnerships(id) on delete restrict,
  constraint settlements_tipo_check
    check (tipo in ('comissao','fixo','restituicao')),
  constraint settlements_status_check
    check (status in ('aberto','pago','cancelado')),
  constraint settlements_pago_exige_dados
    check (status <> 'pago'
           or (paid_at is not null and forma is not null and length(btrim(forma)) > 0)),
  constraint settlements_comissao_exige_periodo
    check (tipo <> 'comissao'
           or (periodo_de is not null and periodo_ate is not null and periodo_de <= periodo_ate))
);

create index if not exists settlements_partnership_idx
  on public.settlements (partnership_id);

create table if not exists public.settlement_items (
  id            uuid primary key default gen_random_uuid(),
  settlement_id uuid not null,
  coupon_id     uuid not null,
  valor         numeric not null,

  constraint settlement_items_settlement_id_fkey
    foreign key (settlement_id) references public.settlements(id) on delete cascade,
  constraint settlement_items_coupon_id_fkey
    foreign key (coupon_id) references public.coupons(id) on delete restrict
);

-- Um cupom, um lançamento. É o que impede pagar o mesmo cupom duas vezes.
create unique index if not exists settlement_items_coupon_unico
  on public.settlement_items (coupon_id);

create index if not exists settlement_items_settlement_idx
  on public.settlement_items (settlement_id);

-- ---------------------------------------------------------------------------
-- A regra de elegibilidade, por fora da RLS.
-- Devolve o MOTIVO da recusa (texto) ou nulo quando o cupom pode entrar.
-- ---------------------------------------------------------------------------
create or replace function public.settlement_motivo_recusa(p_settlement uuid, p_coupon uuid)
returns text
language plpgsql
stable
security definer
set search_path to 'public'
as $fn$
declare
  s record;
  c record;
begin
  select status, partnership_id into s
    from public.settlements where id = p_settlement;
  if not found then
    return 'lancamento inexistente';
  end if;
  if s.status <> 'aberto' then
    return 'lancamento nao esta aberto';
  end if;

  select status, verified, used_at, partnership_id into c
    from public.coupons where id = p_coupon;
  if not found then
    return 'cupom inexistente';
  end if;
  if c.status is distinct from 'used' then
    return 'cupom nao foi usado no balcao';
  end if;
  if c.used_at is null then
    return 'cupom sem data de uso';
  end if;
  if c.verified is not true then
    return 'cupom nao conferido';
  end if;
  if c.partnership_id is distinct from s.partnership_id then
    return 'cupom de outra parceria';
  end if;

  return null;
end;
$fn$;

comment on function public.settlement_motivo_recusa(uuid, uuid) is
  'Motivo pelo qual o cupom NAO pode entrar no lancamento, ou nulo se pode. '
  'security definer de proposito: o resultado nao pode depender do que a RLS '
  'deixa o chamador enxergar.';

create or replace function public.settlement_pode_incluir(p_settlement uuid, p_coupon uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select public.settlement_motivo_recusa(p_settlement, p_coupon) is null;
$fn$;

comment on function public.settlement_pode_incluir(uuid, uuid) is
  'True se o cupom pode entrar no lancamento. Mesma regra do trigger.';

revoke all on function public.settlement_motivo_recusa(uuid, uuid) from public, anon;
revoke all on function public.settlement_pode_incluir(uuid, uuid) from public, anon;
grant execute on function public.settlement_motivo_recusa(uuid, uuid) to authenticated, service_role;
grant execute on function public.settlement_pode_incluir(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- O trigger: valida DADOS, não identidade. Dispara para qualquer papel,
-- inclusive service_role.
-- ---------------------------------------------------------------------------
create or replace function public.settlement_items_valida()
returns trigger
language plpgsql
as $fn$
declare
  motivo text;
begin
  motivo := public.settlement_motivo_recusa(new.settlement_id, new.coupon_id);
  if motivo is not null then
    raise exception 'Cupom nao entra no lancamento: %', motivo;
  end if;
  return new;
end;
$fn$;

drop trigger if exists settlement_items_valida on public.settlement_items;
create trigger settlement_items_valida
  before insert or update of settlement_id, coupon_id on public.settlement_items
  for each row execute function public.settlement_items_valida();

-- ---------------------------------------------------------------------------
-- RLS: admin e financeiro tudo. Lojista e influenciador: nenhuma política.
-- ---------------------------------------------------------------------------
alter table public.settlements enable row level security;
alter table public.settlement_items enable row level security;

revoke all on public.settlements from anon;
revoke all on public.settlement_items from anon;
grant select, insert, update, delete on public.settlements to authenticated;
grant select, insert, update, delete on public.settlement_items to authenticated;

drop policy if exists settlements_interno_total on public.settlements;
create policy settlements_interno_total on public.settlements
  for all to authenticated
  using (public.is_admin() or public.is_finance())
  with check (public.is_admin() or public.is_finance());

drop policy if exists settlement_items_interno_total on public.settlement_items;
create policy settlement_items_interno_total on public.settlement_items
  for all to authenticated
  using (public.is_admin() or public.is_finance())
  with check (public.is_admin() or public.is_finance());
