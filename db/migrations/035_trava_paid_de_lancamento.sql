-- 035 — Financeiro não desmarca "Pago" de cupom que está em lançamento pago.
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
-- Aplicar DEPOIS da 031 (settlement_items) e da 034.
--
-- PARA DESFAZER (restaura o corpo da 003 exatamente):
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
    -- ESTAVA pago: settlement_pagar marca o lancamento 'pago' ANTES de marcar
    -- os cupons, e essa escrita (old.paid = false) precisa passar.
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
