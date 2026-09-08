# Indique um Amigo — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um braço novo sobre a mesma base: quem tem o cupom ganha R$ 300 de desconto, indica **um** amigo, e recebe **R$ 300 no PIX** se esse amigo comprar.

**Architecture:** Nenhuma tabela nova. `coupons` ganha um discriminador (`kind`) e as colunas da indicação. As travas são **índice e CHECK, nunca trigger** — os triggers desistem na primeira linha para `service_role`, que é o caminho por onde todo cupom nasce. A campanha é o **lote**.

**Tech Stack:** Next.js 16.2.6 (App Router, `proxy.ts`), React 19, Supabase (Postgres + RLS), Tailwind v4, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-02-indique-um-amigo-design.md`

## Global Constraints

- **Regra nova nunca vira trigger.** Os dois triggers de `coupons` começam com `if auth.uid() is null or is_admin() then return new`, e `auth.uid()` é NULL para `service_role` — que é o que as duas rotas de criação usam. Trava é **índice ou CHECK**.
- **A indicação não escreve em `coupons.paid` nem em `commission_per_sale`.** A spec de 24/08 decidiu que só um fechamento marca `paid`. Dois escritores no mesmo campo é a divergência que aquela spec existe para evitar. O PIX tem campos próprios.
- **A campanha é o lote.** `UNIQUE (customer_cpf, campaign_id)` já existe, sem filtro de status: um CPF queima na campanha para sempre. "Entrar de novo" é entrar no lote seguinte — e é essa trava que limita a fraude do vendedor-cunhada a R$ 300 por CPF cúmplice.
- **Os crashes vêm antes da migration.** Tornar `influencer_id` nulável não gera **nenhum** erro de compilação: os tipos são escritos à mão em cada componente e a inferência nem roda. A lista de arquivos **é** a entrega.
- **A migração sobe junto com o código.** Foi assim que o balcão ficou 12 dias fora do ar em agosto.
- Teste de banco em transação com `rollback`; regra de negócio em função pura.
- Na interface, `moderator` se chama **Lojista**.
- O influenciador não vê dado de cliente além do primeiro nome. Vale para o braço novo: **o balcão não mostra o CPF do indicador** — quem precisa dele é o Financeiro.

---

### Task 1: Blindar os quatro pontos que quebram com influenciador nulo

Nada muda de comportamento. O sistema fica pronto para o nulo, ainda com `influencer_id` NOT NULL — então esta task é reversível e não tem risco de produção.

**Files:**
- Modify: `app/admin/(protected)/validar/ValidarClient.tsx` (tipo ~28, uso ~333)
- Modify: `components/CouponCard.tsx` (tipo ~13, uso ~192)
- Modify: `components/admin/ExpressSuccess.tsx` (~44)
- Modify: `app/cupom/[coupon_number]/page.tsx` (~64, o cast que apaga a checagem)
- Modify: `app/admin/(protected)/page.tsx` (a lista de cupons recentes também embute `influencers`)
- Modify: `lib/supabase/types.ts` (`coupons.influencer_id` passa a `string | null`)

**Interfaces:**
- Produces: em toda tela, `influencers` passa a `{ name: string; instagram_handle: string } | null`, e a origem do cupom é exibida por um helper comum.

- [ ] **Step 1: Um helper só, para as quatro telas dizerem a mesma coisa**

Criar `lib/coupons/origem.ts`:

```ts
/**
 * De onde veio o cupom, em uma linha, para a tela.
 *
 * Existe porque a partir da indicacao um cupom pode NAO ter influenciador, e
 * quatro telas liam `coupon.influencers.instagram_handle` direto. Uma delas e a
 * do balcao, sem error boundary: objeto nulo ali e tela branca no meio da venda.
 */
