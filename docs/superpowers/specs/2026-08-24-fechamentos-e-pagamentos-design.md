# Fechamentos e pagamentos

**Data:** 2026-08-24
**Status:** aguardando revisão do César
**Subsistema 2** do fc-influenciadores

## O que é

Hoje o sistema sabe **quanto se deve** e não sabe **o que foi pago**.

O `calcularComissao` responde a primeira metade desde 18/08. A segunda metade mora em `coupons.paid`, um booleano marcado cupom a cupom, sem forma de pagamento e sem nenhum elo com o extrato do banco. O fixo (`fee_amount`) é pior: existe no contrato e **não tem campo nenhum** dizendo se saiu — a tela mostra o valor separado justamente para não somar em "a pagar" e dar número errado.

Este módulo fecha essa metade. O pagamento vira um registro congelado, com prova, e o influenciador enxerga o que recebeu sem precisar perguntar.

## O livro de lançamentos

Uma tabela só, `settlements`. Cada linha é um lançamento de uma parceria, e o **tipo** define o sinal do dinheiro:

| Tipo | Direção | Nasce quando |
|---|---|---|
| `comissao` | sai | o Financeiro fecha um período |
| `fixo` | sai | a parceria é criada com `fee_amount > 0` |
| `restituicao` | **entra** | o admin registra descumprimento do contrato |

Decidido pelo César em 24/08, sobre a alternativa de separar fechamentos e pagamentos em duas tabelas: *"uma coluna a mais, não uma tabela a mais"*.

A razão não é economia de código. É que **quando um papel novo entra no sistema, todas as políticas existentes precisam ser relidas** — regra aprendida do jeito difícil em 19/08, quando uma política "estreita" sobre os cupons do influenciador teria entregado CPF e telefone dos clientes pela API. Um livro é um conjunto de políticas para reler. Três livros são três, e o terceiro é sempre o que ninguém lembra.

### A restituição não nasce do zero

A migration 024 já grava `contracts.fee_a_restituir` quando o admin registra descumprimento. O que falta é registrar que o dinheiro **voltou**. Construir isso depois criaria um segundo modelo de pagamento paralelo, para manter em dobro; construir junto é uma linha com tipo diferente.

## O cupom não entra em dois fechamentos

`settlement_items` congela quais cupons entraram num fechamento de comissão, por id, com **o valor de cada um no momento de fechar**.

Sobre ela vai um **índice único em `coupon_id`**. É a trava central deste subsistema: o banco recusa incluir num fechamento um cupom que já está em outro. Não é validação de tela, não é conferência do Financeiro — é impossibilidade.

Vale a regra de sempre do projeto: toda regra em duas camadas, allowlist na rota da API **e** trava no Postgres. Esconder na tela nunca é trava.

Pela mesma lógica, a referência de `settlements` para `partnerships` é `on delete restrict`: parceria com dinheiro registrado não se apaga.

## Congelar e pagar são duas etapas

**Fechar** escolhe o período, junta os cupons elegíveis e grava os valores. O lançamento fica `aberto`.

**Pagar** registra a prova — data, forma e identificador — e é o ato que marca os cupons como pagos.

O status `pago` exige `paid_at` e `forma` por constraint. Um lançamento pago sem prova não existe no banco.

### Cancelar só existe em aberto, e libera os cupons

Os três estados são `aberto`, `pago` e `cancelado`. **Só um lançamento `aberto` pode ser cancelado** — pagamento registrado não se apaga, porque apagar prova é o oposto do que este módulo existe para fazer. Errou o valor de um lançamento já pago? Nasce um novo lançamento corrigindo, e o erro fica visível. É livro-caixa, não rascunho.

Cancelar **apaga os itens** do lançamento, devolvendo aqueles cupons ao conjunto elegível. Sem isso, o índice único prenderia o cupom para sempre num fechamento que ninguém pagou — e um cupom preso é uma comissão que o influenciador nunca recebe, sem erro nenhum aparecendo na tela.

