# Indique um Amigo — um braço novo sobre a mesma base

**Data:** 2026-09-02
**Status:** reescrita após validação contra o código e o banco. Aguardando revisão do César.
**Substitui** a primeira versão deste documento, commitada em `6ed63ca`. Os erros dela
estão listados no fim, porque foram informativos.

## O que é

Uma campanha: quem tem o cupom ganha R$300 de desconto na compra de uma moto, pode
indicar **um** amigo, e recebe **R$300 no PIX** se esse amigo comprar.

O César cravou a régua deste documento em 02/09, depois de ler a primeira versão:

> *"Influenciador é 1 coisa. Indique o Amigo é outra. Vamos usar a mesma base. Mas as
> mecânicas são diferentes."*

Ele estava certo, e a validação contra o código provou. A primeira versão desta spec
propunha uma tabela `origins` genérica, com um `kind`, servindo os dois braços. Fui
verificar onde as mecânicas se encostam e descobri que **elas quase não se encostam**:

| | Influenciador | Indique um Amigo |
|---|---|---|
| Termos vêm de | `partnerships` | não tem parceria |
| Link abre quando | `linkAtivo` = ativo **+** parceria vigente **+** contrato aceito | vaga livre no cupom que indicou |
| Recompensa | acumulativa, com "começa na Nª venda" | R$300, uma vez |
| Pagamento | por período, em fechamento | mesmo dia |
| Portal e contrato | sim | não |
| Cupons por código | muitos, para sempre | exatamente 1 |

Uma tabela `origins` obrigaria **todo consumidor a ramificar no `kind` mesmo assim**.
Não é abstração; é um `union` fingindo ser uma.

**Este documento faz o contrário: compartilha a espinha e separa as mecânicas.**

## A espinha compartilhada

O que os dois braços de fato usam igual — e que já existe, testado e no ar:

| Já existe | Serve aos dois |
|---|---|
| `coupons`: `coupon_number`, `customer_*`, `status`, `expires_at` | o cupom nominal |
| Validação no balcão com `seller_id` e loja | `/admin/validar` |
| `invoice_number` → `verified` (CHECK da 002) | conferência do Financeiro contra a NF |
| `campaigns`: `discount_type`, `discount_value`, `validity_days`, `coupon_title` | os termos da indicação |
| `/cupom/[numero]` com `@media print` | a impressão do balcão |
| `discount_type`/`discount_value` gravados no próprio cupom | `ValidarClient.tsx:325` já mostra desconto sem consultar parceria |

O último item é o mais feliz: **a tela do balcão já sabe exibir um cupom sem parceria.**
Ela lê o retrato gravado na criação, não o acordo.

## O que NÃO se compartilha, e por quê

**`commission_per_sale` e `coupons.paid` ficam de fora do braço novo.**

A spec de 24/08 (subsistema 2, fechamentos) decidiu, com todas as letras: *"Fechar um
lançamento é o que marca `coupons.paid`, e nada mais marca"* e *"nunca existe cupom pago
fora de um fechamento"*. Se a indicação escrever nesses campos, passam a existir **dois
escritores com regras diferentes no mesmo campo** — exatamente a divergência que aquela
spec existe para evitar.

`settlements` ainda não existe no banco (verificado: 18 tabelas em `public`, nenhuma
delas). Então isto não é um conserto: é não criar a dívida.

**A criação do cupom também não se compartilha.** `app/api/coupons/route.ts` exige
`influencer_code` no corpo e tira **todos** os termos da parceria, com cinco
`parceria!` seguidos — sem parceria a rota estoura em `parceria!.validity_days:83`. Não
existe segunda fonte de termos. O braço novo precisa de rota própria.

## As regras da campanha

Fechadas com o César em 02/09. A regra 8 da primeira versão saiu; a 7 mudou de forma.

