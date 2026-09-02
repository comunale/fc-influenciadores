# Backlog — o que falta

Lista única do que está pendente neste projeto. **Este arquivo existe porque as
pendências vinham sendo registradas no rodapé de planos antigos, na seção "fora
de escopo" — e é exatamente lá que as coisas morrem.** Em 18/08/2026 dois
pedidos do César quase se perderam assim.

Regra: ao terminar qualquer entrega, atualizar este arquivo. Ao começar
qualquer conversa, ler este arquivo.

Atualizado em 2026-09-02.

**Plano de execução dos itens 1, 3 e 4:** `docs/superpowers/plans/2026-08-18-pendencias-balcao-financeiro-parceria.md`. O item 2 (portal) segue bloqueado pela decisão sobre os dados migrados da planilha.

---

## Retomando o trabalho — leia isto primeiro

**Última sessão: 02/09/2026.** Sessão de desenho, **nenhuma linha de código tocada**.
Saiu uma spec, dois buracos novos no backlog e três perguntas que travam o próximo passo.

### O que aconteceu em 02/09

O César trouxe a promoção **"Indique um Amigo"**: R$300 de desconto na moto, o amigo
indicado também ganha R$300, e se o amigo comprar o indicador recebe R$300 no PIX.

Desenhamos, escrevi a spec — e o César leu e travou com a frase que virou a régua do
documento: *"Influenciador é 1 coisa. Indique o Amigo é outra. Vamos usar a mesma base.
Mas as mecânicas são diferentes."* Mandou validar tudo contra o código antes de construir.

Validei. **A primeira versão da spec tinha dez erros**, listados no fim da versão nova.
Ela foi reescrita do zero e é a que vale:
`docs/superpowers/specs/2026-09-02-indique-um-amigo-design.md` (commit `7f7d56f`; a
versão errada é a `6ed63ca`).

**Os três achados que mudam como se constrói neste projeto:**

1. **Os triggers de `coupons` não valem no caminho real.** Os dois começam com
   `if auth.uid() is null or public.is_admin() then return new`, e `auth.uid()` é NULL
   para `service_role` — que é o que as duas rotas de criação usam. Regra nova escrita
   como trigger nasce sem efeito. Ver a nota no fim deste arquivo.
2. **Os tipos mentem e o compilador não ajuda.** Tornar `influencer_id` nulável não gera
   nenhum erro de build; três crashes ficam para o runtime, o pior deles na tela do
   balcão (`ValidarClient.tsx:333`), sem error boundary.
3. **`UNIQUE (customer_cpf, campaign_id)` não olha status.** O CPF queima na campanha
   para sempre, mesmo com cupom vencido. Isso já custa venda hoje, no braço do
   influenciador. Na promoção nova, virou a solução: **a campanha é o lote.**

### O que trava o próximo passo — três perguntas para o César

Estão na spec, mas ficam aqui porque é aqui que se procura:

1. **A NF da moto sai no ato da venda?** Se for financiada e sair depois, "Financeiro
   paga ao validar" não funciona — `verified` exige NF por CHECK (migration 002).
2. **Autoriza consulta de leitura na base** para ver se já existe NF repetida? Sem isso
   não dá para criar o índice único de `invoice_number`.
3. **Busca por CPF no balcão** — hoje não existe; CPF digitado cai no ramo de
   influenciador e volta "Código não encontrado". Entra, ou a pessoa é obrigada a chegar
   com o código?

Respondidas as três, o próximo passo é o **plano de implementação** da spec.

---

### Sessão anterior — 19/08/2026

Tudo commitado, no ar e sincronizado. Nada pela metade. 110 testes passando, build limpo.

### O que entrou em 19/08

Foi um dia grande. Três entregas e um inventário:

1. **Portal do influenciador** (subsistema 4) — login próprio, números da
   parceria, link, vendas com só o primeiro nome do cliente, e troca de senha.
2. **Contrato com aceite eletrônico** (subsistema 6) — modelo versionado,
   texto congelado no aceite com data e IP, e o link só liga depois da assinatura.
