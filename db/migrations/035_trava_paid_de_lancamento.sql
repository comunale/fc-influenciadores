-- 035 — Financeiro não desmarca "Pago" de cupom que está em lançamento pago.
--
-- ESTE ARQUIVO CARREGA DOIS OBJETOS:
--   1. coupons_guard_non_admin_update (a trava, corpo da 003 + um bloco);
--   2. settlement_pagar (corpo da 034 + uma recusa nomeada), porque a trava
--      nova interage com ele (ver "POR QUE settlement_pagar MUDA" abaixo).
--
-- POR QUE EXISTE
--
-- coupons_guard_non_admin_update (migration 003) libera `paid` para o
-- financeiro, e coupons_update_interno (014) dá UPDATE em qualquer cupom a
-- ele. A tela e a rota legada já não oferecem mais esse caminho (Task 6), mas
-- o banco continuava aberto: com a chave anon do navegador, um financeiro
-- consegue rodar `update coupons set paid = false where id = '<cupom de um
-- lançamento PAGO>'`. Nada barra: coupons_paid_requires_verified é
-- `paid => verified`, então LIMPAR paid é legal. O lançamento fica 'pago', o
-- cupom volta a parecer devido, o portal do influenciador mostra o dinheiro
-- como a receber, e o financeiro não conserta porque lançamento pago é
-- imutável para ele (031).
--
-- O QUE MUDA
--
--   No ramo do financeiro, DEPOIS da conferência das colunas proibidas e antes
--   do `return new`: recusa desfazer ou alterar o pagamento (paid de true para
--   false, ou mudar paid_at / paid_by de um cupom pago) quando o cupom tem item
--   num lançamento que NÃO está 'aberto'. A condição é `<> 'aberto'`, e não
--   `= 'pago'`, de propósito: falha fechada. Apagar paid_at/paid_by não recria
--   a divergência de dinheiro, mas apaga a prova do pagamento de um lançamento
--   congelado (e a tela do Cupons lê o pagamento de paid_at).
--   Todo o resto do corpo é o da 003, byte a byte: o curto-circuito de
--   `auth.uid() is null or is_admin()` no topo (decisão do dono: o admin PODE
--   e DEVE poder editar) e o ramo do lojista seguem iguais.
--
-- POR QUE SÓ QUANDO O CUPOM JÁ ESTAVA PAGO (old.paid)
--
--   settlement_pagar (034) primeiro marca o lançamento 'pago' e SÓ DEPOIS
--   marca coupons.paid = true, dentro da mesma função e com a identidade do
--   financeiro (security definer não zera auth.uid()). Nessa escrita o cupom
--   ainda tem old.paid = false, então ela passa; recusar também a mudança
--   false -> true derrubaria o próprio pagamento. A divergência que esta
--   migration fecha é a de LIMPAR ou ALTERAR a marca já gravada.
--
-- POR QUE settlement_pagar MUDA
--
--   O admin pode marcar "Pago" a mão num cupom que está num lançamento ABERTO
--   (decisão do dono, e a tela de Cupons permite). Se depois o financeiro paga
--   esse lançamento, settlement_pagar marca o lançamento 'pago' e roda
--   `update coupons set paid = true, paid_at = ..., paid_by = ...` sobre todos
--   os itens, sem olhar old.paid. Para esse cupom old.paid já é true e
--   paid_at/paid_by mudam: a trava acima dispara (o lançamento acabou de virar
--   'pago' na mesma transação) e o pagamento aborta com uma mensagem que
--   ninguém entende. Pior, de forma determinística: o financeiro nunca
--   consegue pagar aquele lançamento.
--
--   A saída é uma recusa NOMEADA no começo, antes de reivindicar o lançamento:
--   "cupom ja marcado como pago: <números>". Dá a quem paga um erro legível e
--   uma saída (desmarcar o cupom, que é do admin, e pagar). NÃO se resolve
--   filtrando `and paid = false` no update dos cupons: paid_at/paid_by
--   ficariam apontando para o pagamento manual, e o conferidor
--   v_marcados <> v_itens abortaria.
--
-- Aplicar DEPOIS da 031 (settlement_items) e da 034.
--
-- PARA DESFAZER (restaura o corpo da 003 e o corpo da 034, exatamente):
--
--   -- 1. a trava, corpo da 003:
--
--   create or replace function public.coupons_guard_non_admin_update()
--   returns trigger language plpgsql security definer set search_path = public as $$
--   begin
--     if auth.uid() is null or public.is_admin() then
--       return new;
--     end if;
--
--     if public.is_finance() then
--       if new.customer_name  is distinct from old.customer_name
--          or new.customer_cpf   is distinct from old.customer_cpf
--          or new.customer_email is distinct from old.customer_email
--          or new.customer_phone is distinct from old.customer_phone
--          or new.coupon_number  is distinct from old.coupon_number
--          or new.influencer_id  is distinct from old.influencer_id
--          or new.campaign_id    is distinct from old.campaign_id
--          or new.expires_at     is distinct from old.expires_at
--          or new.created_at     is distinct from old.created_at
--          or new.status         is distinct from old.status
--          or new.seller_id      is distinct from old.seller_id
--       then
--         raise exception 'Financeiro so pode alterar conferencia, pagamento e NF.';
--       end if;
--       return new;
--     end if;
--
--     -- lojista: so a validacao no balcao
--     if new.customer_name  is distinct from old.customer_name
--        or new.customer_cpf   is distinct from old.customer_cpf
--        or new.customer_email is distinct from old.customer_email
--        or new.customer_phone is distinct from old.customer_phone
--        or new.coupon_number  is distinct from old.coupon_number
--        or new.influencer_id  is distinct from old.influencer_id
--        or new.campaign_id    is distinct from old.campaign_id
--        or new.expires_at     is distinct from old.expires_at
--        or new.created_at     is distinct from old.created_at
--        or new.verified       is distinct from old.verified
--        or new.paid           is distinct from old.paid
--        or new.invoice_number is distinct from old.invoice_number
--     then
--       raise exception 'Apenas administradores podem alterar os dados do cupom.';
--     end if;
--
--     -- Validacao no balcao exige vendedor da propria loja.
--     if new.status = 'used' and old.status is distinct from 'used' then
--       if new.seller_id is null then
--         raise exception 'Escolha o vendedor antes de validar o cupom.';
--       end if;
--       if not public.seller_ok_for_caller(new.seller_id) then
--         raise exception 'Vendedor invalido para esta loja.';
--       end if;
--     end if;
--
--     -- Trocar o vendedor depois da validacao e coisa de admin.
--     if new.seller_id is distinct from old.seller_id
--        and old.status = 'used'
--     then
--       raise exception 'Apenas administradores podem trocar o vendedor de um cupom ja validado.';
--     end if;
--
--     return new;
--   end;
--   $$;
--
--   -- 2. settlement_pagar, corpo da 034:
--   create or replace function public.settlement_pagar(
--     p_id uuid,
--     p_paid_at timestamptz,
--     p_forma text,
--     p_identificador text,
--     p_quem text
--   )
--   returns integer
--   language plpgsql
--   security definer
--   set search_path to 'public'
--   as $fn$
--   declare
--     v_tipo text;
--     v_itens integer;
--     v_ruins text;
--     v_marcados integer;
--   begin
--     if not (public.is_admin() or public.is_finance()) then
--       raise exception 'apenas admin ou financeiro';
--     end if;
--
--     if p_paid_at is null or length(btrim(coalesce(p_forma, ''))) = 0 then
--       raise exception 'pagamento sem data ou forma';
--     end if;
--
--     update public.settlements
--        set status = 'pago',
--            paid_at = p_paid_at,
--            forma = btrim(p_forma),
--            identificador = nullif(btrim(coalesce(p_identificador, '')), '')
--      where id = p_id and status = 'aberto'
--     returning tipo into v_tipo;
--
--     if not found then
--       raise exception 'lancamento inexistente ou nao esta aberto';
--     end if;
--
--     select count(*) into v_itens from public.settlement_items where settlement_id = p_id;
--
--     if v_tipo = 'comissao' and v_itens = 0 then
--       raise exception 'lancamento de comissao sem itens';
--     end if;
--
--     select string_agg(c.coupon_number, ', ' order by c.coupon_number) into v_ruins
--       from public.settlement_items i
--       join public.coupons c on c.id = i.coupon_id
--      where i.settlement_id = p_id and c.verified is not true;
--
--     if v_ruins is not null then
--       raise exception 'cupom nao conferido: %', v_ruins;
--     end if;
--
--     update public.coupons
--        set paid = true, paid_at = p_paid_at, paid_by = p_quem
--      where id in (select coupon_id from public.settlement_items where settlement_id = p_id);
--     get diagnostics v_marcados = row_count;
--
--     if v_marcados <> v_itens then
--       raise exception 'cupons marcados (%) diferem dos itens (%)', v_marcados, v_itens;
--     end if;
--
--     return v_marcados;
--   end;
--   $fn$;

