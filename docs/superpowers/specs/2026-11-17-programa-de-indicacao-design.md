# Programa de Indicação — qualquer pessoa indica, a FOX premia por fora

**Data:** 2026-11-17
**Status:** rascunho, aguardando revisão do César.
**Substitui** `2026-09-02-indique-um-amigo-design.md`, por decisão dele em 17/11.

## O que é

Uma pessoa — qualquer uma, não precisa ser influenciador nem ter comprado — entra numa
landing page, preenche um formulário e sai de lá com **um link e um número de cupom**.
Quem comprar usando aquele link ou cupom leva **R$ 300 de desconto**; ela ganha
**R$ 200**. A ferramenta registra, mede e **exporta**: a premiação o César faz por fora.

> *"É um programa de indicação. A questão é que preciso ter tudo isso na ferramenta para
> controlar, gerar relatórios, medir eficácia."* — César, 17/11

## Por que substitui o Indique um Amigo

A spec de 02/09 descrevia outra mecânica: o indicador tinha de ser um cliente **que já
possuía cupom**, podia indicar **um** amigo, e recebia R$ 300 no PIX. A decisão de 17/11
abre o programa a qualquer pessoa, torna as indicações ilimitadas (com teto
configurável, ver abaixo) e troca o PIX automático por exportação.

Dois programas de indicação ao mesmo tempo confundiriam quem participa e dobrariam o que
há para manter. A de setembro é arquivada; o que ela descobriu sobre o banco **continua
valendo** e está reaproveitado aqui.

## Decisões do César (17/11)

| # | Decisão |
|---|---|
| 1 | Cadastro **sai funcionando na hora** — link e cupom imediatos, sem aprovação prévia |
| 2 | Aberto a **qualquer pessoa**; não é influenciador e não entra na lista deles |
| 3 | Formulário pede **nome, telefone, CPF, sexo, data de nascimento e senha escolhida**, mais **aceite de LGPD** para comunicações e publicidade |
| 4 | Acesso à área pessoal: **login por CPF + senha que ela escolhe**. Recuperação manual por `marketing@foxcycles.com.br` |
| 5 | Ela tem **área própria**: quantos clicaram, quantos compraram, quanto tem a receber |
| 6 | Landing e cadastro ficam **dentro do fc-influenciadores**, não no site institucional |
| 7 | Mede **cliques no link e cupons gerados**, não só vendas — é o que diz quem divulgou e não converteu |
| 8 | Premiação **por fora**: a ferramenta exporta a lista, o César paga |
| 9 | **Limite por indicador é configurável**, editável por `admin` e `finance`, e pode ser desligado. O limite conta **usos** (cupons efetivamente usados na compra), não cupons gerados |
| 10 | **Só quem quer indicar precisa de cadastro.** O comprador não vira membro: ele informa **nome, CPF e telefone** para levar o desconto, e esse uso fica **vinculado a quem indicou** |
| 11 | O cupom da indicação **não tem vencimento**. O benefício é **encerrável pela empresa** a qualquer momento, por decisão dela |
| 12 | **Sexo e data de nascimento** entram com uma finalidade declarada: **gerar o cartão de benefícios** |
| 13 | Papéis: `admin` é o César; `finance` é o gestor; o **vendedor** (`moderator`, que na tela é Lojista) valida os usos no balcão; o membro do programa é a quarta ponta, com acesso só à área dele |
| 14 | **Batido o teto, o link para de gerar cupom.** Não existe cupom que dá desconto sem premiar: ou vale para os dois, ou não nasce |
| 15 | **O teto nasce desligado.** O campo existe, o padrão é sem limite, e o César liga quando vir necessidade |
| 16 | O **cartão de benefícios é uma página da ferramenta**, dentro da área da pessoa, com o nome dela, o número do cupom e o link |

## A espinha compartilhada — o que já existe e não se refaz

| Já no ar | Serve ao programa |
|---|---|
| `/c/[codigo]` — link público que gera cupom nominal | é o link da indicação |
| `coupons`: `coupon_number`, `customer_*`, `status`, `expires_at` | o cupom do comprador |
| Validação no balcão com vendedor e loja | `/admin/validar`, sem mudança |
| `invoice_number` → `verified` | conferência do Financeiro contra a NF |
| `campaigns`: `discount_value`, `coupon_title` | os termos do programa (`validity_days` fica sem valor: decisão 11) |
| `/cupom/[numero]` com impressão | o papel grampeado na NF |
| Aceite com data, hora e IP (contratos) | mesmo padrão para o aceite de LGPD |

## O que é novo