3. **Inventário das parcerias** — o César achava ter 2 ativas; havia 18, todas
   sem data de fim e com o link no ar. 16 foram encerradas.

### O que o César precisa fazer

- **Testar o portal de ponta a ponta.** Os acessos existem: @caiiuxo
  (contato@caiuxo.com) e @mariananavi (mariananavi12@gmail.com). Entram em
  `/portal/login`. Eu testei a camada de dados no banco, não o login de verdade
  — não tenho, nem devo ter, a senha de ninguém.
- **Ler e ajustar o texto do contrato**, em Contratos → Editar modelo. As sete
  correções que fiz estão descritas na migration 023. **O texto merece revisão
  jurídica** — o sistema garante o processo, não o mérito das cláusulas.
- **A venda da @carolvilex** (cupom `FOX-ZE679B`, de 22/05, usada e nunca
  conferida) — ele vai ver com o Financeiro. Não mexer sem ele.
- **Forma de pagamento e nota fiscal** no contrato: PF e PJ têm tratamento
  tributário diferente, e o texto não diz nada. É conversa com o contador.

### O estado real do sistema agora

| | |
|---|---|
| Parcerias ativas | **2** — @caiiuxo e @mariananavi, as duas isentas de contrato |
| Parcerias encerradas | 16 |
| Contratos gerados | 0 — a trava vale para a **próxima** parceria criada |
| Modelo de contrato | versão 1, gravada |
| Acessos ao portal | 2, funcionando |

**A trava do link ainda não afeta ninguém.** As duas parcerias vigentes têm
`contract_required = false`, porque os links já estavam em bio e story. A
primeira parceria nova que o César criar vai nascer com contrato, e o link dela
só liga depois do aceite.

### Duas regras deste projeto que se pagam

**Escrita de quem é de fora nunca ganha política de tabela.** Passa por função
`security definer` que descobre o dono pela sessão. Aprendido do jeito difícil
em 19/08: RLS filtra **linha, não coluna**, e uma política "estreita" sobre os
cupons do influenciador teria entregado CPF e telefone dos clientes pela API.

**"O sistema começa agora"** — decidido pelo César. O que é anterior ao sistema
não aparece para o influenciador, nem como linha vazia. Simplificou o código:
sumiu uma função inteira do banco.


---

## Reestruturação como gerenciador de parcerias (decidida em 18/08)

O sistema virou uma plataforma de gestão de parcerias. Quebrado em 5 subsistemas,
cada um uma entrega que funciona sozinha:

| | Subsistema | Estado |
|---|---|---|
| 1 | **Parceria como entidade** | ✅ **concluído em 18/08** |
| 2 | Fechamentos e pagamentos | depende do 1 |
| 3 | Funil de prospecção | independente |
| 4 | Portal do influenciador | ✅ **concluído em 19/08** |
| 6 | Contrato e aceite | ✅ **concluído em 19/08** — 8 tasks, migrations 022 a 024 |

**Visibilidade no portal, decidida em 18/08:** a visibilidade é **por parceria**, não
por cupom. A parceria antiga aparece como uma linha fechada — *"Parceria Reinauguração
· encerrada"* — sem detalhe de vendas nem valores. A parceria nova mostra tudo.

Motivo: os dados antigos vieram de planilha e os R$ 3.000 do @caiiuxo **já foram pagos
por fora**. Mostrar em detalhe criaria cobrança sobre o que já foi acertado; esconder
por completo faria o influenciador achar que o histórico sumiu. A linha fechada resolve
os dois.
| 5 | Menus, páginas e papéis | cada entrega arruma a sua parte |

### Subsistema 1 — concluído em 18/08

Plano: `docs/superpowers/plans/2026-08-18-parceria-como-entidade.md` — as 8 tasks feitas.

18 parcerias ativas, uma por influenciador, índice único garantindo. Nenhum cupom sem
parceria. Os termos saíram do influenciador (migration 011) — não existe mais cópia
para alguém editar por engano.

