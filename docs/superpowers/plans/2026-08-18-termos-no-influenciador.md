# Termos no influenciador — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tirar os termos da campanha e colocá-los no influenciador, para que cada parceria tenha seu prazo, seus valores, e possa ser prorrogada ou renovada sem mexer no link nem afetar as outras.

**Architecture:** Os campos de oferta descem de `campaigns` para `influencers`, e a campanha vira modelo de preenchimento mais rótulo de relatório. O cupom passa a gravar o retrato do que valia quando nasceu — sem isso, renovar reescreveria o histórico e recalcularia comissão já paga. A morte do link deixa de depender da campanha e passa a depender do influenciador estar ativo e dentro do prazo.

**Tech Stack:** Next.js 16.2.6 (App Router), React 19, Tailwind v4, Supabase (Postgres + RLS), TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-18-termos-no-influenciador-design.md`

## Global Constraints

- Verificação = `npx tsc --noEmit`, `npx eslint .`, `npx next build` e `npm test`.
- Arquivos abaixo de **500 linhas** (`CLAUDE.md`).
- Este **não é o Next.js que você conhece** (`AGENTS.md`). Ler `node_modules/next/dist/docs/` antes de mexer em rota ou página.
- Ler o arquivo antes de editar. Nunca commitar segredos.
- Colunas em **inglês**, rótulos de tela em **português**.
- Toda regra de permissão vale na API **e** no banco.
- Banco de **produção**, compartilhado com o fc-digitalcard (`card_*`). Não tocar fora de `coupons`, `influencers`, `campaigns`, `sellers`, `admin_profiles`.
- Migrations via MCP (`apply_migration`), SQL versionado em `db/migrations/`.
- Project ID: `uufrrhqrafxybdhkhvln`.
- Papéis: `admin`, `finance` (Financeiro), `moderator` (**Lojista**).

## A ordem importa

São 11 pontos do código que leem da campanha. A ordem das tasks garante que **o sistema nunca fique quebrado no meio**: primeiro o banco ganha as colunas com os valores copiados (nada muda de comportamento), depois cada leitor migra para a fonte nova, e só no fim a campanha para de mandar no link.

```
1. Banco: colunas + cópia dos valores          → nada muda ainda
2. Landing lê do influenciador + prazo         → o link muda de dono
3. Criação de cupom grava o retrato            → cupons novos nascem completos
4. Exibição passa a usar o retrato             → telas param de depender da campanha
5. Comissão usa o retrato                      → dinheiro para de ser recalculado
6. Formulário: campanha vira modelo            → cadastro no formato novo
7. Prorrogar e Renovar                         → as duas operações
```

## Estado a preservar (18/08/2026)

```
Reinauguração Campinas    R$ 200 · 30d · 16 influencers · inativa
Parceria Caiixo           R$ 300 · 60d ·  1 influencer  · inativa
Influenciadores Campinas  R$ 200 · 45d ·  1 influencer  · ATIVA (Mariana)
```

**Ninguém pode mudar de termo na conversão.** Quem está com R$ 300 continua com R$ 300.

---

### Task 1: Migração — colunas e cópia dos valores

**Files:**
- Create: `db/migrations/008_termos_no_influenciador.sql`
- Modify: `lib/supabase/types.ts`

**Interfaces:**
- Produces: em `influencers` — `discount_type`, `discount_value`, `validity_days`, `coupon_title`, `coupon_description`, `partnership_ends_at`, `commission_count_since`. Em `coupons` — `discount_type`, `discount_value`, `commission_per_sale`.

- [ ] **Step 1: Fotografar o estado antes**

```sql
select i.instagram_handle, c.name as campanha, c.discount_type, c.discount_value, c.validity_days
from public.influencers i join public.campaigns c on c.id = i.campaign_id
order by i.instagram_handle;
```

Salvar o resultado. É contra ele que a conferência do Step 4 vai bater.

- [ ] **Step 2: Escrever a migração**

Criar `db/migrations/008_termos_no_influenciador.sql`:

```sql
-- 008_termos_no_influenciador.sql
-- Ver docs/superpowers/specs/2026-08-18-termos-no-influenciador-design.md
--
-- Os termos descem da campanha para o influenciador. A campanha vira modelo de
-- preenchimento e rotulo de relatorio -- para de mandar no link.
--
-- O cupom passa a gravar o RETRATO do que valia quando nasceu. Sem isso,
-- renovar um influenciador reescreveria o passado: cupons antigos passariam a
-- mostrar o desconto novo, e a comissao ja paga seria recalculada pelo valor
-- novo.

