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
--   * Lançamento PAGO é imutável: nenhum campo muda, não sai de 'pago' e não
--     é apagado; seus itens não mudam nem somem. Correção se faz com
--     lançamento novo -- apagar prova é o oposto do que este módulo existe
--     para fazer. Regra em duas camadas: a rota barra, e estes triggers são
--     o backstop (o mesmo buraco que o BACKLOG registra em
--     coupons_guard_non_admin_update, que aqui não se repete). Itens de
--     lançamento 'aberto' continuam editáveis/apagáveis: é o que o
--     cancelamento usa.
--     EXCEÇÃO DELIBERADA (11/11/2026): admin e chamadas sem identidade
--     (service_role, SQL Editor: auth.uid() nulo) passam pelas três travas.
--     Razão do dono do projeto: "A ferramenta é para controle nosso. Mas o
--     Admin PODE e DEVE poder editar. Erros acontecem, e se o admin não puder
--     ajustar, não tenho a necessidade de ter." Correção de erro sem poder de
--     edição não é controle. A guarda é a mesma de coupons_guard_insert
--     (auth.uid() is null or is_admin()); o `auth.uid() is null` NÃO é
--     opcional, senão service_role e as migrations seguintes ficam barrados.
--     Finance e os demais papéis continuam barrados.
--   * `valor` é magnitude (>= 0); o sinal do dinheiro mora em `tipo`.
--     Aceitar negativo abriria dupla negação (restituição de -500 que soma).
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
--   drop trigger if exists settlement_items_congela on public.settlement_items;
--   drop trigger if exists settlements_congela_pago on public.settlements;
--   drop trigger if exists settlements_protege_pago on public.settlements;
--   drop function if exists public.settlement_items_congela();
--   drop function if exists public.settlements_congela_pago();
--   drop function if exists public.settlements_protege_pago();
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
  constraint settlements_valor_nao_negativo
    check (valor >= 0),
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

  constraint settlement_items_valor_nao_negativo
    check (valor >= 0),
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
-- Imutabilidade do lançamento pago. Valida ESTADO e DADOS; a única checagem de
-- quem chama é a porta do admin / sem identidade (ver cabeçalho, 11/11/2026).
-- ---------------------------------------------------------------------------
create or replace function public.settlements_congela_pago()
returns trigger
language plpgsql
as $fn$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  if old.status = 'pago' and (
       new.status         is distinct from 'pago'
    or new.valor          is distinct from old.valor
    or new.tipo           is distinct from old.tipo
    or new.partnership_id is distinct from old.partnership_id
    or new.periodo_de     is distinct from old.periodo_de
    or new.periodo_ate    is distinct from old.periodo_ate
    or new.paid_at        is distinct from old.paid_at
    or new.forma          is distinct from old.forma
    or new.identificador  is distinct from old.identificador
  ) then
    raise exception 'Lancamento pago e imutavel: correcao se faz com lancamento novo';
  end if;
  return new;
end;
$fn$;

drop trigger if exists settlements_congela_pago on public.settlements;
create trigger settlements_congela_pago
  before update on public.settlements
  for each row execute function public.settlements_congela_pago();

create or replace function public.settlements_protege_pago()
returns trigger
language plpgsql
as $fn$
begin
  if auth.uid() is null or public.is_admin() then
    return old;
  end if;
  if old.status = 'pago' then
    raise exception 'Lancamento pago e imutavel: nao se apaga, correcao se faz com lancamento novo';
  end if;
  return old;
end;
$fn$;

drop trigger if exists settlements_protege_pago on public.settlements;
create trigger settlements_protege_pago
  before delete on public.settlements
  for each row execute function public.settlements_protege_pago();

-- Itens: só mudam ou somem enquanto o lançamento pai está 'aberto'. Se o pai
-- não existe mais (apagado em cascata), deixa passar. security definer: a
-- leitura do pai não pode depender do que a RLS mostra ao chamador.
create or replace function public.settlement_items_congela()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  st text;
begin
  if auth.uid() is null or public.is_admin() then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  select status into st from public.settlements where id = old.settlement_id;
  if found and st <> 'aberto' then
    raise exception 'Lancamento % e imutavel: itens so mudam em lancamento aberto', st;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$fn$;

drop trigger if exists settlement_items_congela on public.settlement_items;
create trigger settlement_items_congela
  before update or delete on public.settlement_items
  for each row execute function public.settlement_items_congela();

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