| # | Regra |
|---|---|
| 1 | **1 cupom = 1 CPF = 1 nota fiscal = 1 uso.** O cupom é nominal. |
| 2 | Todo cupom dá **dois direitos**: comprar com R$300 off *(opcional)* e indicar **1** amigo *(opcional)*. Independentes. |
| 3 | O amigo ganha o **próprio cupom** — código próprio, CPF próprio, R$300 off. |
| 4 | Se o amigo comprar, o indicador recebe **R$300 no PIX** — tendo ele comprado ou não. |
| 5 | **Se o amigo não comprar, ninguém recebe nada.** |
| 6 | O cupom do amigo **não indica**. A corrente para ali. |
| 7 | Quem fechou o ciclo entra de novo **no lote seguinte**. |
| 8 | **Sem impresso, sem desconto.** O papel é grampeado na via da NF. |

### A regra 7 mudou porque o banco mandou

A primeira versão dizia "pode entrar de novo, sem limite de vezes", com uma regra
auxiliar de "1 cupom ativo por CPF". **As duas eram impossíveis.** Existe no banco:

```sql
CREATE UNIQUE INDEX coupons_customer_cpf_campaign_id_key
  ON public.coupons USING btree (customer_cpf, campaign_id)
```

Sem `WHERE`, sem filtro de status, as duas colunas NOT NULL. **Um CPF, um cupom, por
campanha, para sempre** — cupom vencido ou cancelado continua ocupando o par.

Em vez de brigar com esse índice, a campanha passa a ser o **lote**. "Entrar de novo" é
entrar no lote seguinte. Isso não é contorno: é a decisão do César de 02/09
— *"distribuição controlada"*, a FOX emitindo por lote — escrita no lugar onde o banco
já a sustenta. E o índice é **a única trava anti-repetição que sobrevive ao caminho
`service_role`** (ver abaixo). Trocá-lo por qualquer coisa mais frouxa seria abrir mão
da trava mais forte que o sistema tem.

Custo assumido: o César cria uma campanha por lote. Nada impede — `campaigns` não tem
UNIQUE em `name` nem constraint que atrapalhe.

## A fraude que o lote segura

No braço do influenciador o dinheiro vai para **pessoa conhecida, com contrato**. Aqui,
**qualquer CPF pode ser indicador**. Então o vendedor cadastra a cunhada como indicadora
e "indica" todo cliente que entra na loja — R$300 de PIX por venda que fecharia sozinha.

É a evolução do abuso documentado em `2026-07-28-cupom-express-anti-abuso-design.md`,
agora com dinheiro saindo em vez de comissão calculada.

**O que segura é o lote:** a cunhada tem um cupom por campanha, logo uma indicação por
campanha. O teto do abuso por lote é R$300 por CPF cúmplice. Sem o lote, é infinito.

O detector de telefone repetido (`lib/coupons/telefone-repetido.ts`) já varre a base
inteira e passa a cruzar os dois braços — o que é desejável, e vale conferir se gera
falso positivo demais antes de confiar nele.

## As travas: índice e CHECK, nunca trigger

Descoberta que reescreve a seção inteira da primeira versão.

Os dois triggers de `coupons` começam assim (`003:141-143` e `003:66-68`):

```sql
if auth.uid() is null or public.is_admin() then
  return new;
end if;
```

`auth.uid()` é NULL para `service_role`, e **as duas rotas que criam cupom usam
`createAdminClient()`** — inclusive o express, por onde passam as vendas reais. No
caminho pelo qual todo cupom nasce, **os guards desistem na primeira linha.**

Eles existem para barrar um lojista batendo direto na API REST com o token dele. Não
barram as rotas do próprio sistema. Logo:

| Regra | Mecanismo | Por quê |
|---|---|---|
| 1 amigo por cupom (regra 2) | `unique index (referred_by_coupon_id) where referred_by_coupon_id is not null and status in ('pending','used')` | índice não é contornável; e o `status` faz a vaga reabrir sozinha quando o cupom do amigo vence |
| 1 cupom por CPF por lote (regra 7) | o índice `(customer_cpf, campaign_id)` **que já existe** | nada a construir |
| Autoindicação | `referrer_cpf` desnormalizado + `CHECK (referrer_cpf is null or referrer_cpf <> customer_cpf)` | comparação entre linhas não cabe em CHECK; desnormalizar traz o dado para a mesma linha e o CHECK passa a valer sempre |
| 1 NF por cupom (regra 1) | `unique index (invoice_number) where invoice_number is not null` | **hoje não existe** — ver abaixo |

## Duas dívidas do que está no ar