export function rotuloDaOrigem(c: {
  influencers?: { instagram_handle: string } | null
  referrer_nome?: string | null
}): { titulo: string; valor: string } {
  if (c.influencers?.instagram_handle) {
    return { titulo: 'Indicado por', valor: c.influencers.instagram_handle }
  }
  if (c.referrer_nome) {
    return { titulo: 'Indicado por', valor: c.referrer_nome }
  }
  return { titulo: 'Origem', valor: 'Campanha FoxCycles' }
}
```

- [ ] **Step 2: Testes do helper**

```ts
it('mostra o @ quando veio de influenciador', () => {
  expect(rotuloDaOrigem({ influencers: { instagram_handle: '@caiiuxo' } }))
    .toEqual({ titulo: 'Indicado por', valor: '@caiiuxo' })
})
it('mostra o primeiro nome quando veio de indicacao', () => {
  expect(rotuloDaOrigem({ influencers: null, referrer_nome: 'Marcos' }))
    .toEqual({ titulo: 'Indicado por', valor: 'Marcos' })
})
it('nao quebra quando nao ha nem um nem outro', () => {
  // O caso que derrubaria a tela do balcao.
  expect(rotuloDaOrigem({ influencers: null }).valor).toBe('Campanha FoxCycles')
})
```

- [ ] **Step 3: Rodar e ver falhar**
- [ ] **Step 4: Trocar os quatro usos pelo helper, e os tipos para `| null`**

Em `app/cupom/[coupon_number]/page.tsx`, **remover o cast**. Ele apaga exatamente a checagem que este trabalho está adicionando.

- [ ] **Step 5: Conferir na tela** — validar um cupom real no balcão continua mostrando `@handle`.

- [ ] **Step 6: Commit**

```bash
git commit -m "fix: telas aguentam cupom sem influenciador, antes de existir um"
```

---

### Task 2: O discriminador `kind`, e os números do admin separados por braço

**Files:**
- Create: `db/migrations/026_kind_no_cupom.sql`
- Modify: `app/admin/(protected)/page.tsx` (contadores), `app/admin/(protected)/cupons/page.tsx` (filtro), `components/admin/cupons/CuponsFilters.tsx`

**Interfaces:**
- Produces: `coupons.kind` (`'influenciador' | 'indicacao'`, NOT NULL, default `influenciador`).

- [ ] **Step 1: A migration**

```sql
alter table public.coupons
  add column if not exists kind text not null default 'influenciador'
  check (kind in ('influenciador','indicacao'));

create index if not exists coupons_kind on public.coupons (kind);
```

O default cuida do backfill: toda linha existente é do braço do influenciador.

- [ ] **Step 2: Separar os contadores do dashboard**

Os três `count: 'exact'` de `app/admin/(protected)/page.tsx` não filtram nada hoje. Sem `.eq('kind','influenciador')`, "Cupons Gerados", "Vendas Realizadas", "Expirados" e a taxa de conversão passariam a somar os dois braços numa métrica só — e ninguém perceberia, porque o número continua plausível.

- [ ] **Step 3: Filtro por braço na tela de Cupons**

Hoje o filtro por influenciador é opcional: no estado padrão a lista misturaria os dois. Entra um seletor **Origem: todos / influenciador / indicação**, com o mesmo formato dos filtros que já existem.

- [ ] **Step 4: Aplicar a migration e conferir** que os números do dashboard não mudaram (não há cupom de indicação ainda, então têm de ser idênticos).

- [ ] **Step 5: Commit**

---

### Task 3: As colunas da indicação, e `influencer_id` nulável

A task de maior risco. Só depois das duas anteriores.

**Files:**
- Create: `db/migrations/027_indicacao.sql`
- Test: `tests/indicacao.db.test.ts`

- [ ] **Step 1: A migration**

```sql
alter table public.coupons
  add column if not exists referred_by_coupon_id uuid
    references public.coupons(id) on delete restrict,
  add column if not exists referral_code text,
  add column if not exists referrer_cpf text,
  add column if not exists referrer_nome text,
  add column if not exists referral_amount numeric,
  add column if not exists referral_paid boolean not null default false,
  add column if not exists referral_paid_at timestamptz,
  add column if not exists referral_paid_by uuid;

