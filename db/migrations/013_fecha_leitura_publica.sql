-- 013_fecha_leitura_publica.sql
-- Aplicada em 2026-08-18 no projeto uufrrhqrafxybdhkhvln
--
-- VULNERABILIDADE: coupons, influencers, partnerships e campaigns tinham
-- SELECT liberado para `public` -- ou seja, para qualquer um com a chave anon,
-- que vai no codigo que roda no navegador e e publica por natureza.
--
-- Consequencia real, testada antes da correcao: um visitante anonimo lia a
-- tabela de cupons INTEIRA, com nome, CPF, telefone e e-mail de todo cliente
-- que ja gerou cupom. E partnerships expunha comissao e fee de cada acordo.
--
-- E coupons ainda tinha INSERT liberado para `public`: dava para criar cupom
-- direto, driblando o rate limit e todas as validacoes da rota.
--
-- As paginas publicas (/c/CODIGO, /cupom/NUMERO e POST /api/coupons) passaram a
-- ler e gravar PELO SERVIDOR, com colunas controladas. O codigo foi ao ar antes
-- desta migracao -- apertar a regra primeiro derrubaria o site.

drop policy if exists coupons_select_public_by_number on public.coupons;
create policy coupons_select_authenticated on public.coupons
  for select to authenticated using (true);

drop policy if exists coupons_insert_public on public.coupons;
create policy coupons_insert_authenticated on public.coupons
  for insert to authenticated with check (true);

drop policy if exists influencers_select_public on public.influencers;
create policy influencers_select_authenticated on public.influencers
  for select to authenticated using (true);

drop policy if exists partnerships_select_public on public.partnerships;
create policy partnerships_select_authenticated on public.partnerships
  for select to authenticated using (true);

drop policy if exists campaigns_select_public on public.campaigns;
create policy campaigns_select_authenticated on public.campaigns
  for select to authenticated using (true);