Achadas nesta validação. Não são desta campanha, mas ela aumenta o preço das duas.

**1. `invoice_number` não tem unicidade nenhuma.** Nem índice, nem constraint. **A mesma
NF pode ser lançada em N cupons.** Hoje isso significa comissão dobrada numa venda só.
Com a indicação, uma única moto poderia carregar R$300 do A, R$300 do B e R$300 de PIX,
tudo na mesma nota, e o sistema aceitaria.

Fechar isso mexe no braço do influenciador. **Precisa do ok do César**, e de uma
consulta antes para saber se já existe NF repetida na base — criar o índice com
duplicata viva falha.

**2. O Financeiro pode reescrever o retrato de comissão do cupom que ele mesmo paga.**
O trigger `coupons_guard_non_admin_update` (`003:70-86`) lista campo a campo o que o
Financeiro não pode alterar. Ficaram de fora: `partnership_id`, `discount_type`,
`discount_value` e `commission_per_sale`. Sem indício de uso; é lacuna, não incidente.

Ambas entram no `docs/BACKLOG.md` como itens próprios, com dono do César.

## Modelo de dados

Nenhuma tabela nova. Cinco colunas em `coupons`.

| coluna | para quê |
|---|---|
| `kind` | `influenciador` \| `indicacao`. NOT NULL, default `influenciador`, backfill nas linhas existentes. É o discriminador que torna os índices parciais possíveis. |
| `referred_by_coupon_id` | auto-referência: qual cupom indicou este. `on delete restrict`, como as demais FKs de histórico financeiro (`006:8-10`). Hoje **não existe** auto-referência em `coupons`. |
| `referral_code` | o código pessoal de indicação do dono, UNIQUE. **Diferente do `coupon_number`** — senão o papel impresso do A vira o link dele, e quem vê o papel indica no lugar dele. |
| `referrer_cpf` | CPF do indicador, desnormalizado. Existe para o CHECK de autoindicação valer sem trigger, e para o Financeiro pagar sem consultar outra linha. |
| `referral_paid`, `referral_paid_at`, `referral_paid_by`, `referral_amount` | o PIX. Campos próprios, para não colidir com `paid`/`commission_per_sale`. |

Os campos de pagamento moram no cupom **do amigo** — a venda que disparou o prêmio.
Uma linha, uma venda, um pagamento.

`influencer_id` passa a aceitar NULL. É a mudança de maior risco do projeto, e a próxima
seção existe só por causa dela.

## `influencer_id` nulável: os três crashes

`influencer_id` é **NOT NULL** desde o schema base — não há migration que o crie, a
tabela é anterior à 001. Ao torná-lo nulável, o embed `influencers(...)` do PostgREST
passa a vir `null` (é left join: a linha não some, o objeto vira nulo).

**E o TypeScript não vai avisar.** Os tipos mentem em dois níveis:

- `lib/supabase/types.ts:201` declara `influencer_id: string`, não-nulável
- e a inferência **nem chega a rodar**: todos os consumidores passam string de select
  dinâmica, como o próprio repositório documenta em `lib/coupons/insert.ts:34`

Quem define a shape são tipos escritos à mão em cada componente. Não existe atalho de
compilador; a lista abaixo **é** a entrega.

**Crash — objeto nulo lido sem `?.`:**

| file:line | quem sofre |
|---|---|
| `app/admin/(protected)/validar/ValidarClient.tsx:333` | **o lojista, no balcão.** Tipo mentiroso em `:28`. Sem error boundary na rota: tela branca no meio da venda. |
| `components/CouponCard.tsx:192` | **o cliente**, na página pública que o QR aponta. Tipo mentiroso em `:13`; cast que apaga a checagem em `app/cupom/[coupon_number]/page.tsx:64` |
| `components/admin/ExpressSuccess.tsx:44` | só admin hoje, mas o tipo mente igual |

**Degradação silenciosa — mostra vazio:**

`CouponCard.tsx:127` e `:198` (título e descrição do voucher vêm da parceria: o cupom de
indicação abriria **com o topo em branco**), `CuponsRow.tsx:125` e `:234`,
`exportCupons.ts:24`.

**Contaminação de números — o que mistura sem quebrar:**

