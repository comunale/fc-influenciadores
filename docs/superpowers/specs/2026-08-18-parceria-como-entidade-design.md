# Parceria como entidade

**Data:** 2026-08-18
**Status:** desenho aprovado na conversa, aguardando plano de implementação
**Subsistema 1 de 5** da reestruturação do fc-influenciadores como gerenciador de parcerias

## O problema

O César descreveu como trabalha:

> *"Eu procuro um influenciador. Converso com ele e combino uma parceria. Posso pagar ou não um fee e acerto uma comissão. Aí defino por quanto tempo essa parceria será válida e como faremos os pagamentos."*

**A parceria é uma coisa em si, e o sistema não tem isso.** Os termos vivem como campos soltos do influenciador. Três problemas nascem daí:

1. **Renovar é gambiarra.** Sobrescreve os campos e perde o acordo anterior. Foi preciso inventar `commission_count_since` só para lembrar quando a contagem recomeçou.
2. **Prazo se confunde com validade do cupom.** O César chamou "campanha de 60 dias" o que na verdade é quanto tempo o *cliente* tem para usar o cupom. A duração da parceria não existia até 18/08, e ainda hoje está vazia para todos.
3. **Não há onde dizer quando pagar.** "A cada 30 dias ou no fim" não tem campo.

O sistema também vai encher: o César pretende rodar anúncios e fechar muitas parcerias. Campo solto não escala.

## O modelo

```
INFLUENCIADOR ──── a pessoa
  nome, @, código do link, contato, dados bancários
       │
       └── PARCERIA ──── o acordo (várias ao longo do tempo, UMA ativa por vez)
             período, fee, comissão, regra de pagamento, oferta
                  │
                  └── CUPOM ──── a venda
```

### O que fica no influenciador

A **identidade** e o que atravessa parcerias: nome, `instagram_handle`, `coupon_code`, `active`, dados bancários (já em tabela própria desde a migration 009).

**`coupon_code` fica aqui de propósito.** O link está na bio e no story do influenciador — renovar não pode trocá-lo. Ele pertence à pessoa; os termos, ao acordo.

### O que vai para a parceria

| Campo | O que é |
|---|---|
| `starts_at`, `ends_at` | período do acordo. `ends_at` nulo = sem prazo |
| `status` | `ativa` ou `encerrada` |
| `fee_amount`, `fee_timing` | o cachê e quando sai: `inicio` ou `fechamento` |
| `commission_per_sale` | quanto cada venda gera |
| `commission_starts_at` | a partir de qual venda a comissão vale |
| `commission_counts_from` | `parceria` (recomeça) ou `historico` (continua) |
| `payment_schedule` | `fim` ou `mensal` |
| `discount_type`, `discount_value` | a oferta ao cliente |
| `validity_days` | validade do cupom **para o cliente**, contada de quando ele gera |
| `coupon_title`, `coupon_description` | textos da landing |

`commission_counts_from` substitui o `commission_count_since` criado em 18/08. Fica mais honesto: em vez de guardar uma data mágica, diz o que foi combinado.

### Uma parceria ativa por vez

Decisão do César. Garantida no banco com índice único parcial:

```sql
create unique index partnerships_uma_ativa_por_influencer
  on public.partnerships (influencer_id) where status = 'ativa';
```

Sem isso, dois acordos ativos deixariam o sistema sem saber qual desconto aplicar.

### O cupom aponta para a parceria

`coupons.partnership_id` diz de qual acordo cada venda nasceu. É o que permite fechar por período sem depender de comparar datas.

**O retrato continua.** `coupons.discount_value` e `coupons.commission_per_sale` (migration 008) seguem gravados no cupom. A parceria dá o agrupamento; o retrato dá a verdade do momento — e sobrevive a alguém editar a parceria depois.

## Prorrogar e Renovar, agora sem gambiarra

| | O que acontece |
|---|---|
| **Prorrogar** | muda `ends_at` da parceria ativa. Nada mais |
| **Renovar** | encerra a ativa e cria outra, com os termos novos |

O histórico de cada acordo fica preservado sozinho, porque cada um é uma linha. Consultar "quanto o @caiiuxo rendeu na parceria de junho" vira uma pergunta trivial.

## O que muda nas telas

**Tela do influenciador** passa a mostrar a pessoa e, dentro dela, a parceria ativa em destaque mais o histórico das encerradas. O formulário de cadastro se divide: dados da pessoa numa etapa, termos do acordo na outra.

**A campanha continua modelo.** Escolher uma preenche os termos da parceria, inclusive uma duração padrão que já calcula o `ends_at`. Era o que o César tentava fazer ao colocar "60 dias" na campanha — só que aquele campo era a validade do cupom.

**Nada muda no balcão nem na landing.** O link continua o mesmo, e quem lê os termos passa a ler da parceria ativa em vez do influenciador.

## Migração

Cada influenciador ganha **uma parceria ativa** com os termos que ele tem hoje. Os cupons existentes apontam para ela.

**Ninguém muda de termo.** Quem está com R$ 300 continua com R$ 300, e o `ends_at` nasce nulo — nenhum link cai por causa da conversão.

Valores a preservar em 18/08: 16 influenciadores a R$ 200/30d, `@caiiuxo` a R$ 300/60d com comissão de R$ 500 desde a 1ª venda, `@mariananavi` a R$ 200/45d com comissão de R$ 300.

O critério que amarra: **o "a pagar" do `@caiiuxo` tem que continuar R$ 3.000** depois da migração inteira.

## Riscos

| Risco | Mitigação |
|---|---|
| Migração mudar termo de alguém | Conferir os 18, um a um, contra o valor de antes |
| Cupom ficar sem parceria | A migração preenche todos; conferir que não sobrou nulo |
| Link cair na virada | `ends_at` nulo para todos; nenhum muda de estado |
| Duas parcerias ativas | Índice único parcial no banco, não só validação na tela |
| Leitura dos termos quebrar | 11 pontos leem os termos hoje. Migrar em ordem, como foi feito na migration 008 |

## Fora deste subsistema

- **Fechamentos e pagamentos** (subsistema 2). O modelo já carrega `payment_schedule` e `fee_timing`, mas calcular ciclos e registrar pagamento é a próxima entrega.
- **Funil de prospecção** (subsistema 3).
- **Portal do influenciador** (subsistema 4). Spec de visibilidade já aprovada: cupons de hoje marcados como acertados por fora, cupom novo nasce visível.
- **Reorganização geral de menus** (subsistema 5). Cada entrega arruma a sua parte.
- **Entrega A pendente** (balcão: tirar o express do Lojista, QR do influenciador, telefone repetido). Independente disto e continua no `docs/BACKLOG.md`.
