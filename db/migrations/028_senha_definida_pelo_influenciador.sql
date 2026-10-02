-- Quando o influenciador definiu a PRÓPRIA senha.
--
-- Nulo = ele ainda usa a senha inicial que o sistema gerou e o César mandou pelo
-- WhatsApp. Enquanto for nulo, o portal inteiro fica fechado -- contrato
-- incluído: primeiro ele cria a dele.
--
-- O motivo não é a força da senha, é a ASSINATURA. Até 02/10/2026 o César
-- definia a senha e mandava por mensagem. Se um aceite fosse contestado, a
-- primeira pergunta -- "quem mais sabia a senha?" -- teria como resposta "o
-- próprio contratante", o que enfraquece exatamente a prova que o contrato
-- existe para produzir.
--
-- Depois que ele define a dele, a senha que passou pelo WhatsApp não vale mais
-- e o César deixa de saber a senha dele.
--
-- O carimbo é escrito pelo SERVIDOR, em /api/portal/definir-senha, e só depois
-- de a troca dar certo. Carimbo que o próprio interessado pudesse emitir do
-- navegador não sustentaria nada.
--
-- Redefinir a senha pelo admin zera o carimbo: a senha volta a ser conhecida
-- por outra pessoa, então o ciclo recomeça.
--
-- Aplicada em 2026-10-02.

alter table public.admin_profiles
  add column if not exists senha_definida_at timestamptz;

comment on column public.admin_profiles.senha_definida_at is
  'Quando o influenciador trocou a senha inicial pela dele. Nulo = ainda está '
  'com a que o admin gerou, e o portal fica bloqueado até ele definir a sua.';

-- Quem já existe fica nulo de propósito. As duas contas de hoje (@caiiuxo e
-- @mariananavi) passam pela definição no próximo acesso -- as senhas delas
-- foram geradas por mim e repassadas por chat, exatamente o caso que esta
-- coluna existe para encerrar.
