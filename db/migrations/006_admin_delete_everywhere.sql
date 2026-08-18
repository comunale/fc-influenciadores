-- 006_admin_delete_everywhere.sql
-- Aplicada em 2026-08-18 no projeto uufrrhqrafxybdhkhvln
--
-- O admin e superusuario, mas nao existia politica de DELETE para influencers,
-- campanhas nem vendedores -- entao ele simplesmente nao conseguia apagar nada
-- disso, nem pela tela nem pela API.
--
-- Integridade continua valendo: as FKs de coupons sao RESTRICT, entao quem tem
-- cupom vinculado NAO some. Isso e proposital: apagar um influenciador que ja
-- gerou venda destruiria o historico financeiro.

create policy influencers_delete_admin on public.influencers
  for delete to authenticated using (public.is_admin());

create policy campaigns_delete_admin on public.campaigns
  for delete to authenticated using (public.is_admin());

create policy sellers_delete_admin on public.sellers
  for delete to authenticated using (public.is_admin());

-- Furo achado na auditoria: qualquer usuario autenticado podia alterar as
-- configuracoes do sistema, inclusive o Lojista. Nao aparecia porque ele nao ve
-- a tela, mas pela API passava.
drop policy if exists "authenticated can update settings" on public.app_settings;
create policy app_settings_update_admin on public.app_settings
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Consistencia: estas duas checavam role='admin' na mao e ignoravam se a conta
-- estava ativa. is_admin() ja cobre os dois.
drop policy if exists campaigns_update on public.campaigns;
create policy campaigns_update on public.campaigns
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists influencers_update on public.influencers;
create policy influencers_update on public.influencers
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