Verificado ponta a ponta: landing HTTP 200 com R$ 300, cupom criado nasce vinculado à
parceria, página do cupom abre. E a comissão do @caiiuxo continua **R$ 3.000** depois de
tudo — o invariante que prova que nada foi reescrito.

---

## Pedidos do César ainda não construídos

### 1. ~~Dados bancários dos influenciadores~~ — ✅ FEITO em 18/08

**Estado:** entregue. Tabela própria `influencer_payment_info` com RLS só de admin e Financeiro, rota `/api/admin/influencer-payment` e painel na tela de Influencers.

Onde o Financeiro cadastra chave PIX / dados bancários de cada influenciador,
para conseguir pagar sem sair do sistema.

Cuidados já conhecidos:
- Dado sensível. Visível só para `admin` e `finance` — nunca para o Lojista.
- Precisa das três camadas de sempre: tela, allowlist na API e RLS no banco.

### 2. Portal do influenciador

**Pedido em:** 2026-08-18. Era o item 5, o maior de todos.
**Estado:** não existe nada. Sem rota, sem papel, sem tela.

O influenciador acessa e acompanha: quantos cupons foram gerados pelo link dele,
quem usou, quais foram validados na loja, quais o Financeiro aprovou, e quanto
de comissão isso soma.

Já decidido:
- **Login por e-mail e senha** (escolhido pelo César em 18/08, sobre link
  secreto e link mágico por e-mail).
- Se apoia em `calcularComissao` (`lib/commission.ts`), que já existe e já lê o
  retrato gravado em cada cupom.

**Pré-requisito que não pode ser ignorado:** os dados atuais vieram de uma
planilha e estão sendo acertados retroativamente. O portal **não pode** exibir
esse histórico sem antes existir forma de separar "registro migrado" de
"registro nascido no sistema" — senão um influenciador abre a tela e cobra um
valor que talvez já tenha sido pago por fora. Ver
`docs/superpowers/specs/2026-08-18-termos-no-influenciador-design.md`.

### 3. ~~Aviso de parceria perto do fim~~ — ✅ FEITO em 18/08

**Estado:** o `partnership_ends_at` já existe e já derruba o link na data. Falta
o **aviso antes**, para o César fechar as vendas e pagar a comissão a tempo.

O `pg_cron` já está instalado (migration 007) e serve exatamente para isso.
Não há canal externo (e-mail foi descartado), então o aviso vive dentro do
sistema — um bloco no Dashboard.

### 4. ~~Fluxo do QR code no balcão~~ — ✅ FEITO em 18/08

**Entregue em 18/08:** o Lojista perdeu o cadastro express (trava na rota, não só na
tela) e passou a ver o QR do link do influenciador — quem preenche é o cliente, no
próprio celular. Cupons com o mesmo telefone em CPFs diferentes aparecem marcados na
lista, olhando a base inteira e não só a página.

A *leitura* do QR já funcionava e ninguém sabia: o QR do cupom aponta para
`/admin/validar?codigo=FOX-XXXXXX` e a tela lê o parâmetro sozinha. Virou uma dica
na tela.

**Spec aprovada em 2026-07-28**, nunca implementada.
`docs/superpowers/specs/2026-07-28-cupom-express-anti-abuso-design.md`

Tira a geração do cupom das mãos do vendedor: ele digita o @ do influenciador, a
tela mostra um QR, e o **cliente** preenche no próprio celular.

Ataca o problema pela prevenção, no balcão. O que já foi construído (NF,
Conferido, Pago, vendedor nomeado) ataca pela auditoria, depois da venda. Os
dois se complementam — hoje o vendedor ainda cria e valida um cupom sozinho.

---

## Subsistema 4 — portal do influenciador, concluído em 19/08

Plano: `plans/2026-08-19-portal-do-influenciador.md`. Migrations 014, 016 e 017.

Decidido pelo César em 19/08:
- ele vê o **primeiro nome** do cliente, mais nada. O corte acontece no SQL.
- **dado bancário não aparece no portal**, nem para ler. É controle interno.

**Dois erros meus que o teste no banco pegou** — ficam registrados porque a
mesma armadilha vai reaparecer:

