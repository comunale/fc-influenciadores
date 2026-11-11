# Fechamentos e pagamentos — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar o pagamento de influenciador num registro congelado com prova, acabando com o `coupons.paid` marcado cupom a cupom e dando ao fixo e à restituição um lugar onde existir.

**Architecture:** Uma tabela de lançamentos (`settlements`) com três tipos (`comissao`, `fixo`, `restituicao`) e uma de itens congelados (`settlement_items`) cujo índice único em `coupon_id` torna **impossível** pagar o mesmo cupom duas vezes. O TypeScript propõe quais cupons entram (reaproveitando `calcularComissao`, que já é testado); o banco valida o inegociável. `coupons.paid` continua sendo o átomo — só o fechamento o marca.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Supabase (Postgres + RLS), Tailwind v4, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-24-fechamentos-e-pagamentos-design.md` — aprovada pelo César em 11/11/2026.

## Mudanças à spec aprovadas em 11/11

A spec é de 24/08. Duas coisas mudaram no mundo desde então e valem **mais** que o texto dela:

1. **O critério de aceitação venceu.** A spec amarra tudo em *"o 'a pagar' do @caiiuxo continua R$ 3.000"*. Os 6 cupons dele foram pagos em **01/10/2026 13:06** pelo Financeiro, um a um, com NF em cada (`003 NF 95`, `96`, `97`, `99`, `100`, `005 NF 44`). O "a pagar" hoje é **R$ 0**. O critério novo está em "Critério que amarra", no fim deste plano.

2. **Existem 6 cupons pagos sem fechamento.** A spec promete *"nunca existe cupom pago fora de um fechamento"*. O César decidiu em 11/11 criar o **lançamento retroativo** (Task 3) em vez de aceitar exceção. A promessa passa a valer desde a origem.

## Global Constraints

- `moderator` chama-se **Lojista** na interface. Nunca "Moderador".
- Nenhum arquivo passa de **500 linhas**.
- Toda regra em **duas camadas**: allowlist na rota da API **e** trava no Postgres. Esconder na tela nunca é trava.
- **Sem e-mail.** Envio foi descartado no projeto e continua descartado. Aviso vive dentro do sistema.
- O influenciador **nunca** vê forma de pagamento nem identificador da transação. Corte no SQL, por função — RLS filtra linha, não coluna.
- O influenciador **nunca** ganha INSERT nem UPDATE sobre lançamento.
- `status = 'pago'` exige `paid_at` **e** `forma`, por constraint.
- Só lançamento `aberto` pode ser cancelado. Cancelar apaga os itens.
- `settlements.partnership_id` → `partnerships` com `on delete restrict`.
- **Migração sobe junto com o código.** Nunca aplicar migration antes do deploy do código que a usa.
- Valores já existentes no banco, a usar literalmente: `payment_schedule ∈ {'fim','mensal'}`, `fee_timing ∈ {'inicio','fechamento'}`, `partnerships.status ∈ {'ativa','encerrada'}`, `coupons.status ∈ {'pending','used','expired','cancelled'}`.

## Decisão de data, medida nos dados reais (11/11)

**O período de um fechamento de comissão recorta por `coupons.used_at`.**

Não por `verified_at`: as 5 vendas de junho do @caiiuxo têm `verified_at = 2026-08-18`, todas no mesmo lote, porque o papel Financeiro só nasceu naquele dia. Fechar "junho" por `verified_at` devolveria junho vazio e jogaria tudo em agosto.

`verified` segue sendo **condição de elegibilidade**, não data.

Atenção ao implementar: `calcularComissao` ordena por `created_at` (é o que define qual é a venda nº 1, para o `commission_starts_at`). Nos dados reais `created_at` e `used_at` caem no mesmo dia em 6 de 7 cupons usados — mas um tem 5 dias de diferença, e nada impede meses diferentes. **As duas datas têm papéis distintos e nenhuma substitui a outra:** `created_at` ordena, `used_at` recorta. Não "unificar" isso.

## Review Focus

Cinco entradas que a spec implica e que nenhum caminho feliz exercita. Cada linha tem o seu teste na tarefa que é dona do código.

1. **Cupom `status='used'` com `used_at` nulo.** A coluna é nullable. Sem trava, ele some de todo período (nunca é pago) ou entra em qualquer um. Esperado: o banco recusa incluí-lo. → Task 2.
2. **Fechar um período sem nenhum cupom elegível.** Esperado: recusa criar lançamento vazio, com mensagem — não um lançamento de R$ 0 que o Financeiro vai pagar sem querer. → Task 5.
3. **Cupom com `commission_per_sale` nulo** (anterior à migration 008). O valor congelado tem de usar o fallback do contrato **no instante de fechar**, e não mudar se o contrato mudar depois. → Task 1 e Task 2.
4. **Cancelar um lançamento enquanto outro fechamento tenta incluir os mesmos cupons.** Esperado: o índice único decide; o perdedor recebe erro claro, nunca pagamento duplo. → Task 2.
5. **Influenciador sem parceria, ou pedindo lançamento de outro.** Esperado: devolve vazio. Nunca erro que revele a existência do lançamento alheio. → Task 7.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `lib/settlements/periodo.ts` | Módulo puro: sugerir período e propor cupons elegíveis. Sem banco, sem React, sem `new Date()` implícito |
| `lib/settlements/types.ts` | Tipos compartilhados entre rota, tela e portal |
| `db/migrations/031_fechamentos.sql` | Tabelas, constraints, índice único, trigger de validação, RLS, grants |
| `db/migrations/032_fechamento_retroativo_caiiuxo.sql` | O pagamento de 01/10 virando lançamento |
| `app/api/finance/settlements/route.ts` | POST fechar período |
| `app/api/finance/settlements/[id]/pagar/route.ts` | POST registrar prova |
| `app/api/finance/settlements/[id]/cancelar/route.ts` | POST cancelar em aberto |
| `components/admin/financeiro/ListaDeLancamentos.tsx` | Lista por influenciador |
| `components/admin/financeiro/FecharPeriodo.tsx` | Sugestão + confirmação |
| `components/admin/financeiro/DetalheDoLancamento.tsx` | Cupons congelados + registrar pagamento |
| `app/admin/financeiro/page.tsx` | Composição das três acima |
| `components/portal/MeusPagamentos.tsx` | O que o influenciador vê |
| `components/admin/dashboard/AvisoDeFechamento.tsx` | O bloco de "há o que fechar" |

---

### Task 1: Módulo puro — período e elegibilidade

**Files:**
- Create: `lib/settlements/periodo.ts`
- Create: `lib/settlements/types.ts`
- Test: `tests/settlements/periodo.test.ts`

**Interfaces:**
- Consumes: `calcularComissao`, `VendaParaComissao`, `ContratoInfluencer` de `lib/commission.ts` (não alterar esse arquivo).
- Produces, em `lib/settlements/types.ts`:
  - `type Periodo = { de: string; ate: string }` — datas ISO `YYYY-MM-DD`, ambas inclusivas
  - `type CupomElegivel = { coupon_id: string; valor: number }`
  - `type VendaComUso = VendaParaComissao & { used_at: string | null }` — **`VendaParaComissao` não tem `used_at`**, e o recorte de período precisa dele. Estender aqui, em vez de mexer em `lib/commission.ts`, mantém os 137 testes atuais intactos e deixa a dependência num sentido só.
- Produces, em `lib/settlements/periodo.ts`:
  - `periodoSugerido(schedule: 'fim' | 'mensal', parceria: { starts_at: string; ends_at: string | null; status: 'ativa' | 'encerrada' }, hoje: Date): Periodo | null`
  - `cuponsElegiveis(cupons: VendaComUso[], contrato: ContratoInfluencer, periodo: Periodo): CupomElegivel[]`

- [ ] **Step 1: Escrever os testes que falham**

```ts
// periodoSugerido
test('mensal sugere o mes anterior fechado', () => {
  const p = periodoSugerido('mensal',
    { starts_at: '2026-06-01', ends_at: null, status: 'ativa' }, new Date('2026-07-15T12:00:00Z'))
  expect(p).toEqual({ de: '2026-06-01', ate: '2026-06-30' })
})

