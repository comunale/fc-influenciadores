-- 010_parcerias.sql
-- Aplicada em 2026-08-18 no projeto uufrrhqrafxybdhkhvln
-- Ver docs/superpowers/specs/2026-08-18-parceria-como-entidade-design.md
--
-- A parceria vira entidade. Os termos saem de campos soltos do influenciador e
-- passam a viver num acordo com periodo proprio.
--
-- O influenciador guarda a IDENTIDADE, inclusive o coupon_code: o link esta na
-- bio e no story dele, e renovar nao pode troca-lo. Renovar troca para onde o
-- link olha, nao o link.

create table if not exists public.partnerships (
  id                     uuid primary key default gen_random_uuid(),
  influencer_id          uuid not null references public.influencers(id) on delete cascade,
  campaign_id            uuid references public.campaigns(id) on delete set null,

  status                 text not null default 'ativa',
  starts_at              date not null default current_date,
  ends_at                date,

  fee_amount             numeric not null default 0,
  fee_timing             text not null default 'inicio',

  commission_per_sale    numeric not null default 0,
  commission_starts_at   integer not null default 1,
  -- 'parceria' = a contagem recomeca neste acordo. 'historico' = continua do
  -- total do influenciador. Substitui o commission_count_since de 18/08.
  commission_counts_from text not null default 'parceria',

  payment_schedule       text not null default 'fim',

  discount_type          text not null,
  discount_value         numeric not null,
  validity_days          integer not null,
  coupon_title           text,
  coupon_description     text,

  created_at             timestamptz not null default now()
);

alter table public.partnerships drop constraint if exists partnerships_status_check;
alter table public.partnerships add constraint partnerships_status_check
  check (status = any (array['ativa'::text, 'encerrada'::text]));

alter table public.partnerships drop constraint if exists partnerships_fee_timing_check;
alter table public.partnerships add constraint partnerships_fee_timing_check
  check (fee_timing = any (array['inicio'::text, 'fechamento'::text]));

alter table public.partnerships drop constraint if exists partnerships_counts_from_check;
alter table public.partnerships add constraint partnerships_counts_from_check
  check (commission_counts_from = any (array['parceria'::text, 'historico'::text]));

alter table public.partnerships drop constraint if exists partnerships_schedule_check;
alter table public.partnerships add constraint partnerships_schedule_check
  check (payment_schedule = any (array['fim'::text, 'mensal'::text]));

alter table public.partnerships drop constraint if exists partnerships_discount_type_check;
alter table public.partnerships add constraint partnerships_discount_type_check
  check (discount_type = any (array['fixed'::text, 'percentage'::text]));

-- UMA ativa por influenciador. No banco, nao so na tela: duas ativas deixariam
-- o sistema sem saber qual desconto aplicar.
drop index if exists partnerships_uma_ativa_por_influencer;
create unique index partnerships_uma_ativa_por_influencer
  on public.partnerships (influencer_id) where status = 'ativa';

create index if not exists partnerships_influencer_idx on public.partnerships (influencer_id);

alter table public.partnerships enable row level security;

-- A landing publica le os termos sem login.
drop policy if exists partnerships_select_public on public.partnerships;
create policy partnerships_select_public on public.partnerships
  for select using (true);

drop policy if exists partnerships_write_admin on public.partnerships;
create policy partnerships_write_admin on public.partnerships
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

alter table public.coupons
  add column if not exists partnership_id uuid references public.partnerships(id);

-- Uma parceria ativa por influenciador, com os termos que ele tem hoje.
insert into public.partnerships (
  influencer_id, campaign_id, status, starts_at, ends_at,
  fee_amount, commission_per_sale, commission_starts_at,
  discount_type, discount_value, validity_days, coupon_title, coupon_description
)
select i.id, i.campaign_id, 'ativa', coalesce(i.created_at::date, current_date), i.partnership_ends_at,
       i.fee_amount, i.commission_per_sale, i.commission_starts_at,
       i.discount_type, i.discount_value, i.validity_days, i.coupon_title, i.coupon_description
from public.influencers i
where not exists (select 1 from public.partnerships p where p.influencer_id = i.id);

update public.coupons c
   set partnership_id = p.id
  from public.partnerships p
 where p.influencer_id = c.influencer_id
   and c.partnership_id is null;
