-- 005_paid_requires_verified.sql
-- Aplicada em 2026-08-18 no projeto uufrrhqrafxybdhkhvln
--
-- "Dinheiro so sai depois da conferencia" estava so na tela: o checkbox Pago
-- ficava desabilitado enquanto Conferido nao fosse marcado. Quem chamasse a API
-- direto contornava. Todas as outras regras deste sistema valem em tres camadas
-- (tela, API e banco) -- esta estava fora do padrao.
--
-- Combinada com coupons_verified_requires_invoice, a corrente fica fechada
-- no banco: sem NF nao confere, e sem conferir nao paga.

alter table public.coupons drop constraint if exists coupons_paid_requires_verified;
alter table public.coupons add constraint coupons_paid_requires_verified
  check (paid = false or verified = true);