create or replace function public.coupons_guard_non_admin_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  if public.is_finance() then
    if new.customer_name  is distinct from old.customer_name
       or new.customer_cpf   is distinct from old.customer_cpf
       or new.customer_email is distinct from old.customer_email
       or new.customer_phone is distinct from old.customer_phone
       or new.coupon_number  is distinct from old.coupon_number
       or new.influencer_id  is distinct from old.influencer_id
       or new.campaign_id    is distinct from old.campaign_id
       or new.expires_at     is distinct from old.expires_at
       or new.created_at     is distinct from old.created_at
       or new.status         is distinct from old.status
       or new.seller_id      is distinct from old.seller_id
    then
      raise exception 'Financeiro so pode alterar conferencia, pagamento e NF.';
    end if;

    -- Cupom de lancamento fechado nao tem o pagamento desfeito nem apagado
    -- pela mao do financeiro (paid, paid_at, paid_by). So quando o cupom JA
    -- ESTAVA pago. settlement_pagar marca o lancamento 'pago' ANTES de marcar os
    -- cupons; para cupom com old.paid = false essa escrita passa. Cupom que ja
    -- estava pago (marcado a mao pelo admin) faria esta trava disparar ali, e
    -- por isso settlement_pagar o recusa ANTES, pelo nome (ver abaixo).
    if old.paid
       and (new.paid is distinct from old.paid
            or new.paid_at is distinct from old.paid_at
            or new.paid_by is distinct from old.paid_by)
       and exists (
         select 1
           from public.settlement_items i
           join public.settlements s on s.id = i.settlement_id
          where i.coupon_id = old.id
            and s.status <> 'aberto'
       )
    then
      raise exception 'Cupom de lancamento fechado (pago ou cancelado) nao pode ter o pagamento desfeito ou alterado.';
    end if;

    return new;
  end if;

  -- lojista: so a validacao no balcao
  if new.customer_name  is distinct from old.customer_name
     or new.customer_cpf   is distinct from old.customer_cpf
     or new.customer_email is distinct from old.customer_email
     or new.customer_phone is distinct from old.customer_phone
     or new.coupon_number  is distinct from old.coupon_number
     or new.influencer_id  is distinct from old.influencer_id
     or new.campaign_id    is distinct from old.campaign_id
     or new.expires_at     is distinct from old.expires_at
     or new.created_at     is distinct from old.created_at
     or new.verified       is distinct from old.verified
     or new.paid           is distinct from old.paid
     or new.invoice_number is distinct from old.invoice_number
  then
    raise exception 'Apenas administradores podem alterar os dados do cupom.';
  end if;

  -- Validacao no balcao exige vendedor da propria loja.
  if new.status = 'used' and old.status is distinct from 'used' then
    if new.seller_id is null then
      raise exception 'Escolha o vendedor antes de validar o cupom.';
    end if;
    if not public.seller_ok_for_caller(new.seller_id) then
      raise exception 'Vendedor invalido para esta loja.';
    end if;
  end if;

  -- Trocar o vendedor depois da validacao e coisa de admin.
  if new.seller_id is distinct from old.seller_id
     and old.status = 'used'
  then
    raise exception 'Apenas administradores podem trocar o vendedor de um cupom ja validado.';
  end if;

  return new;
