-- 008_termos_no_influenciador.sql
-- Aplicada em 2026-08-18 no projeto uufrrhqrafxybdhkhvln
-- Ver docs/superpowers/specs/2026-08-18-termos-no-influenciador-design.md
--
-- Os termos descem da campanha para o influenciador. A campanha vira modelo de
-- preenchimento e rotulo de relatorio -- para de mandar no link.
--
-- O cupom passa a gravar o RETRATO do que valia quando nasceu. Sem isso,
-- renovar um influenciador reescreveria o passado: cupons antigos passariam a
-- mostrar o desconto novo, e a comissao ja paga seria recalculada pelo valor
-- novo.

alter table public.influencers
  add column if not exists discount_type          text,
  add column if not exists discount_value         numeric,
  add column if not exists validity_days          integer,
  add column if not exists coupon_title           text,
  add column if not exists coupon_description     text,
  -- Prazo da parceria. NULO = sem prazo. Nasce nulo para ninguem perder o link
  -- na conversao; definir prazo passa a ser ato deliberado.
  add column if not exists partnership_ends_at    date,
  -- A partir de quando contar vendas para a posicao da comissao. Renovar
  -- zerando a contagem grava a data da renovacao; renovar mantendo deixa nulo.
  add column if not exists commission_count_since date;

-- Retrato no cupom: o que valia no momento em que ele nasceu.
alter table public.coupons
  add column if not exists discount_type       text,
  add column if not exists discount_value      numeric,
  add column if not exists commission_per_sale numeric;

-- Copia os termos da campanha para dentro de cada influenciador.
update public.influencers i
   set discount_type      = c.discount_type,
       discount_value     = c.discount_value,
       validity_days      = c.validity_days,
       coupon_title       = c.coupon_title,
       coupon_description = c.coupon_description
  from public.campaigns c
 where c.id = i.campaign_id
   and i.discount_type is null;

-- Retrato dos cupons ja existentes, lido da campanha em que nasceram e da
-- comissao vigente do influenciador. E o melhor retrato possivel do passado.
update public.coupons cp
   set discount_type       = c.discount_type,
       discount_value      = c.discount_value,
       commission_per_sale = i.commission_per_sale
  from public.campaigns c, public.influencers i
 where c.id = cp.campaign_id
   and i.id = cp.influencer_id
   and cp.discount_type is null;

-- A partir daqui todo influenciador tem termos proprios.
alter table public.influencers
  alter column discount_type  set not null,
  alter column discount_value set not null,
  alter column validity_days  set not null;

alter table public.influencers drop constraint if exists influencers_discount_type_check;
alter table public.influencers add constraint influencers_discount_type_check
  check (discount_type = any (array['fixed'::text, 'percentage'::text]));