1. **Landing pública** explicando o programa, dentro desta aplicação.
2. **Autocadastro** — primeira porta de entrada pública que cria conta neste sistema.
3. **Tabela própria do indicador.** Não é `influencers`: não tem parceria, não tem
   contrato, não tem portal de influenciador, e os termos são do programa, não
   negociados. A decisão do César de 02/09 — *"mesma base, mecânicas diferentes"* —
   continua valendo.
4. **Registro de clique.** Hoje o sistema só sabe que um cupom nasceu; não sabe quantas
   pessoas abriram o link e desistiram. É o que mede eficácia.
5. **Área da pessoa**, com login por CPF.
6. **Exportação** de quem tem quanto a receber.
7. **Cartão de benefícios** — a página da área dela com nome, número do cupom e link.

## O comprador — o que ele dá, e o que o César exporta

O comprador **não entra no programa**: ele só compra com desconto. Para levar os
R$ 300 ele informa **nome, CPF e telefone** — exatamente os três campos que o link
público já pede hoje — e o cupom nasce no nome dele.

O vínculo com quem indicou é a espinha de tudo o que vem depois:

| Momento | O que o sistema grava |
|---|---|
| A pessoa abre o link | clique contado, com data e hora |
| A pessoa preenche e gera o cupom | cupom nominal (nome, CPF, telefone) + **o indicador** |
| O vendedor valida no balcão | quem validou, qual loja, quando |
| O Financeiro confere a NF | número da nota, `verified` |

A **validação do uso** é a tela de balcão que já existe (`/admin/validar`): o vendedor
confirma que a venda aconteceu. O que o programa acrescenta é a coluna do indicador em
tudo isso — e é ela que faz a exportação responder "quem indicou, quem comprou, quanto
pagar".

## As travas, e por que elas são índice e CHECK

A spec de setembro descobriu, validando contra o código, que **os dois triggers de
`coupons` não valem no caminho real**: ambos começam com
`if auth.uid() is null or public.is_admin() then return new`, e as rotas que criam cupom
usam `service_role`, para quem `auth.uid()` é NULL. Regra nova escrita como trigger nesse
padrão **nasce sem efeito**.

| Regra | Mecanismo |
|---|---|
| 1 cupom por CPF por campanha | índice `coupons_customer_cpf_campaign_id_key`, **já existe** |
| Autoindicação (indicar o próprio CPF) | CPF do indicador desnormalizado no cupom + `CHECK` na mesma linha |
| 1 NF por cupom | índice único em `invoice_number`, **dívida aberta desde setembro** |
| Teto por indicador (conta **usos**) | contagem na rota que gera o cupom: batido o teto, o link não gera mais |

## O risco que decide a economia do programa

Está documentado neste projeto desde 28/07 e a spec de setembro o nomeia: **o vendedor
cadastra um parente como indicador e "indica" todo cliente que entra na loja.** Com
indicações ilimitadas e R$ 200 por venda, isso rende R$ 200 em **toda** venda que a loja
faria sozinha.

O gêmeo, que nem fraude é: o cliente que já ia comprar descobre o programa no balcão,
cadastra um CPF da família e leva R$ 300 de desconto mais R$ 200 de prêmio — R$ 500 numa
venda que já era da casa.

**A defesa principal é de desenho:** o cupom tem de nascer **pelo link, antes** de a
pessoa chegar na loja. A rota de cupom express, que cria no balcão, **não participa deste
programa.** O teto conta **usos** e, batido, fecha o link (decisão 14) — é o que limita o
estrago de um cúmplice. Com o padrão desligado (decisão 15), essa trava só existe depois
que o César a liga; até lá, a defesa é o cupom nascer pelo link e o detector de telefone
repetido que já existe, agora cruzando os dois braços.

As travas de banco (CPF único por campanha, autoindicação, NF única) não dependem de o
César reparar em nada. O teto depende — e enquanto estiver desligado, o relatório é a
única conferência antes de ele premiar.

## O que este programa NÃO faz

- **Não paga.** Não há PIX automático, não há cartão, não há integração com emissor. A
  ferramenta exporta e o César premia.
- **Não escreve em `coupons.paid` nem cria lançamento.** Aquele campo pertence ao
  fechamento do influenciador e tem um escritor só, por decisão da spec de 24/08. O
  prêmio da indicação é outra coisa e mora em outro lugar.
- **Não cria contrato.** O aceite do formulário é o aceite dos termos.

## Perguntas em aberto

Nenhuma. As seis de 17/11 foram respondidas pelo César no mesmo dia e estão na tabela de
decisões. O que sobra é escolha de implementação, e ela mora no plano.