alter table public.influencers
  add column if not exists discount_type          text,
  add column if not exists discount_value         numeric,
  add column if not exists validity_days          integer,
  add column if not exists coupon_title           text,
  add column if not exists coupon_description     text,
  -- Prazo da parceria. NULO = sem prazo. Nasce nulo para ninguem perder o link
  -- na conversao; definir prazo passa a ser ato deliberado.
  add column if not exists partnership_ends_at    date,
  -- A partir de quando contar vendas para a posicao da comissao. Renovar
  -- zerando a contagem grava a data da renovacao; renovar mantendo deixa nulo.
  add column if not exists commission_count_since date;

-- Retrato no cupom: o que valia no momento em que ele nasceu.
alter table public.coupons
  add column if not exists discount_type       text,
  add column if not exists discount_value      numeric,
  add column if not exists commission_per_sale numeric;

-- Copia os termos da campanha para dentro de cada influenciador.
update public.influencers i
   set discount_type      = c.discount_type,
       discount_value     = c.discount_value,
       validity_days      = c.validity_days,
       coupon_title       = c.coupon_title,
       coupon_description = c.coupon_description
  from public.campaigns c
 where c.id = i.campaign_id
   and i.discount_type is null;

-- Retrato dos cupons ja existentes, lido da campanha em que nasceram e da
-- comissao vigente do influenciador. E o melhor retrato possivel do passado.
update public.coupons cp
   set discount_type       = c.discount_type,
       discount_value      = c.discount_value,
       commission_per_sale = i.commission_per_sale
  from public.campaigns c, public.influencers i
 where c.id = cp.campaign_id
   and i.id = cp.influencer_id
   and cp.discount_type is null;

-- A partir daqui todo influenciador tem termos proprios.
alter table public.influencers
  alter column discount_type  set not null,
  alter column discount_value set not null,
  alter column validity_days  set not null;

alter table public.influencers
  add constraint influencers_discount_type_check
  check (discount_type = any (array['fixed'::text, 'percentage'::text]));
```

- [ ] **Step 3: Aplicar**

Via MCP: `apply_migration(project_id: "uufrrhqrafxybdhkhvln", name: "termos_no_influenciador", query: <conteúdo>)`.

- [ ] **Step 4: Conferir que ninguém mudou de termo**

```sql
select i.instagram_handle,
       c.discount_value as era, i.discount_value as agora,
       c.validity_days  as era_dias, i.validity_days as agora_dias,
       (c.discount_value = i.discount_value and c.validity_days = i.validity_days) as bateu
from public.influencers i join public.campaigns c on c.id = i.campaign_id
order by bateu, i.instagram_handle;
```

**Todos têm que dar `bateu = true`.** Se algum der falso, parar e investigar antes de seguir.

E o retrato dos cupons:

```sql
select count(*) as total,
       count(*) filter (where discount_value is null) as sem_retrato,
       count(*) filter (where commission_per_sale is null) as sem_comissao
from public.coupons;
```

`sem_retrato` e `sem_comissao` têm que ser **zero**.

- [ ] **Step 5: Atualizar os tipos**

Em `lib/supabase/types.ts`, acrescentar em `influencers` (Row obrigatório, Insert/Update opcionais):

```ts
discount_type: string
discount_value: number
validity_days: number
coupon_title: string | null
coupon_description: string | null
partnership_ends_at: string | null
commission_count_since: string | null
```

E em `coupons`:

```ts
discount_type: string | null
discount_value: number | null
commission_per_sale: number | null
```

- [ ] **Step 6: Verificar e commitar**

```bash
npx tsc --noEmit && npx next build && npm test
git add db/migrations/008_termos_no_influenciador.sql lib/supabase/types.ts
git commit -m "feat(db): termos descem da campanha para o influenciador"
```

Nada de comportamento mudou ainda — as colunas existem e estão preenchidas, mas ninguém lê delas.

---

### Task 2: A landing lê do influenciador e respeita o prazo

**Files:**
- Create: `lib/influencer-status.ts`
- Modify: `app/c/[coupon_code]/page.tsx`

**Interfaces:**
- Produces: `linkAtivo(inf: { active: boolean; partnership_ends_at: string | null }): boolean` — regra única de quando o link abre, usada também pelas rotas da Task 3.

É aqui que a campanha para de mandar no link.

- [ ] **Step 1: Trocar as duas consultas**

O arquivo tem dois selects (um em `generateMetadata`, outro na página). Ambos passam a ler do influenciador:

```ts
// generateMetadata
.select('instagram_handle, active, partnership_ends_at, discount_value, discount_type, coupon_title, coupon_description')
.eq('coupon_code', coupon_code.toUpperCase())
.maybeSingle()

