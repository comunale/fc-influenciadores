-- Uma nota fiscal, um cupom.
--
-- Até aqui `invoice_number` não tinha unicidade nenhuma -- nem índice, nem
-- constraint. A mesma NF podia ser lançada em N cupons, o que significa comissão
-- paga duas vezes pela mesma moto. Achado em 02/09/2026, validando a spec do
-- Indique um Amigo.
--
-- Com a indicação o preço sobe: uma única moto poderia carregar R$ 300 do
-- indicador A, R$ 300 do amigo B e R$ 300 de PIX, tudo amarrado na mesma nota.
--
-- Conferido antes de criar, com autorização do César em 08/09/2026: **nenhuma
-- NF repetida na base** (6 cupons com NF, de 8 no total). O índice nasce sem
-- conflito -- criar com duplicata viva teria falhado.
--
-- Parcial de propósito: cupom sem NF é o estado normal de quem ainda não foi
-- conferido, e string vazia entra na mesma conta que nulo.
--
-- Provado em transação com rollback: relançar uma NF existente em outro cupom é
-- recusado pelo índice.
--
-- Aplicada em 2026-09-08.

create unique index if not exists coupons_invoice_number_unico
  on public.coupons (invoice_number)
  where invoice_number is not null and btrim(invoice_number) <> '';
