# Os termos passam a viver no influenciador

**Data:** 2026-08-18
**Status:** desenho aprovado na conversa, aguardando plano de implementação

## O problema

Hoje a oferta (desconto, validade, textos do cupom) mora na **campanha**, e o link do influenciador só funciona se a campanha estiver ativa. Isso força três coisas ruins:

1. **Acordo diferente exige campanha nova.** O @caiiuxo negociou R$ 300 em vez de R$ 200, e a única saída foi criar uma campanha para ele sozinho.
2. **Encerrar uma parceria derruba todas.** Desligar a campanha mata o link de todo mundo junto.
3. **Renovar exige campanha nova, e campanha nova mexe no link.** O link está na bio e no story do influenciador — trocar não é opção.

### Evidência

```
Reinauguração Campinas    R$ 200 · 30d · 16 influencers
Parceria Caiixo           R$ 300 · 60d ·  1 influencer   ← campanha para uma pessoa
Influenciadores Campinas  R$ 200 · 45d ·  1 influencer   ← idem
```

**Duas das três campanhas existem para atender um influenciador só.** Não é uso errado: é o modelo não dando conta de acordos individuais, e o César contornando.

Em 18/08 isso cobrou o preço: as duas campanhas antigas estavam desativadas e **17 dos 18 links estavam mortos**, todos com o influenciador marcado como ativo. O César reativou o @caiiuxo e o link continuou morto, porque o problema estava na campanha — e a tela não mostrava isso em lugar nenhum.

## A decisão

**Campanha vira modelo. Influenciador vira dono dos termos.**

Ao cadastrar um influenciador, escolher uma campanha **preenche** desconto, validade e textos nos campos dele. A partir daí aqueles valores são dele e podem ser editados livremente. Mudar a campanha depois não altera parceria já em andamento — o que é o comportamento desejado: termo acordado não muda sozinho.

O link passa a depender só do influenciador: `active` e o prazo dele. A campanha deixa de poder derrubar ninguém.

### O que a campanha continua sendo

Rótulo de agrupamento para relatório, e modelo para não redigitar os mesmos valores a cada cadastro. Os cupons continuam guardando `campaign_id`, então o relatório por campanha segue funcionando.

## O retrato: sem isso, renovar destrói o passado

**O cupom não guarda o desconto que concedeu.** Ele guarda o vínculo com a campanha e o valor é lido de lá na exibição.

Hoje isso funciona por acidente, porque campanha quase não muda. No modelo novo os termos mudam a cada renovação, e sem retrato acontece isto:

> Renovou com o @caiiuxo por R$ 400. No mesmo instante, os 6 cupons de junho — que deram R$ 300 — passam a mostrar R$ 400 na tela e no relatório.

No dinheiro é pior: `calcularComissao` lê o valor atual do influenciador. Renovar de R$ 500 para R$ 600 por venda **recalcularia as comissões antigas por R$ 600**, e o que já foi pago fica errado retroativamente.

**Decisão: o cupom passa a gravar, no momento em que nasce, o que valia ali** — desconto e comissão por venda. É o modelo correto de qualquer forma: nota fiscal não muda de valor porque a tabela de preços mudou.

Isto não é opcional. É o que sustenta o resto.

## Prorrogar e Renovar

São operações diferentes e ambas precisam existir.

| | Prorrogar | Renovar |
|---|---|---|
| Termos | mantém | muda |
| Prazo | estende | novo |
| Link | intacto | intacto |
| Uso | "vamos mais 30 dias igual" | "vamos continuar, mas a R$ 400" |

### A contagem de vendas na renovação

`commission_starts_at` é posicional: "comissão a partir da enésima venda". Ao renovar, essa contagem recomeça ou continua?

**Depende do acordo** — decisão do César, caso a caso. Portanto não pode ser regra fixa no código.

**Mecanismo:** o influenciador ganha `commission_count_since` (data). O cálculo só conta vendas a partir dela. Renovar zerando a contagem grava a data da renovação; renovar mantendo deixa como está. A tela de renovação pergunta, com uma opção marcada por padrão.

Isso resolve sem precisar de tabela de períodos: o histórico financeiro que importa já fica gravado nos cupons, via retrato.

## Estrutura de dados

**`influencers` ganha:**

| Coluna | Para quê |
|---|---|
| `discount_type`, `discount_value` | a oferta, copiada da campanha na criação |
| `validity_days` | validade do cupom para o cliente |
| `coupon_title`, `coupon_description` | textos da landing |
| `partnership_ends_at` | prazo da parceria — o link morre depois disso |
| `commission_count_since` | a partir de quando contar vendas para a posição |

**`coupons` ganha (retrato do momento da criação):**

| Coluna | Para quê |
|---|---|
| `discount_type`, `discount_value` | o que o cliente ganhou de fato |
| `commission_per_sale` | quanto aquela venda gera de comissão |

## Migração

Copiar os valores da campanha para dentro de cada influenciador, e o retrato para dentro de cada cupom existente, lendo da campanha vinculada. **Ninguém muda de termo na conversão** — quem está com R$ 300 continua com R$ 300.

Estado a preservar em 18/08:

```
Reinauguração Campinas    R$ 200 · 30d · 16 influencers · inativa
Parceria Caiixo           R$ 300 · 60d ·  1 influencer  · sendo reativada pelo César
Influenciadores Campinas  R$ 200 · 45d ·  1 influencer  · ATIVA (Mariana)
```

`partnership_ends_at` na migração fica **nulo** para todos, que significa "sem prazo". Ninguém perde o link por causa da conversão — definir prazo passa a ser ato deliberado.

## O que muda para quem usa

- **A landing do link** passa a ler desconto e textos do influenciador, não da campanha.
- **A criação de cupom** passa a ler validade do influenciador e gravar o retrato.
- **O link morre** quando o influenciador é desativado ou quando `partnership_ends_at` passa. Campanha inativa não derruba mais ninguém.
- **A lista de influencers** ganha a etiqueta de estado e o prazo.

## Riscos

| Risco | Mitigação |
|---|---|
| Migração errar valor e mudar termo de alguém | Conferir influenciador por influenciador contra a campanha de origem antes e depois |
| Cupom antigo ficar sem retrato | A migração preenche todos; conferir que não sobrou nulo |
| Mudar desconto de todos de uma vez deixa de existir | Passa a ser um por um. Com 18 influenciadores e acordos individuais, é troca aceitável — e mudar termo em andamento não deveria ser fácil |
| Link cair na virada | `partnership_ends_at` nulo na migração; nenhum link muda de estado |

## Fora de escopo

- Aviso automático de parceria perto do fim (o `pg_cron` já está instalado e serve para isso — vira o próximo plano).
- Dados bancários dos influenciadores.
- Portal do influenciador. **Pré-requisito registrado:** os dados atuais vieram de planilha e não devem ser expostos externamente sem separar migrado de nascido-no-sistema.
- Apagar a tabela `campaigns`. Ela continua como modelo e rótulo de relatório.
