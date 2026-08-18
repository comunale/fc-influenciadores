# Portal do influenciador

**Data:** 2026-08-18
**Status:** aguardando aprovação
**Subsistema 4 de 5** da reestruturação do fc-influenciadores

## O que é

O influenciador entra e acompanha o que o link dele produziu: quantos cupons foram gerados, quantos viraram venda, quais o Financeiro aprovou, e quanto isso soma de comissão.

Hoje ele não tem como saber nada disso sem perguntar ao César.

## O que muda de patamar

**É a primeira vez que alguém de fora da FoxCycles entra no sistema.** Até agora só três papéis internos existiam. Isso muda o peso de cada decisão de acesso: um erro deixa de ser um funcionário vendo o que não devia e passa a ser um terceiro vendo dado de cliente.

Duas consequências que atravessam toda a spec:

1. **O influenciador nunca vê dado pessoal de cliente.** Nem CPF, nem telefone, nem e-mail, nem nome completo.
2. **Ele nunca alcança as telas internas.** O portal é uma área separada, não uma versão reduzida do admin.

## O acesso

**Login por e-mail e senha**, decidido pelo César em 18/08 sobre link secreto e link mágico.

Papel novo: `influencer`. Cada influenciador vira um usuário com `admin_profiles.role = 'influencer'`, vinculado ao registro dele.

O `proxy.ts` passa a mandar quem tem esse papel para `/portal`, e a bloquear `/admin` inteiro. O caminho inverso também: os três papéis internos não têm o que fazer em `/portal`.

## O que ele vê

### Dados do cliente: nada

O influenciador vê **quantidade**, nunca **quem**.

```
✅  "12 cupons gerados · 5 viraram venda · 3 aprovadas"
✅  "Venda em 12/06, aprovada"
❌  nome, CPF, telefone, e-mail de qualquer cliente
```

O motivo é direto: são clientes da FoxCycles, não dele. Ele trouxe a indicação; isso não lhe dá acesso ao cadastro de ninguém. E é dado sensível sob a LGPD, que a empresa responde por.

### Por parceria

O portal lista as parcerias dele. Cada uma mostra o período e os números daquele acordo.

**As parcerias de hoje aparecem como linha fechada, sem detalhe:**

```
Parceria Reinauguração Campinas · encerrada · sem detalhes
```

O motivo é do César: os dados atuais vieram de uma planilha, estão sendo acertados retroativamente, e os R$ 3.000 do `@caiiuxo` **já foram pagos por fora**. Mostrar em detalhe criaria cobrança sobre o que já foi acertado; esconder por completo faria o influenciador achar que o histórico sumiu. A linha fechada resolve os dois.

**Mecanismo:** `partnerships.portal_visible`, que nasce `true`. A migração marca as 18 parcerias existentes como `false`. Toda parceria criada a partir de agora aparece completa.

### Comissão

Reaproveita `calcularComissao`, que já existe e já lê o retrato gravado em cada cupom. O influenciador vê, por parceria: vendas aprovadas, comissão gerada, comissão paga, e quanto falta.

**Só conta o que o Financeiro aprovou.** Uma venda validada no balcão mas ainda não conferida aparece como pendente, sem valor — senão o portal vira promessa de pagamento sobre algo que ainda pode não se confirmar.

## O que ele NÃO faz

Não edita nada. O portal é somente leitura. Nem os próprios dados bancários — mudar chave PIX por uma tela que um terceiro acessa é superfície de fraude que não se justifica pelo ganho.

## Segurança

A regra de que ele só vê o que é dele vale em três camadas, como todo o resto do sistema:

| Camada | Como |
|---|---|
| Tela | o portal só monta o que veio da consulta |
| Rota | `requireRole(['influencer'])` mais o vínculo com o próprio registro |
| Banco | RLS: `coupons` e `partnerships` legíveis pelo influenciador **apenas** quando forem dele |

A camada do banco é a que importa: sem ela, um influenciador trocaria um id na URL e veria os números de outro.

**Atenção — `coupons` hoje tem `select` público** (`coupons_select_public_by_number`), porque a página `/cupom/CODIGO` precisa funcionar sem login. Isso significa que hoje qualquer um que descubra um código lê aquele cupom, inclusive CPF e telefone do cliente. **Isso já é um problema, e o portal o agrava** — vale corrigir junto, restringindo as colunas públicas.

## Estrutura

```
/portal              → resumo: parceria ativa, números, o link dele
/portal/vendas       → lista por parceria, sem dado de cliente
/portal/login        → entrada separada da do admin
```

Fora do grupo `(protected)` do admin, com layout próprio.

## Como o influenciador ganha acesso

O César cria o acesso a partir da tela de Influencers, num botão "Criar acesso ao portal": informa o e-mail e uma senha inicial. Mesmo caminho que já existe para criar usuário interno, reaproveitando `/api/admin/create-user`.

Sem autocadastro. Sem convite por e-mail — o envio de e-mail foi descartado no projeto.

## Riscos

| Risco | Mitigação |
|---|---|
| Influenciador ver dado de cliente | A consulta do portal não traz essas colunas. RLS por baixo |
| Influenciador ver números de outro | RLS amarrando ao próprio registro, não só filtro na consulta |
| Influenciador alcançar o admin | `proxy.ts` bloqueia; papel novo não tem nenhuma ação na matriz |
| Cobrança sobre o que já foi pago | `portal_visible = false` nas 18 parcerias atuais |
| Senha fraca de terceiro | Mínimo de 8 caracteres, como já vale para os internos |

## Fora de escopo

- Fechamentos e ciclos de pagamento (subsistema 2). O portal mostra o que já foi aprovado e pago, não previsão de quando cai.
- Influenciador editar qualquer coisa.
- Notificação de venda nova — exigiria canal externo, descartado no projeto.
- Autocadastro e recuperação de senha por e-mail.
