-- 012_indices_cupons.sql
-- Aplicada em 2026-08-18 no projeto uufrrhqrafxybdhkhvln
--
-- A tela de Cupons buscava 500 linhas com tres juncoes e filtrava em memoria.
-- Com 8 cupons nao se nota; com o volume que vem dos anuncios, trava.
--
-- Os filtros passaram a ir para o banco, e estes indices sao o que faz isso
-- valer a pena.

create index if not exists coupons_created_at_idx on public.coupons (created_at desc);
create index if not exists coupons_status_idx on public.coupons (status);
create index if not exists coupons_influencer_idx on public.coupons (influencer_id);
create index if not exists coupons_verified_idx on public.coupons (verified);
create index if not exists coupons_paid_idx on public.coupons (paid);