test('mensal nao sugere mes que ainda nao virou', () => {
  const p = periodoSugerido('mensal',
    { starts_at: '2026-07-01', ends_at: null, status: 'ativa' }, new Date('2026-07-15T12:00:00Z'))
  expect(p).toBeNull()
})

test('fim so sugere quando a parceria encerrou', () => {
  expect(periodoSugerido('fim',
    { starts_at: '2026-05-25', ends_at: null, status: 'ativa' }, new Date('2026-09-01T12:00:00Z'))).toBeNull()
  expect(periodoSugerido('fim',
    { starts_at: '2026-05-25', ends_at: '2026-08-18', status: 'encerrada' }, new Date('2026-09-01T12:00:00Z')))
    .toEqual({ de: '2026-05-25', ate: '2026-08-18' })
})

test('mensal nao propoe periodo anterior ao inicio da parceria', () => {
  const p = periodoSugerido('mensal',
    { starts_at: '2026-06-10', ends_at: null, status: 'ativa' }, new Date('2026-07-05T12:00:00Z'))
  expect(p).toEqual({ de: '2026-06-10', ate: '2026-06-30' })
})

// cuponsElegiveis — recorta por used_at
test('recorta por used_at, nao por verified_at', () => {
  const contrato = { commission_per_sale: 500, commission_starts_at: 1, fee_amount: 0,
                     commission_counts_from: 'parceria' as const, partnership_id: 'P1' }
  const cupons = [
    { id: 'c1', verified: true, paid: false, created_at: '2026-06-05', used_at: '2026-06-05',
      commission_per_sale: 500, partnership_id: 'P1' },
    { id: 'c2', verified: true, paid: false, created_at: '2026-07-02', used_at: '2026-07-02',
      commission_per_sale: 500, partnership_id: 'P1' },
  ]
  const r = cuponsElegiveis(cupons, contrato, { de: '2026-06-01', ate: '2026-06-30' })
  expect(r).toEqual([{ coupon_id: 'c1', valor: 500 }])
})