// página
.select('*, campaigns(name)')
.eq('coupon_code', coupon_code.toUpperCase())
.maybeSingle()
```

Note que o filtro `.eq('active', true)` **sai da consulta** — a decisão passa a ser explícita no código, para poder distinguir "não existe" de "acabou".

- [ ] **Step 2: A regra de quando o link abre, num módulo só**

Criar `lib/influencer-status.ts`. Vive fora da página desde o começo porque a
Task 3 precisa da mesma regra nas rotas de API — se existirem duas cópias e
divergirem, o link abre num fluxo e fecha no outro.

```ts
/**
 * Quando o link do influenciador abre.
 *
 * Ate 18/08/2026 dependia da CAMPANHA estar ativa, o que derrubava todos os
 * influenciadores dela de uma vez -- em 18/08 isso deixou 17 de 18 links mortos
 * com todo mundo marcado como ativo. Agora depende so do influenciador.
 */
function linkAtivo(inf: { active: boolean; partnership_ends_at: string | null }): boolean {
  if (!inf.active) return false
  if (!inf.partnership_ends_at) return true // sem prazo definido
  // Compara so a data: a parceria vale ate o fim do dia combinado.
  return inf.partnership_ends_at >= new Date().toISOString().slice(0, 10)
}
```

E no corpo da página, trocar `if (!influencer) notFound()` e o `if (!campaign?.active) notFound()` por:

```ts
  if (!influencer || !linkAtivo(influencer)) notFound()
```

O bloco que lia `influencer.campaigns` para desconto e textos passa a ler do próprio influenciador. A campanha continua sendo lida **apenas** para o rodapé "Campanha: X".

- [ ] **Step 3: Verificar**

```bash
npx tsc --noEmit && npx eslint "app/c/[coupon_code]/page.tsx" && npx next build
```

- [ ] **Step 4: Testar os quatro casos em runtime**

Subir `npx next dev` e abrir `/c/CAIIUXO300`:

| Estado no banco | Esperado |
|---|---|
| influencer ativo, sem prazo | página abre com R$ 300 |
| influencer ativo, prazo no futuro | página abre |
| influencer ativo, prazo ontem | 404 |
| influencer inativo | 404 |

Para testar o prazo sem estragar nada, alterar e reverter:

```sql
update public.influencers set partnership_ends_at = current_date - 1 where coupon_code = 'CAIIUXO300';
-- testar, depois:
update public.influencers set partnership_ends_at = null where coupon_code = 'CAIIUXO300';
```

**Este é o teste que não pode falhar:** com campanha inativa e influenciador ativo sem prazo, a página tem que abrir. Era o que estava quebrado.

- [ ] **Step 5: Commit**

```bash
git add "app/c/[coupon_code]/page.tsx"
git commit -m "feat: link do influencer depende dele, nao da campanha"
```

---

### Task 3: Criação de cupom grava o retrato

**Files:**
- Modify: `app/api/coupons/route.ts`
- Modify: `app/api/admin/coupon-express/route.ts`
- Modify: `app/api/admin/influencer-lookup/route.ts`

**Interfaces:**
- Consumes: `linkAtivo` (copiar a regra para um módulo compartilhado — ver Step 1).

- [ ] **Step 1: Importar a regra do link**

`linkAtivo` já existe em `lib/influencer-status.ts` desde a Task 2. As três rotas desta task importam de lá:

```ts
import { linkAtivo } from '@/lib/influencer-status'
```

Não recriar a função. Duas cópias divergem, e aí o link abre num fluxo e fecha no outro.

- [ ] **Step 2: `/api/coupons` usa o influenciador**

Trocar a validação: em vez de `campaign?.active`, usar `linkAtivo(influencer)`. A validade passa a vir de `influencer.validity_days`, e o insert grava o retrato:

```ts
    if (!linkAtivo(influencer)) {
      return NextResponse.json({ error: 'Este link não está mais ativo.' }, { status: 400 })
    }

    const expiresAt = addDays(new Date(), influencer.validity_days)

    const result = await insertCouponWithRetry(supabase, {
      influencer_id: influencer.id,
      campaign_id: influencer.campaign_id,
      // Retrato: o que valia agora. Ver a spec.
      discount_type: influencer.discount_type,
      discount_value: influencer.discount_value,
      commission_per_sale: influencer.commission_per_sale,
      customer_name: customer_name.trim(),
      customer_cpf: cpfClean,
      customer_phone: phoneClean,
      customer_email: customer_email.trim().toLowerCase(),
      status: 'pending',
      expires_at: expiresAt.toISOString(),
    }, 'coupon_number')
