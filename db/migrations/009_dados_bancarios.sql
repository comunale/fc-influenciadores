-- 009_dados_bancarios.sql
-- Aplicada em 2026-08-18 no projeto uufrrhqrafxybdhkhvln
--
-- Onde o Financeiro guarda como pagar cada influenciador.
--
-- TABELA SEPARADA de proposito. A tabela `influencers` e lida SEM login, porque
-- a landing publica /c/[coupon_code] precisa dela -- entao chave PIX na mesma
-- tabela ficaria alcancavel por qualquer visitante via API. Dado bancario nao
-- pode depender de alguem lembrar de filtrar coluna no select.
--
-- Um registro por influenciador: influencer_id e a chave primaria.

create table if not exists public.influencer_payment_info (
  influencer_id    uuid primary key references public.influencers(id) on delete cascade,
  payment_method   text,
  pix_key          text,
  bank_name        text,
  bank_agency      text,
  bank_account     text,
  payment_document text,
  payment_notes    text,
  updated_at       timestamptz not null default now(),
  updated_by       text
);

alter table public.influencer_payment_info drop constraint if exists payment_method_check;
alter table public.influencer_payment_info add constraint payment_method_check
  check (payment_method is null or payment_method = any (array['pix'::text, 'conta'::text]));

alter table public.influencer_payment_info enable row level security;

-- So admin e Financeiro. O Lojista nao le nem escreve -- nem pela tela, que ele
-- nao acessa, nem pela API.
drop policy if exists payment_info_select on public.influencer_payment_info;
create policy payment_info_select on public.influencer_payment_info
  for select to authenticated using (public.is_admin() or public.is_finance());

drop policy if exists payment_info_insert on public.influencer_payment_info;
create policy payment_info_insert on public.influencer_payment_info
  for insert to authenticated with check (public.is_admin() or public.is_finance());

drop policy if exists payment_info_update on public.influencer_payment_info;
create policy payment_info_update on public.influencer_payment_info
  for update to authenticated
  using (public.is_admin() or public.is_finance())
  with check (public.is_admin() or public.is_finance());

drop policy if exists payment_info_delete on public.influencer_payment_info;
create policy payment_info_delete on public.influencer_payment_info
  for delete to authenticated using (public.is_admin());
