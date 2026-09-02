# Indique um Amigo — e a origem do cupom

**Data:** 2026-09-02
**Status:** aguardando revisão do César
**Subsistema novo** do fc-influenciadores

## O que é

Uma campanha: quem tem o cupom ganha R$300 de desconto na compra de uma moto, pode
indicar **um** amigo, e recebe **R$300 no PIX** se esse amigo comprar.

Só que a campanha não é o assunto principal deste documento. O assunto é o que ela
revelou.

Olhando a tabela `coupons` para desenhar a promoção, ficou claro que o sistema já
carrega `customer_cpf`, `invoice_number`, `seller_id`, `verified`, `paid` e
`commission_per_sale`. Traduzindo: **um cupom nominal, que aponta para uma nota
fiscal, validado por um vendedor de uma loja, conferido pelo Financeiro, e que paga
uma comissão para uma origem.**

Isso não é "sistema de influenciador". É um motor de programa de afiliados que tem
**um tipo de origem só**. O influenciador nunca foi o modelo — foi o primeiro caso.

Este subsistema generaliza a origem e usa o braço novo como o primeiro cliente dela.

Decidido pelo César em 02/09, sobre as alternativas de criar tabelas próprias para a
indicação ou uma aplicação separada: *"vamos de A"* — generalizar a origem no projeto
atual. A razão é operacional antes de ser técnica: são cinco lojistas no balcão. Uma
tela de validação, um pipeline financeiro e um lugar para auditar valem mais do que a
segurança de não encostar no que está no ar.

## As nove regras

Fechadas com o César em 02/09, nesta ordem, ao longo da conversa de desenho.

| # | Regra |
|---|---|
| 1 | **1 cupom = 1 CPF = 1 nota fiscal = 1 uso.** O cupom é nominal. |
| 2 | Todo cupom dá **dois direitos** ao dono: comprar com R$300 off *(opcional)* e indicar **1** amigo *(opcional)*. Independentes. |
| 3 | O amigo indicado ganha o **próprio cupom** — código próprio, CPF próprio, R$300 off. |
| 4 | Se o amigo comprar, o indicador recebe **R$300 no PIX** — tendo ele comprado ou não. |
| 5 | **Se o amigo não comprar, ninguém recebe nada.** O PIX sempre depende da venda. |
| 6 | O cupom do amigo **não indica**. A corrente para ali. |
| 7 | Quem fechou o ciclo **pode entrar de novo**: cupom novo, fluxo novo, direito novo de comprar e de indicar. Sem limite de vezes. |
| 8 | **Um CPF só tem 1 cupom ativo por vez.** |
| 9 | **Sem impresso, sem desconto.** O cupom impresso é grampeado na via da nota fiscal. |

### Como alguém entra de novo (regra 7)

Não existe botão de "renovar". O B que já comprou volta pela mesma porta de qualquer
outra pessoa: escaneia um flyer, clica num anúncio, se cadastra de novo — e nasce como
um A, com direito de comprar e de indicar um amigo.

A regra 8 é o que impede isso de virar acúmulo: o cupom anterior precisa estar fechado
— usado ou vencido — para o CPF poder pegar outro.

### Por que a regra 8 existe

Ela não veio do César — foi proposta e aceita em 02/09. A regra 7 diz que a pessoa
pode voltar quantas vezes quiser, e sem a regra 8 isso significa que alguém junta
cinco cupons ativos ao mesmo tempo e a distribuição deixa de ser controlada.

Com a regra 8, o motor gira o quanto quiser, mas **um ciclo por vez, por pessoa** — e
cada ciclo novo passa pelo sistema e deixa rastro. É o que faz "distribuição
controlada" continuar valendo depois que a campanha vira boca a boca.

### Por que a regra 9 é a trava mais forte

O sistema de influenciador tem um buraco conhecido: **o vendedor é rastro, não prova.**
Nada impede o balcão de usar o cupom como desconto para fechar uma venda que fecharia
de qualquer jeito.

O papel impresso grampeado na nota fecha esse buraco sem uma linha de código: sem papel
não há R$300, o vendedor não consegue dar desconto de cabeça, e o Financeiro confere
depois abrindo o bloco de notas. O cupom vira documento anexo à NF.

## Os três braços