test('exclui nao conferido, ja pago e used_at nulo', () => { /* três casos, resultado vazio */ })

test('cupom sem retrato usa o valor do contrato no instante de fechar', () => {
  // commission_per_sale: null  ->  valor === contrato.commission_per_sale
})

test('respeita commission_starts_at contando a posicao da venda por created_at', () => {
  // starts_at 2 com duas vendas no periodo: so a segunda entra
})
```

- [ ] **Step 2: Rodar e confirmar que falham**

Run: `npx vitest run tests/settlements/periodo.test.ts`
Esperado: FAIL — módulo não existe.

- [ ] **Step 3: Implementar `periodoSugerido` e `cuponsElegiveis` em `lib/settlements/periodo.ts`**

`periodoSugerido` recebe `hoje` por parâmetro — nunca chamar `new Date()` dentro, pelo mesmo motivo de `lib/coupons/vencimento.ts`. Para `mensal`, o período é o mês civil anterior a `hoje`, com `de` recuado para `starts_at` quando a parceria começou no meio dele. Para `fim`, só existe período quando `status === 'encerrada'` e `ends_at` não é nulo.

`cuponsElegiveis` filtra por `used_at` dentro de `[de, ate]`, descarta `!verified`, `paid` e `used_at` nulo, e delega a ordenação/posição a `calcularComissao` — a regra de `commission_starts_at` não é reimplementada aqui.

- [ ] **Step 4: Rodar e confirmar que passam**

Run: `npx vitest run tests/settlements/periodo.test.ts`
Esperado: PASS. Depois `npx vitest run` inteiro: os 137 existentes continuam verdes.

- [ ] **Step 5: Commit**

```bash
git add lib/settlements tests/settlements
git commit -m "feat(fechamentos): modulo puro de periodo e elegibilidade"
```

---

### Task 2: Migration 031 — o livro de lançamentos

**Files:**
- Create: `db/migrations/031_fechamentos.sql`
- Create: `scripts/verifica-031.sql`

**Interfaces:**
- Produces: tabelas `public.settlements` e `public.settlement_items`; função `public.settlement_pode_incluir(p_settlement uuid, p_coupon uuid)`.

Colunas de `settlements`: `id uuid pk`, `partnership_id uuid not null references partnerships on delete restrict`, `tipo text not null`, `status text not null default 'aberto'`, `periodo_de date`, `periodo_ate date`, `valor numeric not null`, `paid_at timestamptz`, `forma text`, `identificador text`, `created_at timestamptz not null default now()`, `created_by text`.

Colunas de `settlement_items`: `id uuid pk`, `settlement_id uuid not null references settlements on delete cascade`, `coupon_id uuid not null references coupons on delete restrict`, `valor numeric not null`.

- [ ] **Step 1: Escrever o script de verificação `scripts/verifica-031.sql`**

Tudo em `begin … rollback`, no padrão de `scripts/verifica-030.sql`. Cada caso confere o **SQLSTATE**, não só "falhou", e cada caso usa os seus próprios dados — as duas lições de 03/11. Casos, nesta ordem:

| # | Caso | Esperado |
|---|---|---|
| 1 | incluir duas vezes o mesmo `coupon_id` | `23505` (índice único) |
| 2 | incluir cupom `used` com `used_at` nulo | recusa pelo trigger |
| 3 | incluir cupom de outra parceria | recusa pelo trigger |
| 4 | incluir cupom `verified = false` | recusa pelo trigger |
| 5 | `status='pago'` sem `paid_at` ou sem `forma` | `23514` (check) |
| 6 | apagar `partnership` com lançamento | `23503` (restrict) |
| 7 | **controle positivo:** fechar, incluir 2 cupons válidos, pagar | funciona |
| 8 | `moderator` lendo `settlements` | 0 linhas |
| 9 | `influencer` lendo `settlements` | 0 linhas |
| 10 | `finance` lendo e inserindo | funciona |

- [ ] **Step 2: Rodar o script contra o banco e confirmar que os casos 1–6 **passam** indevidamente**

Run: SQL Editor do Supabase, "Run without RLS" (tabelas temporárias — falso positivo do linter).
Esperado: tudo vermelho, porque nada existe ainda. É o controle negativo da migration.

- [ ] **Step 3: Escrever `db/migrations/031_fechamentos.sql`**

Constraints, nos valores exatos:

```sql
check (tipo in ('comissao','fixo','restituicao'))
check (status in ('aberto','pago','cancelado'))
check (status <> 'pago' or (paid_at is not null and forma is not null and length(btrim(forma)) > 0))
check (tipo <> 'comissao' or (periodo_de is not null and periodo_ate is not null and periodo_de <= periodo_ate))
create unique index settlement_items_coupon_unico on public.settlement_items (coupon_id);
```

O trigger `before insert on settlement_items` chama `settlement_pode_incluir` e levanta exceção. Ele valida **dados** (`verified`, `used_at`, parceria), não identidade — por isso dispara também para `service_role`, ao contrário da armadilha de 2026 em que regra dependente de `auth.uid()` virava trigger inerte. Regra que dependa de quem chama continua indo para política, nunca para cá.

RLS: `admin` e `finance` tudo; `moderator` e `influencer` **sem política nenhuma** sobre as duas tabelas. Grants revogados de `anon`.

- [ ] **Step 4: Aplicar e rodar o script de novo**

Esperado: os 10 casos `OK`, incluindo o controle positivo (#7) e os três de papel (#8, #9, #10).

- [ ] **Step 5: Commit**

```bash
git add db/migrations/031_fechamentos.sql scripts/verifica-031.sql
git commit -m "feat(fechamentos): tabelas, trava de cupom unico e politicas"
```

---

### Task 3: Migration 032 — o pagamento de 01/10 vira lançamento

**Files:**
- Create: `db/migrations/032_fechamento_retroativo_caiiuxo.sql`

**Interfaces:**
- Consumes: `settlements`, `settlement_items` da Task 2.

> **Forma de pagamento, confirmada pelo César em 11/11: `PIX`.** Sem identificador de transação — o campo `identificador` fica nulo, que é permitido. A constraint da Task 2 exige apenas `paid_at` e `forma`.

- [ ] **Step 1: Medir o estado antes**

```sql
select count(*) filter (where paid) as pagos, sum(commission_per_sale) filter (where paid) as total
from coupons c join influencers i on i.id = c.influencer_id
where i.instagram_handle = '@caiiuxo' and c.status = 'used';
```
Esperado: `pagos = 6`, `total = 3000`.

- [ ] **Step 2: Escrever a migration**

Um `settlements` de `tipo='comissao'`, `status='pago'`, `valor=3000`, `paid_at='2026-10-01 13:06:54+00'` (o carimbo do primeiro dos 6), `forma='PIX'`, `identificador=null`, `created_by='migration 032'`, período `de='2026-06-05'` / `ate='2026-06-30'` (primeiro e último `used_at` dos 6), na parceria encerrada `54b169d5-bfb8-4d9d-afbc-7a7322199089`. E 6 `settlement_items`, um por cupom, `valor=500` cada.

Selecionar os cupons **por `coupon_number`** (`FOX-ZZ7FQG`, `FOX-RXRS5P`, `FOX-NBRK79`, `FOX-LJ5CH9`, `FOX-SSYQEA`, `FOX-GB3J6K`), não por filtro de data — filtro pegaria cupom novo se esta migration rodasse duas vezes.

Não tocar em `coupons.paid`: já é `true`. A migration só cria o registro que faltava.

- [ ] **Step 3: Aplicar e conferir o invariante**

```sql
select (select count(*) from coupons where paid and status='used') as cupons_pagos,
       (select count(*) from settlement_items) as itens,
       (select sum(valor) from settlements where status='pago') as total_pago;