```

- [ ] **Step 3: `coupon-express` faz o mesmo**

Mesma troca: `linkAtivo`, `validity_days` do influenciador, e os três campos de retrato no insert. O express recebe `influencer_id` no corpo, então precisa buscar o influenciador antes — hoje ele busca só a campanha.

- [ ] **Step 4: `influencer-lookup` devolve os termos do influenciador**

O balcão usa essa rota para mostrar o desconto antes de cadastrar. Trocar `.select('*, campaigns(*)')` por `.select('*, campaigns(name)')` e a validação de campanha ativa por `linkAtivo`.

O `ValidarClient` lê `influencer.campaigns.discount_value` — passa a ler `influencer.discount_value`.

- [ ] **Step 5: Verificar**

```bash
npx tsc --noEmit && npx eslint app/api lib && npx next build
```

- [ ] **Step 6: Testar a criação ponta a ponta**

Gerar um cupom real pelo link `/c/CAIIUXO300` e conferir o retrato:

```sql
select coupon_number, discount_type, discount_value, commission_per_sale, expires_at
from public.coupons order by created_at desc limit 1;
```

Esperado: R$ 300, comissão R$ 500, validade 60 dias à frente. Apagar o cupom de teste depois.

- [ ] **Step 7: Commit**

```bash
git add app/api lib/influencer-status.ts "app/c/[coupon_code]/page.tsx" components/admin/ValidarClient.tsx
git commit -m "feat: cupom nasce com o retrato do que valia"
```

---

### Task 4: Exibição passa a usar o retrato

**Files:**
- Modify: `app/api/coupons/validate/route.ts`, `app/cupom/[coupon_number]/page.tsx`, `app/admin/(protected)/cupons/page.tsx`, `components/admin/cupons/types.ts`, `components/CouponCard.tsx`, `components/admin/ExpressSuccess.tsx`, `components/admin/cupons/exportCupons.ts`

**Interfaces:**
- Consumes: as colunas de retrato da Task 1.

Todo lugar que hoje mostra `coupon.campaigns.discount_value` passa a mostrar `coupon.discount_value`.

- [ ] **Step 1: Uma função só para formatar o desconto**

Em `components/admin/cupons/types.ts`, trocar `discountLabel` para preferir o retrato e cair na campanha só se o retrato faltar:

```ts
export function discountLabel(c: {
  discount_type?: string | null
  discount_value?: number | null
  campaigns?: { discount_type: string; discount_value: number } | null
}) {
  // O retrato manda. A campanha e so rede para cupom anterior a migracao --
  // que nao deveria existir, mas nao custa.
  const tipo = c.discount_type ?? c.campaigns?.discount_type
  const valor = c.discount_value ?? c.campaigns?.discount_value
  if (tipo == null || valor == null) return '—'
  return tipo === 'fixed' ? `R$ ${valor}` : `${valor}%`
}
```

- [ ] **Step 2: Trocar os selects**

Nos três selects de `validate/route.ts`, no `cupom/[coupon_number]/page.tsx` e no `cupons/page.tsx`, o `campaigns(...)` pode enxugar para `campaigns(name)` — o desconto vem do próprio cupom agora. Os campos `discount_type`, `discount_value` já vêm no `*`.

- [ ] **Step 3: Ajustar os componentes**

`CouponCard.tsx`, `ExpressSuccess.tsx` e `ValidarClient.tsx` passam a ler `coupon.discount_value` / `coupon.discount_type`.

`exportCupons.ts` já usa `discountLabel`, então herda a mudança do Step 1.

- [ ] **Step 4: Verificar**

```bash
npx tsc --noEmit && npx eslint . && npx next build && npm test
```

- [ ] **Step 5: Conferir na tela que nenhum valor mudou**

Abrir `/admin/cupons` e comparar com:

```sql
select coupon_number, discount_type, discount_value from public.coupons order by created_at desc;
```

Os valores da tela têm que ser os mesmos de antes da migração — nenhum cupom pode ter mudado de desconto.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: telas mostram o desconto gravado no cupom"
```