A origem passa a ser tipada. O que muda entre os braços é quem é a origem e o que ela
ganha; o resto — cupom nominal, validação no balcão, NF, conferência, pagamento — é
compartilhado.

| Braço | Origem | Ganha | Contrato |
|---|---|---|---|
| `influenciador` | pessoa com audiência | comissão por venda, recorrente | sim, com aceite |
| `indicacao` | **outro cupom** (um cliente) | R$300 no PIX, uma vez por ciclo | não |
| `ponto` | ponto de origem — físico ou digital | nada — o retorno é saber de onde veio | não |

`ponto` cobre tanto a padaria da esquina quanto o link do anúncio: os dois são lugares
de onde a pessoa veio e que ninguém remunera. Um `kind` só, dois usos.

O braço `ponto` entra neste desenho porque o César vai imprimir arte em gráfica e
distribuir perto das lojas. Ele quase não custa nada depois que a origem é genérica, e
paga sozinho: **um QR por ponto de distribuição, não um QR para tudo.** Padaria da
esquina, posto, faculdade e condomínio com códigos diferentes, mesma arte, mesmo custo
de impressão. Em trinta dias o César sabe qual ponto se pagou.

### Flyer não é cupom

Distinção obrigatória, e a campanha inteira depende dela:

- O **flyer** é convite. Genérico, com QR, feito para ser fotografado e espalhado no
  WhatsApp — e tudo bem, é isso que se quer.
- O **cupom** é nominal. Nasce com nome e CPF depois do cadastro, e só existe impresso
  no balcão.

Se o flyer valesse R$300 na mão, uma foto dele no grupo do bairro custaria uma fortuna.
Do jeito acima, espalhar a foto ajuda: cada pessoa que escaneia vira um cadastro.

## Fluxo online

Três portas, uma página. A rota `/c/[codigo]` que já existe passa a resolver qualquer
origem pelo `code`, não só influenciador por `coupon_code`.

| Porta | URL | Origem |
|---|---|---|
| Anúncio | `/c/ADS-SET` + `gclid`/UTM | `ponto` |
| QR do flyer | `/c/PADARIA01` | `ponto` |
| Indicação | `/c/AM7K2P` | `indicacao` |

O formulário já pede o certo — nome completo, CPF, telefone, e-mail e aceite. Entram:
**loja de preferência** (select das cinco) e, invisíveis, `gclid`, UTMs e o código da
origem.

A loja de preferência não é enfeite: o lojista passa a saber quem está vindo, e o lead
cai no funil certo do Kommo.

Depois do cadastro a pessoa vê o código, a validade, a instrução de levar documento à
loja — e o botão de indicar **na hora**, não depois da compra. Os dois direitos da
regra 2 são independentes, e o momento de maior empolgação é esse.

### A vaga do amigo

O link do A vale para um amigo, e **quem se cadastrar primeiro leva**. A tela avisa
isso com todas as letras, porque o A pode mandar para três pessoas e dois vão ver "link
já usado".

A alternativa considerada foi o A **nomear** o amigo, informando telefone ou CPF, e o
link só funcionar para ele. Mais justo, mais atrito, mais campo no formulário. Ficou
de fora.

Junto vem uma regra de alívio: **se o cupom do amigo vencer sem uso, a vaga do A volta
a abrir.** Sem ela, um amigo que se cadastrou e sumiu mata a indicação do A para sempre.

## Fluxo do balcão

Quase nada muda. O que existe hoje está marcado.

```
1. Pessoa chega com o código no celular (ou só o CPF)
2. Vendedor abre /admin/validar → digita o código ou busca por CPF     [existe]
3. Tela mostra: nome · CPF · origem · validade · status                [existe]
4. Vendedor CONFERE O DOCUMENTO — CPF do cupom = CPF do RG             [instrução na tela]
5. Seleciona o vendedor da venda                                       [existe]
6. IMPRIME o cupom                                                     [novo]
7. Fecha a venda → escreve o nº da NF no papel → grampeia na via
8. Lança o invoice_number no sistema                                   [existe]
```

A impressão custa menos do que parece: `/cupom/[coupon_number]` **já tem `@media print`
e `#coupon-print`**. Faltam campos, não infraestrutura.

**O papel impresso leva:** código, nome e CPF de quem usa, **só o primeiro nome** de
quem indicou, validade, a regra em uma linha, e campos em branco para o número da NF e
a assinatura do vendedor.