1. Dei ao influenciador uma política de leitura sobre os próprios cupons. RLS
   filtra **linha, não coluna**: com o token dele, `/rest/v1/coupons?select=*`
   devolveria CPF, telefone e e-mail dos clientes. A tela estava certa e a trava
   não. Corrigido tirando o acesso à tabela e pondo `portal_vendas()` no lugar.
2. A política escondia a parceria encerrada por completo, e a spec pedia que ela
   aparecesse como linha fechada. Resolvido com `portal_parcerias_encerradas()`,
   que devolve só as datas.

Regra que sai daqui: **toda vez que um papel novo entra no sistema, as políticas
existentes precisam ser relidas.** Elas foram escritas assumindo quem existia na
época.

## 15 parcerias encerradas em 19/08

O César acreditava ter 2 parcerias ativas. O sistema tinha **18**, todas sem
`ends_at` — e parceria sem prazo não vence, então eram 18 links no ar.

Vieram da planilha da reinauguração, que não tinha campo de data de fim. Das 18,
**15 nunca geraram um cupom**. O risco era real: um story antigo salvo ou um
print repassado geraria cupom válido, custando o desconto mais R$ 500 de comissão
de um acordo encerrado em maio.

Migration 018 encerrou as 15 (critério: ativa e sem nenhum cupom), com `ends_at`
retroativo a 23/05. Sobraram 3 ativas: @caiiuxo, @carolvilex e @mariananavi.

Em 19/08 o César confirmou que só @caiiuxo e @mariananavi seguem ativos, e a
@carolvilex foi encerrada também (migration 019). **Restam 2 parcerias ativas**,
as duas isentas de contrato.

### Pendências abertas que o encerramento não resolve

- **@carolvilex tem uma venda não conferida.** Cupom `FOX-ZE679B`, de 22/05,
  status *usado* — a moto saiu — mas o Financeiro nunca conferiu. Não conta para
  comissão e ninguém pagou. Parada há três meses. A parceria dela também tem
  R$ 500 de fee registrado, sem registro de pagamento.
- ~~O influenciador não consegue trocar a própria senha.~~ **Resolvido em 19/08.**
  O César liberou a escrita no portal com a condição de ficar separada do resto.
  A troca de senha vive em `/portal/senha` e não toca em tabela nenhuma nossa —
  a senha é do Auth do Supabase. O admin também redefine, pelo botão Portal na
  tela de Influencers, para o caso de esquecimento (não há e-mail de recuperação).
- **A @carolvilex tem venda e fee em aberto** — o César vai validar com o
  Financeiro. Não mexer sem ele.

## Pendências que o contrato cria em outras áreas

- **Restituição de fee** — dinheiro que ENTRA, o oposto do que o Financeiro faz
  hoje. Pertence ao subsistema 2; o 6 só registra a pendência.
- **Renovação desliga o link** até o novo contrato ser aceito. A tela de renovar
  precisa avisar antes de confirmar.
- **Forma de pagamento e nota fiscal** — o contrato não diz se o influenciador
  emite nota. PF e PJ têm tratamento tributário diferente. É conversa do César
  com o contador, não decisão técnica.

## "O sistema começa agora" — regra dada em 19/08

> *"A partir de agora a gente contabiliza. O que é passado é passado. O sistema
> começou agora com o Caio e com a Mariana."*

Encerra a discussão sobre o que o portal mostra do histórico: **nada**. Parceria
anterior não aparece nem como linha vazia. Migration 021 encerrou a parceria
antiga do @caiiuxo em 18/08 e abriu uma nova em 19/08 com os mesmos termos; as 6
vendas antigas ficam presas à parceria antiga e seguem no controle interno.

Vale para tudo daqui pra frente: número que o influenciador vê nasceu no sistema.

## Correção de segurança feita em 18/08

**As tabelas eram legíveis por qualquer um.** `coupons`, `influencers`,
`partnerships` e `campaigns` tinham SELECT liberado para `public` — para quem
tivesse a chave anon, que vai no código do navegador e é pública por natureza.