Como só se cancela em aberto, nenhum cupom já marcado como pago é afetado: no estado `aberto` nada foi marcado ainda.

### Por que o `coupons.paid` continua vivo

Decidido pelo César em 24/08, sobre aposentá-lo e derivar tudo do fechamento.

Com o fechamento existindo, passam a existir dois lugares dizendo "isto foi pago" — e é assim que número começa a divergir. A escolha: **o cupom continua sendo o átomo; o fechamento é o agrupamento e a prova.** Fechar um lançamento é o que marca `coupons.paid`, e nada mais marca.

Duas consequências, que são o motivo da escolha:

- O `calcularComissao` não muda **uma linha**, e os 110 testes que hoje sustentam portal e encerramento de parceria continuam verdes.
- Nunca existe cupom pago fora de um fechamento. A auditoria sai de graça — é uma junção, não uma investigação.

## Onde mora a regra de elegibilidade

O TypeScript **propõe**, o banco **valida**.

O conjunto de cupons que entra num fechamento sai do `calcularComissao`, que já sabe ler `commission_starts_at`, `commission_counts_from` e o retrato de comissão gravado em cada cupom — e já está testado. A função do banco não reimplementa essa regra comercial: ela recusa o que é inegociável.

O que o banco valida, sozinho:

- o cupom é `verified` (conferido pelo Financeiro contra a NF)
- o cupom pertence àquela parceria
- o cupom não está em nenhum outro fechamento

Escrever a regra comercial em SQL também criaria duas cópias, e duas cópias divergem. Escrevê-la só no TypeScript deixaria o banco sem trava. A divisão acima é a única que não paga nenhum dos dois preços.

## Nascer aberto não é fechar sozinho

O César decidiu em 24/08 que **o Financeiro cria o fechamento e o sistema apenas sugere** — nada de `pg_cron` gerando ciclo.

O fixo e a restituição nascem `aberto` automaticamente mesmo assim, e isso não contradiz a decisão. Nascer aberto é uma **conta a pagar aparecendo**; fechar um ciclo é uma **decisão tomada**. O fixo já está no contrato no instante em que a parceria existe — não há o que decidir, só o que lembrar. Um fechamento de comissão, ao contrário, depende de o Financeiro ter conferido as vendas do período; gerado por robô, nasceria errado toda vez que uma NF ainda não tivesse sido conferida.

O `fee_timing` (`inicio` / `fechamento`) diz quando o fixo **vence**, e alimenta o aviso — não cria nem paga nada.

Isto é o que encerra a dívida do `fee_amount` listada no `docs/BACKLOG.md`, em vez de só carimbar um `fee_paid_at` na parceria.

## O aviso, que é a régua do `payment_schedule`

Um bloco no Dashboard aponta o que há para fechar:

- parceria `mensal` cujo mês virou e tem comissão conferida em aberto
- parceria encerrada com comissão em aberto
- fixo vencido pelo `fee_timing` e ainda não pago
- restituição registrada e não recebida

Sem canal externo — e-mail foi descartado pelo César, e continua descartado. O aviso vive dentro do sistema, como o de parceria perto do fim.

O motivo de existir aviso: foram **18 parcerias ativas sem data de fim**, e ninguém sabia. O que não avisa, ninguém lembra.

## O que o influenciador vê

Uma função `portal_fechamentos()` devolve, por parceria: tipo, período, valor e data de pagamento.

**Não devolve forma de pagamento nem identificador da transação.** Isso é controle interno, na mesma linha da decisão do César em 19/08 de que dado bancário não aparece no portal nem para ler.

O corte acontece **no SQL**, não na tela. RLS filtra linha, não coluna: dar ao influenciador acesso de leitura à tabela `settlements` entregaria as colunas de prova junto, por mais estreita que a política parecesse. Ele nunca ganha política sobre a tabela — lê pela função, que descobre o dono pela sessão.

