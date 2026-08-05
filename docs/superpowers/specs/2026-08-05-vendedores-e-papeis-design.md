# Vendedores no balcão e escopo final dos papéis — Design

**Status:** aprovado pelo César em 2026-08-05. Ainda não implementado.

**Goal:** amarrar cada validação de cupom a um vendedor nomeado, e fechar o escopo de tela
de cada papel: Lojista só valida e consulta, Financeiro cuida de NF/pagamento/relatório,
Admin faz tudo.

## Por que isso existe

O programa de cupons ganhou burocracia porque a suspeita é que o balcão usa o cupom como
desconto de negociação: o vendedor fecha a venda dando o desconto e o cupom sai no nome de
um influenciador que não indicou ninguém. Custa duas vezes — o desconto sai da margem e a
comissão sai do caixa. Hoje o cupom registra apenas `used_by_admin`, que é o **login** usado
no balcão, normalmente compartilhado. Não existe nome de pessoa em lugar nenhum.

## Decisão explícita: lista sem PIN

O vendedor **escolhe o próprio nome numa lista suspensa**, sem senha e sem PIN.

Foi oferecida a alternativa de PIN de 4 dígitos por vendedor, e a de login individual. O
César escolheu a lista pura, por velocidade no balcão.

**Consequência aceita, registrada aqui de propósito:** nada impede o vendedor de escolher o
nome de um colega. O campo Vendedor é **rastro, não prova**. Serve para revelar padrão
(sempre o mesmo nome, ou nome que não bate com a escala do dia), não para sustentar uma
cobrança individual. Se algum dia a evidência precisar sustentar cobrança, o caminho é o PIN
ou o login individual — não é esquecimento, é escolha.

## Modelo de dados

### Tabela nova `sellers`

| Coluna | Tipo | Nota |
|---|---|---|
| `id` | `uuid pk default gen_random_uuid()` | |
| `name` | `text not null` | |
| `store_name` | `text not null` | casa com `admin_profiles.store_name` do lojista |
| `active` | `boolean not null default true` | |
| `created_at` | `timestamptz not null default now()` | |

Vendedor **nunca é excluído**, só desativado — excluir levaria junto o histórico de quem
validou o quê. Renomear corrige o nome em todo o histórico, que é o comportamento desejado
quando o cadastro saiu com erro de digitação.

RLS: leitura para qualquer usuário autenticado (o lojista precisa montar a lista); escrita
só para `admin`, na API e no trigger, seguindo o padrão já usado em `coupons`.

### Coluna nova em `coupons`

| Coluna | Tipo | Nota |
|---|---|---|
| `seller_id` | `uuid references sellers(id)` | nulo nos 14 cupons antigos, que são anteriores à regra |

`used_by_admin` **continua existindo e não muda de significado**: é o login que operou o
sistema. `seller_id` é o nome reivindicado. Os dois são fatos diferentes e aparecem lado a
lado na tela — é justamente o par que revela padrão.

## Fluxo da validação

O `<select>` de vendedor entra nos **dois** fluxos da tela Validar: o cupom que já existe e o
cadastro express. O express é o mais importante — 100% das vendas reais do programa saíram
dele.

A lista mostra os vendedores `active` da **loja do usuário logado** (`admin_profiles.store_name`).
O admin não tem loja no perfil; para ele a lista traz todos, com a loja ao lado do nome.

Sem vendedor escolhido, o botão de validar fica desabilitado. Campo obrigatório.

## Regras de servidor

1. **`seller_id` é validado no backend.** Precisa existir, estar `active` e — quando quem
   chama é lojista — pertencer à loja dele. Sem essa checagem, bastava chamar a API na mão
   com qualquer id para furar o vínculo.
2. **`/api/coupons/validate` para de confiar no cliente.** Hoje a rota aceita `admin_name`
   vindo do corpo da requisição e grava esse texto como validador — qualquer nome, inclusive
   inventado. Passa a usar sempre o nome da sessão e a ignorar o campo do corpo.

Como em todo o resto do sistema, a regra vale em duas camadas: allowlist/checagem na rota e
trigger no Postgres. Esconder na tela nunca é trava.

## Escopo de tela por papel

| | Admin | Financeiro | Lojista |
|---|---|---|---|
| Dashboard | ✓ | ✓ | ✗ |
| Validar | ✓ | ✗ | ✓ |
| Cupons | ✓ tudo | ✓ NF, Pago, export | ✓ só lê |
| Influencers | ✓ | ✓ lê | ✗ |
| Campanhas | ✓ | ✗ | ✗ |
| Configurações | ✓ | ✗ | ✗ |

Muda em relação ao que está no ar hoje: o Lojista **perde Influencers e Campanhas**, ficando
só com Validar e Cupons. Vale no menu e no `proxy.ts`.

"Emitir relatórios" do Financeiro é o **export XLS** da tela de Cupons, com filtro por
período e influencer, acrescido da coluna Vendedor. Não haverá tela de relatório separada.

## Configurações → nova aba "Vendedores"

Só admin. Lista os vendedores com nome, loja e estado, e permite criar, renomear, trocar de
loja e ativar/desativar. Segue o padrão visual da aba Usuários que já existe em `ConfigTabs`.

## Ordem de execução

Vendedores primeiro — banco, aba de Configurações, validação — e só depois a tela unificada
de Cupons (Task 6 do plano de 2026-08-05). Assim a tela nova já nasce com a coluna Vendedor
em vez de ser mexida duas vezes.

## Pendência de conteúdo

Falta o César passar **os nomes dos vendedores e a loja de cada um** para o cadastro inicial.

## Fora de escopo

- PIN ou login individual por vendedor (ver a decisão acima).
- Tela de relatório separada; o XLS resolve.
- O fluxo do QR code anti-abuso (spec de 2026-07-28), que segue não implementado.
- Cálculo automático de comissão.