Testado antes de corrigir: um anônimo lia a tabela de cupons inteira, com **nome,
CPF, telefone e e-mail de todo cliente**. E `coupons` tinha INSERT liberado —
dava para criar cupom direto, driblando o rate limit.

Corrigido na migration 013: as páginas públicas passaram a ler pelo servidor e as
tabelas só respondem a quem está autenticado. Verificado com `role anon`: zero
linhas em todas, e o insert não passa.

**A ordem foi de propósito: código primeiro, política depois.** Apertar a regra
antes derrubaria o site — foi assim que o balcão ficou 12 dias fora do ar.

## Dívidas técnicas conhecidas

| O quê | Por quê importa |
|---|---|
| **Pagamento do fixo (`fee_amount`) não é controlado** | Existe o valor no contrato, mas nenhum campo diz se saiu. A tela mostra separado e não soma em "a pagar", para não dar número errado. Um `fee_paid_at` resolveria. |
| **19 testes de banco dormindo** | `tests/permissions.db.test.ts` só roda com `SUPABASE_DB_URL`. O César preferiu não usar a senha do Postgres de produção — decisão certa. Para ligar, o caminho é um projeto Supabase separado para testes. |
| **`campaigns.active` perdeu a função** | Desde 18/08 não derruba mais link. Vale avaliar se o campo ainda faz sentido ou se confunde. |
| **Marcar comissão como paga é cupom a cupom** | Com volume maior vai pedir um "pagar tudo deste influenciador". |
| **`coupons` tem policies de UPDATE/DELETE amplas** | Já restritas a admin/finance, mas vale reauditar quando o portal do influenciador entrar. |

---

## Dois buracos achados em 02/09, na validação do Indique um Amigo

Não são daquela campanha — são do que já está no ar. Ficam aqui, e não na spec, porque
a spec fecha e o backlog não. Ambos com dono do César.

### 1. `invoice_number` não tem unicidade — a mesma NF cabe em N cupons

Verificado no banco de produção: nenhum índice, nenhuma constraint, nenhum EXCLUDE.
`invoice_number` é `text` nullable, e a única regra é o CHECK da 002 (`verified` exige
NF preenchida).

Hoje isso significa que **uma venda pode gerar comissão duas vezes**. Com o Indique um
Amigo, a mesma moto poderia carregar R$300 de desconto do indicador, R$300 do amigo e
R$300 de PIX, tudo amarrado à mesma nota.

O conserto é um `unique index (invoice_number) where invoice_number is not null`. Antes
precisa de uma consulta de leitura: **criar o índice com duplicata viva falha**, e não
se sabe se já existe NF repetida na base.

### 2. O Financeiro pode reescrever o retrato de comissão do cupom que ele paga

`coupons_guard_non_admin_update` (`003:70-86`) lista campo a campo o que o Financeiro
não pode alterar: `customer_*`, `coupon_number`, `influencer_id`, `campaign_id`,
`expires_at`, `created_at`, `status`, `seller_id`.

**Ficaram de fora:** `partnership_id`, `discount_type`, `discount_value` e
`commission_per_sale` — justamente o retrato que a migration 008 criou para impedir que
renovar parceria reescrevesse comissão já paga. A policy de UPDATE deixa o Financeiro
passar, então o trigger é a única camada, e ela tem o buraco.

Sem indício de uso. É lacuna, não incidente. O conserto é somar os quatro campos à lista.

### E uma coisa que não é buraco, mas todo mundo vai supor errado

**Os dois triggers de `coupons` não valem no caminho real de criação.** Os dois começam
com `if auth.uid() is null or public.is_admin() then return new; end if;` (`003:141-143`
e `003:66-68`), e `auth.uid()` é NULL para `service_role` — que é o que
`createAdminClient()` usa, nas duas rotas que criam cupom.

Eles existem para barrar um lojista batendo direto na API REST com o token dele, e
nisso funcionam. Mas **regra nova escrita como trigger nesse padrão nasce sem efeito.**
O que sobrevive ao `service_role` é `unique index`, `check constraint` e FK.