Ele também nunca ganha INSERT nem UPDATE em lançamento algum. Não existe caminho pelo qual o influenciador escreva sobre o próprio pagamento.

## Papéis

| Papel | Sobre lançamentos |
|---|---|
| `admin` | tudo — é superusuário, decisão explícita do César |
| `finance` | criar, fechar, registrar pagamento, cancelar em aberto |
| `moderator` (**Lojista** na tela) | **nada.** Não vê dinheiro de influenciador |
| influenciador | lê os próprios, sem a prova, pela função |

Na interface, `moderator` se chama **Lojista** — nunca "Moderador".

Com um tipo de leitura novo entrando, as políticas existentes de `coupons` e `partnerships` são relidas nesta entrega, em vez de assumidas corretas. É a regra que saiu de 19/08, aplicada a si mesma.

## Telas

Uma tela **Financeiro**, organizada por influenciador: o que está aberto, o que foi pago, e o botão de fechar período. O detalhe de um fechamento mostra os cupons congelados dentro dele.

Vale o teto de 500 linhas por arquivo. A tela nasce quebrada em componentes, não como um arquivo que depois "alguém divide".

Parte do subsistema 5 (menus, páginas e papéis) que cabe a esta entrega: o item Financeiro no menu, visível para `admin` e `finance`.

## Testes

- **Módulo puro** para elegibilidade e para o cálculo do ciclo, no padrão do `lib/commission.ts` — sem banco, sem React, sem data do sistema.
- **Testes de banco** em transação com `rollback`: o índice único do cupom, a constraint de prova no pago, e as permissões dos quatro papéis.

**Ressalva honesta:** os testes de banco vão dormir junto com os 19 que já dormem, porque exigem `SUPABASE_DB_URL` e o César preferiu não usar a senha do Postgres de produção — decisão certa. O caminho para acordá-los todos é um projeto Supabase separado para teste. Isso está no `docs/BACKLOG.md` como dívida, e esta entrega **aumenta** essa dívida em vez de criá-la.

## Fora deste subsistema

Vão para o `docs/BACKLOG.md` — não para o rodapé deste arquivo, que é onde pendência morre:

- **Anexo de comprovante** (PDF/imagem). O César escolheu dados digitados em 24/08, coerente com a NF, que também é só um número. Exigiria Supabase Storage, bucket e RLS de storage — nada disso existe no projeto hoje.
- **Fechamento automático por `pg_cron`.** Recusado em 24/08.
- **Pagamento em lote de vários influenciadores de uma vez.** Só faz sentido com volume maior que 2 parcerias ativas.

## Riscos

| Risco | Mitigação |
|---|---|
| Pagar o mesmo cupom duas vezes | Índice único em `settlement_items.coupon_id`. O banco recusa |
| `coupons.paid` divergir do fechamento | Só o fechamento marca. Nenhuma outra rota escreve nesse campo |
| Regra de comissão virar duas cópias | TypeScript propõe, banco valida o inegociável. A regra comercial existe num lugar só |
| Fechar período com venda não conferida | `verified` é condição validada no banco, não só filtro de tela |
| Influenciador ver dado de pagamento interno | Corte no SQL, por função. Sem política de tabela para ele |
| Lançamento pago sem prova | Constraint: `pago` exige `paid_at` e `forma` |
| Cupom preso num fechamento abandonado | Cancelar apaga os itens e devolve os cupons ao elegível |
| Prova de pagamento apagada | `pago` não se cancela. Correção é lançamento novo |

## Critério que amarra

Depois de tudo, o **"a pagar" do @caiiuxo continua R$ 3.000** enquanto nenhum fechamento for pago — o mesmo invariante que provou que a migração do subsistema 1 não reescreveu nada.

E o primeiro fechamento pago desse valor tem que deixar o "a pagar" em R$ 0 **sem tocar em nenhum outro número da tela**.
