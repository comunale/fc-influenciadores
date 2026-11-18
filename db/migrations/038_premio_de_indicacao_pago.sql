-- 038 — O prêmio da indicação que já foi pago para de aparecer como a pagar.
--
-- O DEFEITO (achado na revisão independente de 18/11/2026, antes do deploy)
--
-- A exportação de /admin/indicadores trazia TODA venda conferida, sem recorte e
-- sem marca de pagamento. Cinco vendas conferidas em novembro saíam na planilha
-- com "TOTAL A PAGAR R$ 1.000"; o César pagava. Em dezembro, com mais três
-- conferidas, a MESMA planilha passava a listar oito linhas e R$ 1.600. E o
-- painel da pessoa dizia "R$ 1.000 a receber" para sempre, mesmo depois de ela
-- ter recebido — então ela pedia de novo, e a única defesa do César era
-- lembrar quais linhas já tinha pago.
--
-- POR QUE NÃO USAR coupons.paid
--
-- Aquele campo pertence ao fechamento do influenciador e tem UM escritor, por
-- decisão da spec de 24/08. Emprestá-lo faria o prêmio da indicação aparecer
-- como comissão paga no outro subsistema. O programa ganha as colunas dele.
--
-- DE CARONA
--
-- `admin_profiles_indicador_unico`: a 014 criou o índice espelho para
-- influencer_id (admin_profiles_influencer_unico) e a 036 esqueceu o do
-- indicador. Hoje só a rota de cadastro escreve essa coluna, então nada
-- alcança o problema — mas a assimetria não tem explicação.
--
-- PARA DESFAZER:
--   drop index if exists public.admin_profiles_indicador_unico;
--   drop function if exists public.indicacao_minhas_vendas();
--   drop index if exists public.coupons_indicacao_a_premiar_idx;
--   alter table public.coupons drop constraint coupons_premiado_coerente;
--   alter table public.coupons drop constraint coupons_premiado_so_de_indicacao;
--   alter table public.coupons drop column indicacao_premiado_por;
--   alter table public.coupons drop column indicacao_premiado_em;

alter table public.coupons
  add column indicacao_premiado_em timestamptz,
  add column indicacao_premiado_por text;

comment on column public.coupons.indicacao_premiado_em is
  'Quando o premio de R$ 200 deste cupom de indicacao foi pago por fora. '
  'NAO e coupons.paid: aquele campo e do fechamento do influenciador e tem um '
  'escritor so (spec de 24/08).';

alter table public.coupons
  -- Prêmio de indicação só existe em cupom de indicação.
  add constraint coupons_premiado_so_de_indicacao check (
    indicacao_premiado_em is null or indicador_id is not null
  ),
  -- Quem pagou vem junto de quando pagou. "Pago" sem nome não se audita.
  add constraint coupons_premiado_coerente check (
    (indicacao_premiado_em is null and indicacao_premiado_por is null)
    or (indicacao_premiado_em is not null and indicacao_premiado_por is not null)
  );

-- O que ainda falta pagar, que é a consulta da exportação.
create index coupons_indicacao_a_premiar_idx
  on public.coupons (indicador_id)
  where indicador_id is not null and indicacao_premiado_em is null;

create unique index admin_profiles_indicador_unico
  on public.admin_profiles (indicador_id)
  where indicador_id is not null;

-- A área da pessoa passa a saber o que já recebeu. Sem isso ela vê o valor
-- cheio para sempre e cobra de novo o que já foi pago.
-- Nome NOVO: a 036 criou indicacao_minhas_indicacoes() com outra assinatura, e
-- trocar a assinatura exige DROP FUNCTION. A antiga fica no banco, sem uso
-- nenhum, e entra na lista de limpeza pendente do BACKLOG junto com o indice
-- duplicado da 036:
--
--   drop function if exists public.indicacao_minhas_indicacoes();
--
create or replace function public.indicacao_minhas_vendas()
returns table (
  coupon_number text,
  primeiro_nome text,
  status text,
  verified boolean,
  premio numeric,
  premiado_em timestamptz,
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
         c.indicacao_premiado_em,
         c.created_at,
         c.used_at
  from public.coupons c
  where c.indicador_id = public.indicador_do_usuario()
  order by c.created_at desc;
$fn$;

comment on function public.indicacao_minhas_vendas() is
  'As indicações da pessoa logada, sem PII do comprador: só o primeiro nome. '
  'Existe para NÃO precisar de policy de select em coupons, que exporia CPF.';

revoke all on function public.indicacao_minhas_vendas() from public;
grant execute on function public.indicacao_minhas_vendas() to authenticated;

-- Verificação.
select 'colunas de premio' as objeto, count(*)::text as valor
  from information_schema.columns
 where table_schema='public' and table_name='coupons'
   and column_name in ('indicacao_premiado_em','indicacao_premiado_por')
union all
select 'checks de premio', count(*)::text from pg_constraint
 where conrelid='public.coupons'::regclass
   and conname in ('coupons_premiado_so_de_indicacao','coupons_premiado_coerente')
union all
select 'indice unico do indicador no perfil', count(*)::text from pg_class
 where relname = 'admin_profiles_indicador_unico';