---

### Task 5: Comissão usa o retrato

**Files:**
- Modify: `lib/commission.ts`, `tests/commission.test.ts`
- Modify: `app/admin/(protected)/influencers/page.tsx`

**Interfaces:**
- Produces: `VendaParaComissao` ganha `commission_per_sale: number | null`; `ContratoInfluencer` ganha `commission_count_since: string | null`.

Hoje o cálculo multiplica tudo pelo valor **atual** do influenciador. Depois da primeira renovação isso passa a estar errado.

- [ ] **Step 1: Escrever os testes novos primeiro**

Acrescentar em `tests/commission.test.ts`:

```ts
  it('usa o valor gravado no cupom, nao o valor atual do contrato', () => {
    // Renovou de 500 para 900. As vendas antigas continuam valendo 500.
    const r = calcularComissao({ ...contrato, commission_per_sale: 900, commission_starts_at: 1 }, [
      venda('a', '05', { commission_per_sale: 500 }),
      venda('b', '06', { commission_per_sale: 500 }),
      venda('c', '20', { commission_per_sale: 900 }),
    ])
    expect(r.comissaoGerada).toBe(1900)
  })

  it('cupom sem retrato cai no valor do contrato', () => {
    const r = calcularComissao({ ...contrato, commission_starts_at: 1 }, [
      venda('a', '05', { commission_per_sale: null }),
    ])
    expect(r.comissaoGerada).toBe(500)
  })

  it('commission_count_since ignora vendas anteriores a data', () => {
    // Renovou zerando a contagem em 15/06: a venda de 05/06 nao conta nem para
    // a posicao nem para o dinheiro.
    const r = calcularComissao(
      { ...contrato, commission_count_since: '2026-06-15' },
      [venda('antiga', '05'), venda('nova1', '20'), venda('nova2', '21')]
    )
    expect(r.totalVendas).toBe(2)
    expect(r.vendasQueContam).toBe(1) // comeca na 2a, entao so a 'nova2'
    expect(r.comissaoGerada).toBe(500)
  })

  it('sem commission_count_since, conta tudo', () => {
    const r = calcularComissao({ ...contrato, commission_count_since: null }, [
      venda('a', '05'), venda('b', '06'),
    ])
    expect(r.totalVendas).toBe(2)
  })
```

E ajustar o helper `venda` para aceitar `commission_per_sale`, com padrão `null`.

- [ ] **Step 2: Rodar e ver falhar**

```bash
npx vitest run tests/commission.test.ts
```

- [ ] **Step 3: Implementar**

Em `lib/commission.ts`:

```ts
export type VendaParaComissao = {
  id: string
  verified: boolean
  paid: boolean
  created_at: string
  /** Retrato: quanto esta venda gera. Nulo em cupom anterior a migracao. */
  commission_per_sale: number | null
}

export type ContratoInfluencer = {
  commission_per_sale: number
  commission_starts_at: number
  fee_amount: number
  /** Renovacao que zera a contagem grava esta data. Nulo = conta tudo. */
  commission_count_since: string | null
}
```

E no corpo, filtrar por data e somar pelo retrato:

```ts
  const desde = contrato.commission_count_since
  const vendas = cupons
    .filter(VENDA_CONTA_QUANDO)
    .filter((c) => !desde || c.created_at.slice(0, 10) >= desde)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))

  const inicio = Math.max(1, contrato.commission_starts_at || 1)
  const queContam = vendas.filter((_, i) => i + 1 >= inicio)

  // Cada venda vale o que valia quando aconteceu.
  const valorDe = (v: VendaParaComissao) => v.commission_per_sale ?? contrato.commission_per_sale

  const comissaoGerada = queContam.reduce((s, v) => s + valorDe(v), 0)
  const comissaoPaga = queContam.filter((v) => v.paid).reduce((s, v) => s + valorDe(v), 0)
```

- [ ] **Step 4: Rodar e ver passar**

```bash
npm test
```

Esperado: 26 passando, 19 pulados.

- [ ] **Step 5: Passar os campos novos na página**

Em `influencers/page.tsx`, incluir `commission_per_sale` no select dos cupons e `commission_count_since` no contrato.

- [ ] **Step 6: Conferir que o número do @caiiuxo não mudou**

Antes desta task ele mostrava **R$ 3.000 a pagar** (6 vendas × R$ 500, começando na 1ª). Depois tem que continuar R$ 3.000 — o retrato dos cupons foi preenchido com o mesmo valor na Task 1.

**Se mudar, algo está errado na migração ou no cálculo.**

- [ ] **Step 7: Commit**

```bash
git add lib/commission.ts tests/commission.test.ts "app/admin/(protected)/influencers/page.tsx"
git commit -m "feat: comissao usa o valor gravado no cupom"
```

---

### Task 6: Campanha vira modelo no cadastro

**Files:**
- Modify: `components/admin/AddInfluencerForm.tsx`, `components/admin/InfluencersList.tsx`

**Interfaces:**
- Consumes: colunas da Task 1.

- [ ] **Step 1: Campos de oferta no formulário**

O formulário do influenciador ganha desconto (tipo e valor), validade do cupom, título e descrição — os campos que hoje só existem na campanha.

- [ ] **Step 2: Escolher campanha preenche os campos**

Ao trocar a campanha no `select`, os campos de oferta são preenchidos com os valores dela — mas continuam editáveis:

```tsx
onChange={(e) => {
  const c = campaigns.find((x) => x.id === e.target.value)
  setForm((p) => ({
    ...p,
    campaign_id: e.target.value,
    // A campanha e MODELO: preenche, nao manda. Depois disso os valores
    // sao do influenciador e podem ser editados livremente.
    ...(c ? {
      discount_type: c.discount_type,
      discount_value: String(c.discount_value),
      validity_days: String(c.validity_days),
      coupon_title: c.coupon_title,
      coupon_description: c.coupon_description,
    } : {}),
  }))
}}
```

Isso exige que a página passe as campanhas **com os valores**, não só `id, name`.

- [ ] **Step 3: Um aviso na tela**

Acima dos campos de oferta, para o comportamento não surpreender:

```tsx
<p className="text-xs text-gray-500 md:col-span-2">
  A campanha preenche estes campos, mas eles passam a ser deste influenciador.
  Editar aqui não afeta a campanha nem os outros influenciadores.
</p>
```

- [ ] **Step 4: Mostrar o prazo na listagem**

No cartão do influenciador, ao lado da etiqueta de estado, quando houver prazo:

```tsx
{inf.partnership_ends_at && (
  <span className="text-xs text-gray-500">
    até {formatDate(inf.partnership_ends_at)}
  </span>
)}
```

E a etiqueta de estado da Task 1 do plano anterior ganha um quarto caso: parceria vencida.

- [ ] **Step 5: Verificar**

```bash
npx tsc --noEmit && npx eslint . && npx next build && npm test
```

Cadastrar um influenciador de teste, conferir que os campos preencheram, editar o desconto dele para um valor diferente da campanha, salvar, e confirmar no banco que só ele mudou:

```sql
select instagram_handle, discount_value from public.influencers order by instagram_handle;
select name, discount_value from public.campaigns;
```

Apagar o influenciador de teste depois.

- [ ] **Step 6: Commit**

```bash
git add components/admin "app/admin/(protected)/influencers/page.tsx"
git commit -m "feat: campanha vira modelo, influencer dono dos termos"
```

---