-- O codigo de indicacao e DIFERENTE do numero do cupom de proposito: se fossem
-- o mesmo, o papel impresso do A viraria o link dele, e quem visse o papel
-- indicaria no lugar dele.
create unique index if not exists coupons_referral_code_unico
  on public.coupons (referral_code) where referral_code is not null;

-- UM amigo por cupom. Indice, nao trigger: trigger e contornado pelo
-- service_role, que e o caminho real de criacao.
-- O filtro de status faz a vaga REABRIR sozinha quando o cupom do amigo vence.
create unique index if not exists coupons_um_amigo_por_cupom
  on public.coupons (referred_by_coupon_id)
  where referred_by_coupon_id is not null and status in ('pending','used');

-- Autoindicacao. Comparacao entre LINHAS nao cabe em CHECK; por isso o CPF do
-- indicador e desnormalizado -- traz o dado para a mesma linha e o CHECK passa
-- a valer sempre, inclusive por service_role.
alter table public.coupons drop constraint if exists coupons_sem_autoindicacao;
alter table public.coupons add constraint coupons_sem_autoindicacao
  check (referrer_cpf is null or referrer_cpf <> customer_cpf);

-- A indicacao nao tem influenciador; o do influenciador continua obrigatorio.
alter table public.coupons alter column influencer_id drop not null;
alter table public.coupons drop constraint if exists coupons_origem_coerente;
alter table public.coupons add constraint coupons_origem_coerente check (
  (kind = 'influenciador' and influencer_id is not null)
  or (kind = 'indicacao' and influencer_id is null)
);
```

- [ ] **Step 2: Provar em transação com rollback**

Um teste por trava, e **cada um pelo caminho `service_role`**, que é o real:

| O que tentar | Esperado |
|---|---|
| indicar dois amigos pelo mesmo cupom | negado pelo índice |
| indicar a si mesmo (`referrer_cpf = customer_cpf`) | negado pelo CHECK |
| segundo cupom para o mesmo CPF na mesma campanha | negado pelo índice que já existia |
| cupom `kind = 'indicacao'` **com** `influencer_id` | negado pelo CHECK de coerência |
| cupom `kind = 'influenciador'` **sem** `influencer_id` | negado pelo CHECK de coerência |
| vencer o cupom do amigo e indicar outro | **permitido** — a vaga reabre |

- [ ] **Step 3: Aplicar, e conferir que o braço do influenciador não mudou** — criar um cupom pelo fluxo normal e validar no balcão.

- [ ] **Step 4: Commit**

---

### Task 4: A rota de criação e a página pública da indicação

**Files:**
- Create: `app/i/[referral_code]/page.tsx`, `app/api/indicacao/route.ts`
- Create: `lib/indicacao/criar.ts`
- Modify: `proxy.ts` (matcher)

**Rota própria, e não generalizar `/c/[coupon_code]`:** aquela é indexada por `influencers.coupon_code` e faz `notFound()`; um código de indicação lá daria 404. E `app/api/coupons/route.ts` exige `influencer_code` e tira **todos** os termos da parceria, com cinco `parceria!` seguidos — sem parceria ela estoura na linha 83.

- [ ] **Step 1: `lib/indicacao/criar.ts`** — os termos vêm da **campanha** (o lote), não de parceria. Grava o retrato (`discount_type`, `discount_value`) no próprio cupom, como o braço do influenciador já faz.
- [ ] **Step 2: A rota**, com o mesmo rate limit de `/api/coupons`.
- [ ] **Step 3: A página** `/i/[referral_code]` — mostra quem indicou (**só o primeiro nome**), o desconto, e o formulário.
- [ ] **Step 4: Conferir os erros na tela**: vaga já usada, CPF já com cupom no lote, autoindicação. Cada um com frase própria — "não foi possível" não ajuda ninguém.
- [ ] **Step 5: Commit**

---

### Task 5: Balcão — busca por CPF e impressão

**Files:**
- Modify: `app/admin/(protected)/validar/ValidarClient.tsx`, `app/api/admin/influencer-lookup/route.ts`
- Create: `app/cupom/[coupon_number]/imprimir/page.tsx`

**Busca por CPF entra** — decidido pelo César em 08/09. Hoje um CPF digitado cai no ramo de influenciador e volta "Código não encontrado". Como o cupom é nominal e a compra de uma moto demora, quem esquece o código fica sem caminho nenhum.

- [ ] **Step 1: Reconhecer o que foi digitado** — `FOX-…`, código de influenciador, ou 11 dígitos. Testes da função pura de classificação.
- [ ] **Step 2: A busca por CPF** devolve os cupons daquele CPF com situação; se houver mais de um, a tela lista para o vendedor escolher.
- [ ] **Step 3: A impressão.** O papel leva: código, nome e CPF de quem usa, **só o primeiro nome de quem indicou**, validade, a regra em uma linha, e campos em branco para NF e assinatura do vendedor. Não leva o CPF do indicador.
- [ ] **Step 4: Commit**

---

### Task 6: Financeiro — a fila do PIX

**Files:**
- Modify: `app/admin/(protected)/cupons/` (aba ou filtro "PIX a pagar")
- Create: `app/api/admin/referral-pay/route.ts`

**O Financeiro paga ao validar** — decidido em 02/09, e viável porque a NF sai no ato da venda (confirmado em 08/09).

**Ninguém digita chave PIX.** O destino é o CPF do indicador, que já está na linha. Perguntar a chave criaria dois riscos: erro de digitação num PIX que não volta, ou o amigo informar a própria chave e embolsar os R$ 300 do indicador.

- [ ] **Step 1: A fila** — cupons `kind = 'indicacao'`, `verified = true`, `referral_paid = false`, com nome e CPF do indicador e o valor.
- [ ] **Step 2: A rota de baixa** — `requireRole(['admin','finance'])`, grava `referral_paid`, `referral_paid_at`, `referral_paid_by`.
- [ ] **Step 3: Falha de PIX é visível.** Quando o CPF não estiver cadastrado como chave no banco do indicador, o PIX não sai; a tela precisa permitir marcar como pendência, não sumir com o caso.
- [ ] **Step 4: Commit**

---

## Self-Review

**Cobertura da spec:** 8 regras (3, 4) · lote como trava anti-fraude (2, 3) · índice e CHECK, nunca trigger (3) · sem escrever em `paid`/`commission_per_sale` (6) · `influencer_id` nulável e os crashes (1, 3) · números do admin separados (2) · rota e página próprias (4) · balcão com CPF e impressão (5) · fila do PIX (6) · privacidade do CPF do indicador (5).

**Ordem:** a Task 1 não muda comportamento nenhum e é reversível; a Task 3 é irreversível na prática. Entre elas, a Task 2 separa os números **antes** de existir cupom que os contamine. Inverter isso significa contaminar métrica sem ninguém perceber, porque o número continua plausível.

**Tipos:** `rotuloDaOrigem` nasce na Task 1 e é consumido por quatro telas. `kind` nasce na Task 2 e é filtro na 2, discriminador de índice na 3 e da fila na 6. O compilador **não** ajuda aqui — os tipos de cupom são escritos à mão em cada componente, e a lista de arquivos da Task 1 é a entrega.

## Ainda em aberto (não travam começar)

- **O A indicou, o cupom do A venceu, e o B compra depois — o A recebe?** A proposta é que sim: o direito segue o cupom do B. Decide antes da Task 6.
- **A janela de verificação** antes de pagar. PIX no mesmo dia vai contra o que a spec de 28/07 apontou como maior melhoria. Decisão consciente?
- **Tratamento fiscal do PIX** — do César, com o contador. Aqui é cliente comum, sem contrato. Levar **antes** de rodar o primeiro lote.