end;
$$;

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
  v_ja_pagos text;
  v_marcados integer;
begin
  if not (public.is_admin() or public.is_finance()) then
    raise exception 'apenas admin ou financeiro';
  end if;

  if p_paid_at is null or length(btrim(coalesce(p_forma, ''))) = 0 then
    raise exception 'pagamento sem data ou forma';
  end if;

  -- Cupom do lancamento que JA esta marcado como pago (o admin marcou a mao na
  -- tela de Cupons) nao pode ser pago de novo por aqui: o update de coupons
  -- abaixo reescreveria paid_at/paid_by e a trava desta migration (que protege
  -- cupom pago de lancamento fechado) abortaria tudo com um erro que ninguem
  -- le. Recusa nomeando os cupons, ANTES de reivindicar o lancamento. So olha
  -- lancamento 'aberto': pagar de novo um lancamento ja pago segue recebendo
  -- a mensagem de "nao esta aberto".
  select string_agg(c.coupon_number, ', ' order by c.coupon_number) into v_ja_pagos
    from public.settlements s
    join public.settlement_items i on i.settlement_id = s.id
    join public.coupons c on c.id = i.coupon_id
   where s.id = p_id and s.status = 'aberto' and c.paid is true;

  if v_ja_pagos is not null then
    raise exception 'cupom ja marcado como pago: %', v_ja_pagos;
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
