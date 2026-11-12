-- 034 — Pagar um lançamento vira UMA transação: settlement_pagar().
--
-- POR QUE EXISTE
--
-- A rota de pagar fazia duas escritas em chamadas separadas: marcava o
-- lançamento 'pago' e, depois, marcava coupons.paid nos cupons dele. O
-- PostgREST não tem transação, então a segunda podia falhar com a primeira já
-- gravada. E isso não é raro, é rotina: coupons_paid_requires_verified
-- (migration 005) é `check (paid = false or verified = true)`, e o Financeiro
-- pode desmarcar "Conferido" num cupom que já está dentro de um lançamento
-- 'aberto' (corrigir um número de NF, por exemplo). Aí o Pagar gravava o
-- lançamento como 'pago', o update do cupom era barrado pela constraint, e o
-- dinheiro ficava registrado como pago enquanto todas as telas seguiam
-- mostrando a comissão devida. Lançamento pago é imutável para quem não é
-- admin: o Financeiro não tinha como consertar.
--
-- O QUE FAZ
--
--   settlement_pagar(p_id, p_paid_at, p_forma, p_identificador, p_quem)
--     1. exige admin ou financeiro;
--     1b. recusa, com nome, pagamento sem data ou sem forma. A constraint
--        settlements_pago_exige_dados barraria de qualquer jeito, mas com
--        23514 e sem diagnóstico; e ninguém deve "ajudar" com
--        coalesce(p_forma, 'manual'), que gravaria um pagamento com forma
--        inventada;
--     2. reivindica o lançamento: UPDATE condicionado a status = 'aberto'
--        (zero linhas = não existe ou já foi pago/cancelado: recusa);
--     3. recusa comissão sem itens (zero itens só é legítimo em fixo e
--        restituição);
--     4. recusa, NOMEANDO os cupons, se algum item deixou de estar conferido;
--     5. marca paid / paid_at / paid_by nos cupons do lançamento.
--   Qualquer recusa levanta exceção e a função inteira desfaz: nada fica
--   gravado pela metade. Devolve quantos cupons foram marcados.
--
-- POR QUE `security definer` SEM BYPASS DE auth.uid()
--
--   * security definer NÃO zera auth.uid(): ele lê o claim do JWT da
--     requisição. Só a CHAVE service_role o deixa nulo. Logo a função, chamada
--     por .rpc() com a sessão do usuário, enxerga quem está pagando.
--   * A guarda é `is_admin() or is_finance()` e NÃO tem `auth.uid() is null`:
--     service_role e SQL Editor são recusados de propósito (Ruling 21). Os
--     triggers de imutabilidade da 031 continuam disparando normalmente
--     dentro da função, com a identidade de quem chamou.
--   * security definer serve para a função poder escrever em coupons e
--     settlements com o mesmo resultado para admin e financeiro; a regra de
--     QUEM pode é a guarda acima.
--
-- POR QUE SÓ `verified` É CONFERIDO DE NOVO (e não o resto de
-- settlement_motivo_recusa): o item JÁ congelou o valor e entrou no lançamento
-- pelo trigger da 031. O que pode mudar depois, por mão do Financeiro, é a
-- conferência, e `verified` é a única condição amparada por uma constraint
-- (coupons_paid_requires_verified) que abortaria a escrita de qualquer jeito.
-- Conferir aqui só troca o erro cru por um que nomeia os cupons. Não
-- "complete" a checagem com as demais condições.
--
-- p_quem é o nome de quem pagou (vai para coupons.paid_by, como a rota antiga
-- de cupons gravava). O instante, p_paid_at, vale para o lançamento e para os
-- cupons.
--
-- Verificação: scripts/verifica-034.sql (tudo em begin/rollback).
--
-- PARA DESFAZER. ATENÇÃO: a rota de pagar chama esta função; antes do drop, ela
-- precisa voltar ao commit 5d6ab15 (a versão de duas escritas). Entre o drop e
-- o redeploy TODA tentativa de pagar falha com PGRST202 (função não
-- encontrada), que a rota devolve como 500 genérico: pagar fica 100% fora do
-- ar, não degradado.
--
--   drop function if exists public.settlement_pagar(uuid, timestamptz, text, text, text);

create or replace function public.settlement_pagar(
  p_id uuid,
  p_paid_at timestamptz,
  p_forma text,
  p_identificador text,
  p_quem text
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_tipo text;
  v_itens integer;
  v_ruins text;
  v_marcados integer;
begin
  if not (public.is_admin() or public.is_finance()) then
    raise exception 'apenas admin ou financeiro';
  end if;

  if p_paid_at is null or length(btrim(coalesce(p_forma, ''))) = 0 then
    raise exception 'pagamento sem data ou forma';
  end if;

  update public.settlements
     set status = 'pago',
         paid_at = p_paid_at,
         forma = btrim(p_forma),
         identificador = nullif(btrim(coalesce(p_identificador, '')), '')
   where id = p_id and status = 'aberto'
  returning tipo into v_tipo;

  if not found then
    raise exception 'lancamento inexistente ou nao esta aberto';
  end if;

  select count(*) into v_itens from public.settlement_items where settlement_id = p_id;

  if v_tipo = 'comissao' and v_itens = 0 then
    raise exception 'lancamento de comissao sem itens';
  end if;

  select string_agg(c.coupon_number, ', ' order by c.coupon_number) into v_ruins
    from public.settlement_items i
    join public.coupons c on c.id = i.coupon_id
   where i.settlement_id = p_id and c.verified is not true;

  if v_ruins is not null then
    raise exception 'cupom nao conferido: %', v_ruins;
  end if;

  update public.coupons
     set paid = true, paid_at = p_paid_at, paid_by = p_quem
   where id in (select coupon_id from public.settlement_items where settlement_id = p_id);
  get diagnostics v_marcados = row_count;

  if v_marcados <> v_itens then
    raise exception 'cupons marcados (%) diferem dos itens (%)', v_marcados, v_itens;
  end if;

  return v_marcados;
end;
$fn$;

comment on function public.settlement_pagar(uuid, timestamptz, text, text, text) is
  'Paga um lancamento aberto e marca seus cupons como pagos, numa transacao so. '
  'Admin ou financeiro; sem bypass de auth.uid() nulo.';

revoke all on function public.settlement_pagar(uuid, timestamptz, text, text, text) from public, anon;
grant execute on function public.settlement_pagar(uuid, timestamptz, text, text, text) to authenticated;