```
Esperado: `6, 6, 3000` — e **nenhum cupom pago fora de um fechamento**, que é a promessa da spec valendo desde a origem.

- [ ] **Step 4: Commit**

```bash
git add db/migrations/032_fechamento_retroativo_caiiuxo.sql
git commit -m "feat(fechamentos): pagamento de 01/10 ao @caiiuxo vira lancamento"
```

---

### Task 4: O fixo e a restituição nascem sozinhos

**Files:**
- Create: `db/migrations/033_fixo_e_restituicao_automaticos.sql`
- Modify: `scripts/verifica-031.sql` (acrescentar os casos 11–14)

**Interfaces:**
- Consumes: `settlements` (Task 2).
- Produces: trigger `after insert on partnerships`; `public.registrar_descumprimento(p_contrato uuid)` estendida.

A spec é explícita: *"O fixo e a restituição nascem `aberto` automaticamente"*, e isso **não contradiz** a decisão do César de que o Financeiro é quem fecha. Nascer aberto é uma conta a pagar **aparecendo**; fechar um ciclo é uma decisão **tomada**. O fixo já está no contrato no instante em que a parceria existe — não há o que decidir, só o que lembrar.

Sem esta tarefa, o aviso da Task 8 anunciaria restituições que nada cria, e a dívida do `fee_amount` listada no backlog continuaria aberta — que é justamente o que a spec diz vir encerrar.

- [ ] **Step 1: Escrever os casos de verificação**

Acrescentar a `scripts/verifica-031.sql`, mesmo padrão de `begin … rollback` e conferência de SQLSTATE:

| # | Caso | Esperado |
|---|---|---|
| 11 | criar parceria com `fee_amount = 1500` | nasce 1 `settlements` `tipo='fixo'`, `status='aberto'`, `valor=1500` |
| 12 | criar parceria com `fee_amount = 0` | **nenhum** lançamento — hoje todas as parcerias vivas têm fixo zero |
| 13 | `registrar_descumprimento` em contrato aceito com fee | nasce 1 `tipo='restituicao'`, `status='aberto'`, valor = `contracts.fee_a_restituir` |
| 14 | `registrar_descumprimento` chamado duas vezes | a segunda falha (o contrato já não está `aceito`), e **não** nasce segunda restituição |

- [ ] **Step 2: Rodar e confirmar que 11–14 falham**

Run: SQL Editor, "Run without RLS".
Esperado: 11, 13 e 14 vermelhos (nada cria lançamento ainda); 12 verde por acidente — nada cria nada. **Esse verde não conta como aprovação**: é o caso em que "não aconteceu" e "não foi medido" dão o mesmo resultado, e só vale depois que o 11 ficar verde.

- [ ] **Step 3: Implementar**

Trigger `after insert on partnerships`, quando `new.fee_amount > 0`, insere o `settlements` de `tipo='fixo'`. É regra de **dado**, não de identidade — dispara para `service_role` também, ao contrário de regra que dependa de `auth.uid()`.

`registrar_descumprimento` ganha, depois do `update contracts`, a inserção do `tipo='restituicao'` com `valor = fee`. A guarda `if not public.is_admin()` que já existe lá fica como está.

`fee_timing` **não** entra aqui: ele diz quando o fixo *vence*, e alimenta o aviso da Task 8 — não cria nem paga nada.

- [ ] **Step 4: Aplicar e rodar os 14 casos**

Esperado: os 14 `OK`.

- [ ] **Step 5: Commit**

```bash
git add db/migrations/033_fixo_e_restituicao_automaticos.sql scripts/verifica-031.sql
git commit -m "feat(fechamentos): fixo e restituicao nascem como conta a pagar"
```

---

### Task 5: Rotas — fechar, pagar, cancelar

**Files:**
- Create: `app/api/finance/settlements/route.ts`
- Create: `app/api/finance/settlements/[id]/pagar/route.ts`
- Create: `app/api/finance/settlements/[id]/cancelar/route.ts`
- Test: `tests/settlements/rotas.test.ts`

**Interfaces:**
- Consumes: `cuponsElegiveis`, `periodoSugerido` (Task 1); tabelas (Task 2).
- Produces: `POST /api/finance/settlements` body `{ partnership_id, periodo: Periodo }` → `{ settlement_id, valor, itens: number }`; `POST .../[id]/pagar` body `{ paid_at, forma, identificador? }`; `POST .../[id]/cancelar` sem body.

- [ ] **Step 1: Escrever os testes que falham**

Testes unitários sobre as funções puras de guarda que as rotas usam (o padrão de `app/api/admin/influencer-save/route.ts`):

```ts
test('allowlist de pagar aceita so paid_at, forma e identificador', () => {
  expect(camposDePagamento({ paid_at: 'x', forma: 'PIX', status: 'cancelado', valor: 1 }))
    .toEqual({ paid_at: 'x', forma: 'PIX' })
})
test('fechar recusa periodo sem cupom elegivel', () => { /* erro 422, mensagem */ })
test('cancelar recusa lancamento pago', () => { /* erro 409 */ })
test('so admin e finance passam na guarda de papel', () => { /* moderator e influencer: false */ })
```

- [ ] **Step 2: Rodar e confirmar que falham**

Run: `npx vitest run tests/settlements/rotas.test.ts`

- [ ] **Step 3: Implementar as três rotas**

Papel verificado na rota (`admin` ou `finance`) **e** na RLS. Fechar: calcula com `cuponsElegiveis`, insere `settlements` + `settlement_items` e devolve o id; **não** marca `coupons.paid`. Pagar: grava a prova e, na mesma transação, marca `paid = true, paid_at, paid_by` nos cupons do lançamento — é o único lugar do sistema que escreve nesses campos. Cancelar: só se `aberto`; apaga os itens.

Allowlist fechada por rota, no padrão do projeto — nunca repassar o body.

- [ ] **Step 4: Rodar os testes e o typecheck**

Run: `npx vitest run && npx tsc --noEmit`

- [ ] **Step 5: Sondar ao vivo as consultas ao Supabase, com controle negativo**

String de `select`/embed não é validada por `tsc` nem por teste unitário (lição de observação anterior do projeto). Chamar as três rotas em sequência contra o banco real com um lançamento de teste, e **apagá-lo em seguida**; conferir que o cupom volta a elegível depois do cancelamento.

- [ ] **Step 6: Commit**

```bash
git add app/api/finance tests/settlements/rotas.test.ts
git commit -m "feat(fechamentos): rotas de fechar, pagar e cancelar"
```

---

### Task 6: Tela do Financeiro

**Files:**
- Create: `app/admin/financeiro/page.tsx`
- Create: `components/admin/financeiro/ListaDeLancamentos.tsx`
- Create: `components/admin/financeiro/FecharPeriodo.tsx`
- Create: `components/admin/financeiro/DetalheDoLancamento.tsx`
- Modify: o menu do admin, para incluir **Financeiro** visível a `admin` e `finance`

**Interfaces:**
- Consumes: as três rotas da Task 5.

- [ ] **Step 1: Construir a tela**

Organizada por influenciador: o que está aberto, o que foi pago, e o botão de fechar período com o valor sugerido por `periodoSugerido`. O detalhe lista os cupons congelados com o valor de cada um.

Padrão de edição já estabelecido em outubro: **um** botão por linha, e a ação mora junto da informação sobre a qual ela age — não "veja em X". Nenhum arquivo passa de 500 linhas; se passar, quebrar antes de commitar, não depois.

Na tela, `moderator` é **Lojista**.

- [ ] **Step 2: Conferir no navegador**

Fechar um período de teste, pagar, conferir que o cupom sai do elegível, cancelar outro e conferir que volta. Apagar o lançamento de teste ao fim.

- [ ] **Step 3: Rodar build, testes e lint**

Run: `npm run build && npx vitest run && npm run lint`
Esperado: build limpo, 137+ testes verdes, nenhum erro novo de lint.

- [ ] **Step 4: Commit**

```bash
git add app/admin/financeiro components/admin/financeiro
git commit -m "feat(fechamentos): tela do Financeiro"
```

---

### Task 7: O que o influenciador vê

**Files:**
- Create: `db/migrations/034_portal_fechamentos.sql`
- Create: `components/portal/MeusPagamentos.tsx`
- Modify: `lib/portal/dados.ts`

**Interfaces:**
- Produces: `public.portal_fechamentos()` → `(tipo text, periodo_de date, periodo_ate date, valor numeric, paid_at timestamptz)`.

- [ ] **Step 1: Escrever a função e os casos de verificação**

`security definer`, `set search_path to 'public'`, descobrindo o dono pela sessão como as demais `portal_*`. **Não seleciona `forma` nem `identificador`** — o corte é no SQL, porque RLS filtra linha e não coluna. `revoke execute from anon`.

Casos, em `begin … rollback`:

| Caso | Esperado |
|---|---|
| influenciador com lançamentos | só os dele |
| influenciador sem parceria | 0 linhas, sem erro |
| colunas devolvidas | `forma` e `identificador` ausentes |
| `anon` chamando | recusado |

- [ ] **Step 2: Aplicar e rodar os casos**

- [ ] **Step 3: Montar o bloco no portal**

Lista simples: tipo, período, valor, data de pagamento. Nada de prova.

- [ ] **Step 4: Commit**

```bash
git add db/migrations/034_portal_fechamentos.sql components/portal lib/portal
git commit -m "feat(fechamentos): o influenciador ve o que recebeu"
```

---

### Task 8: O aviso no Dashboard

**Files:**
- Create: `components/admin/dashboard/AvisoDeFechamento.tsx`
- Create: `lib/settlements/pendencias.ts`
- Test: `tests/settlements/pendencias.test.ts`

**Interfaces:**
- Produces: `pendenciasDeFechamento(parcerias, lancamentos, hoje: Date): Pendencia[]`

- [ ] **Step 1: Escrever os testes que falham**

Os quatro casos da spec, como módulo puro com `hoje` por parâmetro: parceria `mensal` cujo mês virou e tem comissão conferida em aberto; parceria encerrada com comissão em aberto; fixo vencido pelo `fee_timing` e não pago; restituição registrada e não recebida.

- [ ] **Step 2: Rodar e confirmar que falham**

- [ ] **Step 3: Implementar o módulo e o bloco**

No padrão do aviso de vencimento de cupom, que já vive no Dashboard.

- [ ] **Step 4: Rodar tudo**

Run: `npm run build && npx vitest run && npm run lint`

- [ ] **Step 5: Commit**

```bash
git add components/admin/dashboard lib/settlements/pendencias.ts tests/settlements/pendencias.test.ts
git commit -m "feat(fechamentos): aviso de que ha o que fechar"
```

---

## Critério que amarra

A spec amarrava em *"o 'a pagar' do @caiiuxo continua R$ 3.000"*. Esse número foi pago em 01/10 e o critério morreu com ele. O que o substitui, medido antes e depois de tudo:

1. **Nenhum número de tela muda.** O "a pagar" do @caiiuxo é **R$ 0** antes e depois; o da @mariannegimenes é **R$ 0** antes e depois (298 cupons, zero conferidos). Se qualquer um dos dois se mexer, o `calcularComissao` foi tocado — e ele não deve ser.

2. **Nenhum cupom pago fora de um fechamento**, desde a origem:
```sql
select count(*) from coupons c
 where c.paid and not exists (select 1 from settlement_items i where i.coupon_id = c.id);
```
Esperado: **0**. Hoje seria 6.

3. **O portal do @caiiuxo passa a mostrar o pagamento de R$ 3.000 de 01/10** — que hoje ele não tem como ver — e **sem** forma nem identificador.

4. Os 137 testes atuais continuam verdes, e `calcularComissao` não muda uma linha.

## Fora deste plano

Já está em `docs/BACKLOG.md`, e não volta para rodapé de plano:

- Anexo de comprovante (exigiria Supabase Storage, que não existe no projeto).
- Fechamento automático por `pg_cron` — recusado pelo César em 24/08.
- Pagamento em lote de vários influenciadores.
- **Os testes de banco deste subsistema dormem** junto com os 19 que já dormem, porque exigem `SUPABASE_DB_URL` e o César preferiu não usar a senha do Postgres de produção. Esta entrega **aumenta** essa dívida. O caminho para acordá-los é um projeto Supabase separado para teste.
- O buraco do `coupons_guard_non_admin_update`, que deixa o Financeiro reescrever o retrato de comissão (4 campos no trigger). **Vizinho perigoso deste subsistema** — o retrato é o que o fechamento congela — mas é conserto próprio, não tarefa daqui.
