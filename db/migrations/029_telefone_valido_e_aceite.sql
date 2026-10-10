-- O aceite de comunicação passa a ser gravado.
--
-- A caixa "Aceito receber comunicações da FoxCycles por e-mail e WhatsApp"
-- existia no formulário desde sempre. O valor era guardado no estado do
-- componente e **nunca enviado** -- a pessoa marcava e aquilo se perdia no
-- caminho. Descoberto em 10/10/2026, quando o César perguntou como entrar em
-- contato com quem gerou cupom.
--
-- Os 44 cupons existentes ficam `false`. Não há registro de consentimento
-- deles, e inventar um seria pior do que não ter: a Meta exige opt-in para
-- disparo por template, e um registro falso não protegeria ninguém numa
-- reclamação. Falar com essas pessoas individualmente sobre o cupom que elas
-- pediram continua legítimo -- é a finalidade pela qual deram o telefone.
--
-- Aplicada em 2026-10-10.

alter table public.coupons
  add column if not exists accept_communications boolean not null default false;

comment on column public.coupons.accept_communications is
  'A pessoa autorizou receber mensagem da FoxCycles. A caixa existia no '
  'formulário desde sempre e o valor se perdia no caminho -- ninguém gravava. '
  'Passou a ser gravado em 10/10/2026. Quem veio antes fica false: não há '
  'registro de consentimento, e inventar um seria pior que não ter.';