- `app/admin/(protected)/cupons/page.tsx:44` — o filtro por influenciador é **opcional**.
  No estado padrão a lista mistura os dois braços, e não há como isolar.
- `app/admin/(protected)/page.tsx:18-20` — os três `count: 'exact'` não filtram nada.
  "Cupons Gerados", "Vendas Realizadas", "Expirados" e a taxa de conversão passariam a
  somar indicação junto com influenciador.

**O que está seguro, e é bom saber:** tudo que parte de `influencers` em vez de
`coupons`. O portal (`portal_vendas()` filtra `c.influencer_id = meu_influencer_id()`, e
NULL nunca é igual), o Ranking de Influencers, a tela de influencers e o
`calcularComissao`. **O dinheiro do influenciador não corre risco de somar R$300 de
indicação.** É consequência da direção das queries, não de cuidado deliberado — mas vale.

## Ordem de execução

A ordem importa mais que o conteúdo. Nada de migration antes dos crashes.

1. **Corrigir os tipos e os três crashes** com `influencer_id` ainda NOT NULL. Nada muda
   de comportamento; o sistema fica pronto para o nulo.
2. **Separar os números do admin**: filtro por `kind` na lista, contadores do dashboard
   por braço. Ainda sem cupom de indicação existir.
3. **Migration**: `kind` com backfill, as quatro colunas de indicação, `influencer_id`
   nulável, os índices e o CHECK.
4. **Rota própria de criação** + página pública da indicação em `/i/[referral_code]`.
   Rota nova, e não generalizar `/c/[coupon_code]` — aquela é indexada por
   `influencers.coupon_code` e faz `notFound()`; um código de indicação lá daria 404.
5. **Balcão**: impressão do cupom e a busca por CPF (ver Perguntas em aberto).
6. **Financeiro**: fila do PIX do dia e o registro do pagamento.

## Fluxo do balcão

Menos coisa nova do que a primeira versão supunha. O fluxo de QR no balcão **já foi
entregue em 18/08** (`docs/BACKLOG.md`, item 4): o lojista perdeu o cadastro express, vê
o QR, e quem preenche é o cliente no próprio celular.

```
1. Pessoa chega com o código no celular                          [existe]
2. Vendedor digita em /admin/validar                             [existe]
3. Tela mostra nome, CPF, desconto, validade, status             [existe]
4. Vendedor confere o documento                                  [instrução na tela]
5. Seleciona o vendedor da venda                                 [existe]
6. IMPRIME o cupom                                               [novo]
7. Fecha a venda, escreve o nº da NF no papel, grampeia na via
8. Lança o invoice_number                                        [existe]
```

**O papel leva:** código, nome e CPF de quem usa, **só o primeiro nome** de quem indicou,
validade, a regra em uma linha, e campos em branco para NF e assinatura do vendedor.

**Não leva, e a tela do lojista também não mostra:** CPF do indicador. A primeira versão
desta spec desenhou o CPF do indicador na tela do balcão — errado, e contra a linha do
projeto, que em 19/08 decidiu que o influenciador vê **só o primeiro nome** do cliente.
Quem precisa do CPF é o Financeiro, na hora de pagar.

### O que o papel resolve, e o que não resolve

A primeira versão afirmou que o impresso fechava o furo do balcão. **Não fecha.** O furo
documentado em 28/07 é o vendedor escanear o QR com o próprio celular e preencher pelo
cliente — o cupom nasce legítimo, e imprimi-lo não muda nada. O detector daquilo é
telefone repetido, que **marca e não bloqueia**.

O que o papel resolve, e é menor: dá ao Financeiro um objeto físico amarrado à NF, então
a conferência deixa de depender de memória.

## Fluxo do PIX

Decidido pelo César em 02/09: **o Financeiro paga, ao validar a venda.** A loja valida e
lança a NF; o Financeiro roda o PIX. Dinheiro sai de um lugar só.

```
amigo compra        →  used                    (lojista)      existe
Financeiro confere  →  verified (exige NF)     (CHECK 002)    existe
Financeiro paga     →  referral_paid           campos novos
```

**Ninguém digita chave PIX.** O destino é o CPF do indicador, que já está na linha
(`referrer_cpf`). Perguntar a chave ao amigo criaria dois riscos: erro de digitação num
PIX que não volta, ou o amigo informar a própria chave e embolsar os R$300 do indicador.

