-- 011_limpa_termos_do_influencer.sql
-- Aplicada em 2026-08-18 no projeto uufrrhqrafxybdhkhvln
--
-- Os termos vivem na parceria desde a migration 010. Manter copia no
-- influenciador convida alguem a editar o lugar errado e nao surtir efeito --
-- inclusive eu, numa sessao futura.
--
-- Conferido antes de aplicar: nenhum ponto do codigo le estes campos.

alter table public.influencers
  drop column if exists discount_type,
  drop column if exists discount_value,
  drop column if exists validity_days,
  drop column if exists coupon_title,
  drop column if exists coupon_description,
  drop column if exists partnership_ends_at,
  drop column if exists commission_count_since,
  drop column if exists fee_amount,
  drop column if exists commission_per_sale,
  drop column if exists commission_starts_at;
