-- 002_require_invoice_for_verified.sql
-- Aplicada em 2026-08-05 no projeto uufrrhqrafxybdhkhvln
--
-- Sem nota fiscal nao ha prova da venda, e sem conferencia nao se paga o
-- influenciador. Esta constraint e o que fecha o circuito: nota fiscal e
-- documento rastreavel, amarrado a uma moto especifica. As outras regras
-- dificultam o uso indevido do cupom; esta amarra.

alter table public.coupons drop constraint if exists coupons_verified_requires_invoice;
alter table public.coupons add constraint coupons_verified_requires_invoice
  check (
    verified = false
    or (invoice_number is not null and length(btrim(invoice_number)) > 0)
  );