**Não leva:** CPF nem chave PIX do indicador. Esse papel anda na mão de terceiro, e a
lição de 19/08 sobre não vazar dado de cliente vale igual no papel e na API.

## Fluxo do PIX

Decidido pelo César em 02/09: **o Financeiro paga, ao validar a venda.** A loja valida
e lança a NF; o Financeiro roda o PIX. Dinheiro sai de um lugar só.

```
amigo compra          →  used        (lojista, no balcão)      já existe
Financeiro confere    →  verified    (exige NF, migration 002)  já existe
Financeiro paga PIX   →  paid        (exige verified, migr. 005) já existe
```

**A parte financeira deste subsistema é zero código novo.** O pipeline está construído
desde a migration 001 e nunca foi usado assim. Os R$300 moram em `commission_per_sale`,
que já existe e já significa exatamente isso: quanto a origem ganha por esta venda.

### Ninguém digita a chave PIX

O desenho inicial pedia a chave ao amigo no balcão. Foi descartado em 02/09.

Se o vendedor pergunta ao B "qual o PIX do seu amigo?", nascem dois problemas: B digita
errado e o dinheiro vai para um estranho — PIX não volta — ou B informa a chave dele
mesmo e embolsa os R$300 do A.

**O sistema já tem o CPF do A**, porque ele se cadastrou para ganhar o cupom. A chave é
o CPF, derivada, e a tela do balcão mostra o destino pronto:

```
   Cupom FOX-9K2LM7  —  João Pedro Silva
   Indicado por:  Maria S.
   ─────────────────────────────────────
   PIX de R$300  →  CPF 123.456.789-00
                    Maria Souza
```

Não existe campo de chave PIX neste subsistema. O destino ser sempre o CPF do indicador
não é limitação: é o que dá rastro, e é o que fecha a autoindicação sozinho.

Quando o CPF não estiver cadastrado como chave no banco do indicador, o PIX falha e o
Financeiro resolve na mão. É a exceção, e ela é visível.

### A nota fiscal não atrasa o pagamento

A moto sai da loja com nota. A NF nasce no ato da venda, o vendedor lança o número na
mesma tela, e `used → verified → paid` cabe na mesma visita. As travas das migrations
002 e 005 continuam de pé sem atrasar ninguém.

## Modelo de dados

### Tabela `origins`

| campo | para quê |
|---|---|
| `id` | pk |
| `kind` | `influenciador` \| `indicacao` \| `ponto` |
| `code` | o que vai na URL `/c/[code]` e no QR |
| `label` | "@caiuxo" · "Maria Souza" · "Padaria da Esquina" |
| `influencer_id` | preenchido só quando `kind='influenciador'` |
| `parent_coupon_id` | o cupom do A, preenchido só quando `kind='indicacao'` |
| `campaign_id` | rótulo, como hoje |
| `reward_amount` | 300 na indicação, 0 no ponto |
| `max_coupons` | 1 na indicação, nulo (ilimitado) nos outros |
| `active` | liga e desliga a origem |

### Em `coupons`

Entram `origin_id`, `origin_kind`, `gclid`, `utm` (jsonb) e `store_name` (loja de
preferência). `influencer_id` passa a aceitar nulo.

**`origin_kind` é desnormalizado de propósito**, mantido por trigger a partir de
`origins`. Sem ele as travas deste subsistema são impossíveis: índice parcial no
Postgres não enxerga coluna de outra tabela, e as duas travas centrais precisam valer
**só** para `kind='indicacao'`. Um índice único sobre `origin_id` sem esse filtro
limitaria todo influenciador a um cupom só — exatamente o contrário do que o braço
antigo faz.

### A ordem das migrations

Ela importa, porque o influenciador está no ar:

1. Cria `origins`, com uma linha por influenciador existente, e adiciona
   `coupons.origin_id` já preenchido a partir de `influencer_id`. **Nada quebra** — o
   código antigo continua lendo `influencer_id`.
2. Varre o código para ler `origin_id` no lugar de `influencer_id`, e só então torna
   `influencer_id` opcional.
3. Sobe o braço `indicacao`, que grava `origin_id` com `influencer_id` nulo.

O braço `ponto` vem depois, e a esta altura é quase só cadastro e arte.