### Task 7: Prorrogar e Renovar

**Files:**
- Create: `app/api/admin/influencer-renew/route.ts`
- Modify: `components/admin/InfluencersList.tsx`

**Interfaces:**
- Consumes: `requireRole` de `lib/supabase/server`, colunas da Task 1.
- Produces: `POST /api/admin/influencer-renew` com `{ id, acao: 'prorrogar' | 'renovar', ends_at, termos?, zerar_contagem? }`.

- [ ] **Step 1: A rota**

Criar `app/api/admin/influencer-renew/route.ts`. Só admin. Duas ações:

```ts
// Prorrogar: mesma negociacao, prazo novo. So mexe na data.
// Renovar: negociacao nova. Mexe nos termos e, opcionalmente, zera a contagem
// de vendas -- decisao caso a caso, confirmada pelo Cesar em 18/08.
export async function POST(request: Request) {
  const auth = await requireRole(['admin'])
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id, acao, ends_at, termos, zerar_contagem } = await request.json()
  if (!id || !['prorrogar', 'renovar'].includes(acao)) {
    return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 })
  }

  const update: Record<string, unknown> = { partnership_ends_at: ends_at || null }

  if (acao === 'renovar') {
    if (termos?.discount_value != null) update.discount_value = Number(termos.discount_value)
    if (termos?.discount_type) update.discount_type = termos.discount_type
    if (termos?.validity_days != null) update.validity_days = Number(termos.validity_days)
    if (termos?.commission_per_sale != null) update.commission_per_sale = Number(termos.commission_per_sale)
    if (termos?.commission_starts_at != null) update.commission_starts_at = Number(termos.commission_starts_at)
    if (zerar_contagem) update.commission_count_since = new Date().toISOString().slice(0, 10)
  }

  const supabase = await createClient()
  const { error } = await supabase.from('influencers').update(update).eq('id', id)
  if (error) return NextResponse.json({ error: mensagemDeErro(error.message, 'influencer') }, { status: 400 })

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Os dois botões**

No cartão do influenciador, ao lado de Editar:

- **Prorrogar** abre um campo de data só. Salva com `acao: 'prorrogar'`.
- **Renovar** abre um painel com data, desconto, validade, comissão por venda, a partir de qual venda, e uma caixa **"Recomeçar a contagem de vendas"** — desmarcada por padrão, com a explicação de que marcar faz a próxima venda contar como a primeira do acordo novo.

- [ ] **Step 3: Verificar**

```bash
npx tsc --noEmit && npx eslint . && npx next build && npm test
```

- [ ] **Step 4: Testar as duas operações**

Num influenciador de teste: prorrogar para daqui a 30 dias e conferir que só `partnership_ends_at` mudou; renovar com desconto diferente e conferir que os termos mudaram e os **cupons antigos continuam com o retrato antigo**:

```sql
select coupon_number, discount_value from public.coupons where influencer_id = '<id>' order by created_at;
select discount_value, commission_count_since, partnership_ends_at from public.influencers where id = '<id>';
```

**Os cupons antigos não podem ter mudado de valor.** É a prova de que o retrato funciona.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: prorrogar e renovar parceria com influencer"
```

---

## Critérios de aceite

- [ ] `npx tsc --noEmit` limpo
- [ ] `npx eslint .` sem warnings novos
- [ ] `npx next build` passa
- [ ] `npm test` com 26 passando
- [ ] Nenhum arquivo acima de 500 linhas
- [ ] Nenhum influenciador mudou de termo na migração
- [ ] Nenhum cupom ficou sem retrato
- [ ] Link abre com campanha inativa e influenciador ativo sem prazo
- [ ] Link fecha com prazo vencido e com influenciador inativo
- [ ] O "a pagar" do @caiiuxo continua **R$ 3.000** depois de tudo
- [ ] Renovar com valor novo **não** altera o desconto dos cupons antigos

## Pendências que este plano deixa

- **Aviso de parceria perto do fim.** O `pg_cron` já está instalado. Próximo plano.
- **Pagamento do fixo** continua sem controle (`fee_paid_at`).
- **Campanha ainda pode ser desativada**, mas isso deixa de afetar links. Vale avaliar depois se o campo `campaigns.active` ainda faz sentido.
