-- Dois achados da auditoria de 02/10/2026, depois que o César ligou a RLS em
-- `card_marcas` e o alerta crítico do Supabase caiu.
--
-- 1) A VIEW `card_metrics` andava por fora da trava da tabela.
--
--    `card_eventos` recusa o anon. A view é SECURITY DEFINER: roda com os
--    privilégios de quem a criou, não de quem consulta. Medido com sessão
--    anônima: a tabela devolveu "negado" e a view devolveu 17 linhas --
--    cliques de whatsapp, catálogo, maps e visitas, por cartão.
--
--    Não é dado pessoal, é métrica de negócio. Mas é o padrão clássico: a
--    fechadura na tabela e a janela aberta do lado.
--
--    Conferido antes de revogar: as duas leituras em
--    fc-digitalcard/lib/store.ts (getMetricas, getMetricasMarca) usam
--    supabaseAdmin() -- service role, que ignora grant e RLS.
--
-- 2) As FUNÇÕES do portal eram executáveis pelo anon.
--
--    O `revoke ... from public` das migrations 022 e 024 não bastou: no
--    Supabase o anon recebe EXECUTE por um grant próprio, não herdado de
--    PUBLIC. Descoberto pelo advisor, não por teste -- vale anotar.
--
--    Explorável? Não. As guardas internas seguraram, e foi para isso que
--    foram escritas. Medido com sessão anônima: portal_vendas,
--    portal_meu_contrato e portal_meus_dados devolveram 0 linhas
--    (meu_influencer_id() é NULL, e NULL nunca é igual a nada);
--    portal_salvar_meus_dados recusou com "sem permissao";
--    registrar_descumprimento recusou com "apenas admin".
--
--    Mesmo assim a porta sai: o portal só é usado por quem está logado. A
--    guarda interna continua sendo a trava; esta é a tranca de fora.
--
-- Aplicada em 2026-10-02.

revoke select on public.card_metrics from anon, authenticated;

revoke execute on function public.portal_vendas() from anon;
revoke execute on function public.portal_meu_contrato() from anon;
revoke execute on function public.portal_meus_dados() from anon;
revoke execute on function public.portal_salvar_meus_dados(text,text,text,text) from anon;
revoke execute on function public.portal_aceitar_contrato(text,text) from anon;
revoke execute on function public.registrar_descumprimento(uuid) from anon;

-- Os auxiliares de política (is_admin, is_finance, eh_interno,
-- meu_influencer_id, caller_store_name, seller_ok_for_caller) ficam como estão,
-- DE PROPÓSITO: eles são avaliados DENTRO das policies, e tirar o EXECUTE do
-- anon trocaria um resultado vazio por um erro quando o anon tocasse numa
-- tabela protegida. Para o anon todos devolvem falso ou nulo, que é o
-- comportamento correto.