**Escopo do plano que sai desta spec:** os passos 1 a 3 — a origem genérica e o braço
`indicacao`. O braço `ponto` é a entrega seguinte, e depende de arte de gráfica que
ainda não existe.

## As travas — no banco, não na tela

Vale a regra de sempre do projeto: toda regra em duas camadas, allowlist na rota da API
**e** trava no Postgres. Esconder na tela nunca é trava.

| Regra | Onde mora |
|---|---|
| 1 amigo por cupom (regra 2) | índice único parcial sobre `origin_id`, `where origin_kind='indicacao' and status in ('pending','used')` — o que vence libera a vaga |
| 1 cupom ativo por CPF (regra 8) | índice único parcial sobre `customer_cpf`, `where origin_kind='indicacao' and status='pending'` |
| Autoindicação | trigger comparando o CPF do comprador com o do dono do `parent_coupon_id`, **barrando no cadastro** e não no balcão: a pessoa descobre na hora, não depois de ir até a loja |
| PIX só para o CPF do indicador | não existe campo de chave — o destino é derivado |

## Três armadilhas do que está no ar

**1. A trava do contrato (migration 024).** O link do influenciador só liga depois do
aceite. Se as origens novas passarem por esse mesmo teste, a campanha morre no primeiro
dia. `indicacao` e `ponto` precisam sair **explicitamente** desse caminho.

**2. `influencer_id` obrigatório em tudo.** Ao virar opcional, toda query com
`.select('*, influencers(...)')` passa a receber nulo. Isso se varre de uma vez, na
etapa 2 da ordem acima — não se descobre em produção.

Junto: o índice de "1 cupom ativo por CPF" **não pode** valer para o braço do
influenciador. Hoje o mesmo CPF pode pegar cupom de dois influenciadores, e mudar isso
caladamente quebraria comportamento vivo.

**3. O portal do influenciador.** Ele lê `coupons`. Com origem genérica, cupom de
indicação não pode aparecer no portal de ninguém. Vale a lição de 19/08 que está no
backlog: **RLS filtra linha, não coluna** — escrita de quem é de fora passa por
`security definer`, nunca por política de tabela.

## O que cai no colo de brinde

Cada cupom carrega `gclid` desde o clique no anúncio. Quando ele vira `verified`, existe
**um clique identificado somado a uma venda com nota fiscal e valor**.

Isso é exatamente a conversão offline que falta na conta de Google Ads da FOX. O
programa de indicação entrega o rastro que o `fc-ads` vem perseguindo, sem que ninguém
tenha construído nada para isso.

Não é escopo deste subsistema **enviar** essas conversões ao Google. É escopo **gravar**
o dado de um jeito que o envio depois seja trivial.

## Fora de escopo, com dono

Coisas reais que este documento não resolve, registradas aqui para não morrerem em
rodapé — o motivo pelo qual o `docs/BACKLOG.md` existe.

**O tratamento fiscal do PIX recorrente — do César, com o contador.** A regra 7 não põe
limite de vezes, então alguém organizado tira R$3.000 em PIX em poucos meses. Isso é
bom: é venda. Mas puxa o mesmo problema que já está aberto no contrato de influenciador
— PF contra PJ, nota fiscal, o que é premiação e o que é comissão. Lá existe pelo menos
contrato assinado; aqui é cliente comum recebendo PIX recorrente da FOX.

Não é motivo para mudar a mecânica. É motivo para levar ao contador **antes** de rodar,
e possivelmente definir um teto por CPF por ano. O modelo de dados suporta o teto; falta
o número, e o número é do contador.

**O ticket e a margem da moto.** O custo máximo por cupom emitido é R$900 — dois
descontos e um PIX — e só se as duas vendas acontecerem. Se ninguém comprar, custo zero.
O número foi tratado como aceitável na conversa, mas nunca foi conferido contra a margem
real.

**Aviso ao indicador.** Com o PIX saindo no mesmo dia, não há necessidade de notificar o
A para pedir chave — o problema que a notificação resolvia deixou de existir. Se um dia
o César quiser avisar o A de que o amigo comprou, isso é WhatsApp via API ou Kommo, e é
outro assunto.

**O nome do projeto.** `fc-influenciadores` deixa de descrever o que a pasta contém no
dia em que esta spec virar código. Renomear agora só criaria ruído; fica registrado que
o projeto virou um programa de afiliados com três braços.