Quando o CPF não estiver cadastrado como chave no banco do indicador, o PIX falha e o
Financeiro resolve na mão. É exceção visível, não silêncio.

## O que cai no colo de brinde

`gclid` e UTM gravados no cupom desde o clique. Quando o cupom vira `verified`, existe
**clique identificado + venda com NF e valor** — a conversão offline que falta na conta
de Google Ads da FOX.

Não é escopo **enviar** ao Google. É escopo **gravar** de um jeito que enviar depois seja
trivial.

## Respondidas pelo César em 08/09

**1. A NF sai no ato da venda? SIM, sempre.** O fluxo do PIX vale como está desenhado:
a loja valida e lança a NF, o Financeiro confere e paga no mesmo dia. Não é preciso
inventar gatilho alternativo para venda financiada.

**2. Busca por CPF no balcão? ENTRA.** Hoje um CPF digitado cai no ramo de influenciador
e volta "Código não encontrado". Como o cupom é nominal e a compra de uma moto demora,
quem esquecer o código não teria caminho nenhum.

**3. Unicidade de `invoice_number`? FECHADA em 08/09** (migration 025). Ele autorizou a
consulta antes: **nenhuma NF repetida na base** — 6 cupons com NF, de 8. O índice nasceu
sem conflito, e relançar uma NF existente passou a ser recusado pelo banco.

Conferido junto, para a pergunta 7 abaixo: **zero telefones repetidos em CPFs
diferentes** hoje. O detector não geraria falso positivo na base atual.

## Perguntas ainda em aberto — precisam do César

1. **O A indicou, o cupom do A venceu, e o B compra depois.** O A recebe? A proposta é
   que sim — o direito ao PIX segue o cupom do B, não a validade do cupom do A.
2. **A janela de verificação.** A spec de 28/07 registrou que "janela de verificação
   antes de pagar comissão" era a melhoria de maior impacto do programa. O PIX no mesmo
   dia vai na direção oposta. Decisão consciente?
3. **O tratamento fiscal do PIX recorrente** — do César, com o contador. Mesmo problema
   já aberto no contrato de influenciador: PF contra PJ, nota fiscal, o que é premiação e
   o que é comissão. Aqui é cliente comum, sem contrato. Levar **antes** de rodar.
4. **Telefone repetido cruzando os dois braços** — é o sinal que pegaria o
   vendedor-cunhada. Conferir o volume de falso positivo antes de confiar nele.

## Erros da primeira versão

Ficam registrados porque quase todos vieram de supor em vez de verificar, e a mesma
tentação vai voltar.

| Erro | O que era de verdade |
|---|---|
| Tabela `origins` genérica | as mecânicas quase não se encostam; o `kind` seria ramificado por todo consumidor |
| "1 cupom ativo por CPF" como trava nova | já existe `UNIQUE (customer_cpf, campaign_id)`, mais forte, e sem filtro de status |
| Regra 7 "sem limite de vezes" | impossível: o CPF queima na campanha para sempre |
| Autoindicação barrada por trigger | trigger é contornado pelo `service_role`, que é o caminho real de criação |
| "Zero código novo, reusa `paid` e `commission_per_sale`" | criaria dois escritores no mesmo campo, contra a decisão da spec de 24/08 |
| "O papel impresso fecha o furo do balcão" | o furo é o vendedor preencher pelo cliente; o papel não toca nisso |
| CPF do indicador na tela do lojista | contra a linha de privacidade do projeto; quem precisa é o Financeiro |
| "Busca por CPF no balcão [existe]" | não existe; CPF cai no ramo de influenciador e volta 404 |
| Armadilha "a trava do contrato bloquearia o braço novo" | **fantasma**: a checagem vive só no TypeScript (`contratoEmDia`), não em SQL |
| Armadilha "o portal mostraria cupom de indicação" | **fantasma**: `portal_vendas()` compara `influencer_id`, e NULL nunca é igual |

As duas últimas merecem nota: eu apontei duas armadilhas que não existiam e **subestimei
a única real** — `influencer_id` nulável, com três crashes e nenhuma ajuda do compilador.
