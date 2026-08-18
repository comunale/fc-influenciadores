# Parceria como entidade — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) ou superpowers:executing-plans para implementar tarefa a tarefa. Os passos usam checkbox (`- [ ]`).

**Goal:** Transformar a parceria numa entidade de primeira classe, para que cada acordo tenha seu período, seus valores e sua regra de pagamento — e renovar deixe de sobrescrever o passado.

**Architecture:** Uma tabela `partnerships` recebe os termos que hoje são campos soltos do influenciador. O influenciador guarda a identidade e o link (que não pode mudar na renovação); a parceria guarda o acordo. Uma ativa por vez, garantida por índice único parcial no banco. A ordem das tasks garante que o sistema nunca fique quebrado no meio: o banco ganha a tabela já preenchida, cada leitor migra, e só no fim os campos antigos saem de cena.

**Tech Stack:** Next.js 16.2.6 (App Router), React 19, Tailwind v4, Supabase (Postgres + RLS), TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-18-parceria-como-entidade-design.md`

## Global Constraints

- Verificação = `npx tsc --noEmit`, `npx eslint .`, `npx next build` e `npm test`.
- Arquivos abaixo de **500 linhas** (`CLAUDE.md`). `InfluencersList` já estourou duas vezes — extrair antes de acrescentar.
- Este **não é o Next.js que você conhece** (`AGENTS.md`). Ler `node_modules/next/dist/docs/` antes de mexer em rota ou página.
- Colunas em **inglês**, rótulos de tela em **português**.
- Toda regra de permissão vale na tela, na API **e** no banco.
- Banco de **produção**, compartilhado com o fc-digitalcard (`card_*`). Não tocar fora de `coupons`, `influencers`, `campaigns`, `sellers`, `admin_profiles`, `influencer_payment_info`, `partnerships`.
- Migrations via MCP (`apply_migration`), SQL versionado em `db/migrations/`. Próximo número: **010**.
- Project ID: `uufrrhqrafxybdhkhvln`.
- Papéis: `admin` (superusuário), `finance` (Financeiro), `moderator` (**Lojista**).
- **Migração que muda regra de operação sobe junto com o código.** Em 06/08 uma migração subiu com o código parado numa branch e o balcão ficou 12 dias sem validar cupom, em silêncio.
- **Nunca alterar dado real solto para testar.** Usar transação com rollback pelo MCP. Em 18/08 o link do `@caiiuxo` ficou morto por minutos por causa disso.

## Estado a preservar (18/08/2026)

```
16 influenciadores   R$ 200 · 30d · comissão R$ 500 a partir da 2ª venda
@caiiuxo             R$ 300 · 60d · comissão R$ 500 a partir da 1ª venda
@mariananavi         R$ 200 · 45d · comissão R$ 300 a partir da 1ª venda
```

**Critério que amarra a entrega inteira:** o "a pagar" do `@caiiuxo` tem que continuar **R$ 3.000** depois de tudo. Se mudar, a migração alterou termo de alguém.

## Estrutura de arquivos

**Criar:**
- `db/migrations/010_parcerias.sql` — tabela, índice, vínculo e backfill
- `lib/partnership.ts` — tipos e helpers da parceria (puro, testável)
- `tests/partnership.test.ts`
- `components/admin/ParceriaAtiva.tsx` — cartão da parceria ativa + histórico

**Modificar:**
- `lib/supabase/types.ts` — tabela nova e `coupons.partnership_id`
- `lib/commission.ts` — contrato passa a vir da parceria
- `lib/influencer-status.ts` — o prazo passa a vir da parceria
- `app/c/[coupon_code]/page.tsx`, `app/api/coupons/route.ts`, `app/api/admin/coupon-express/route.ts`, `app/api/admin/influencer-lookup/route.ts` — leem da parceria ativa
- `app/api/admin/influencer-renew/route.ts` — vira encerrar/abrir parceria
- `app/admin/(protected)/influencers/page.tsx`, `components/admin/InfluencersList.tsx`, `components/admin/InfluencerForm.tsx`, `components/admin/ParceriaPanel.tsx`

---

### Task 1: A tabela e o backfill

**Files:**
- Create: `db/migrations/010_parcerias.sql`
- Modify: `lib/supabase/types.ts`

**Interfaces:**
- Produces: tabela `public.partnerships`; coluna `public.coupons.partnership_id`; índice `partnerships_uma_ativa_por_influencer`.

- [ ] **Step 1: Fotografar o estado antes**

```sql
select instagram_handle, discount_type, discount_value, validity_days,
       commission_per_sale, commission_starts_at, fee_amount, partnership_ends_at
from public.influencers order by instagram_handle;
```

Guardar o resultado. É contra ele que o Step 4 confere.

- [ ] **Step 2: Escrever a migração**

Criar `db/migrations/010_parcerias.sql`:

```sql
-- 010_parcerias.sql
-- Ver docs/superpowers/specs/2026-08-18-parceria-como-entidade-design.md
--
-- A parceria vira entidade. Os termos saem de campos soltos do influenciador e
-- passam a viver num acordo com periodo proprio.
--
-- O influenciador guarda a IDENTIDADE, inclusive o coupon_code: o link esta na
-- bio e no story dele, e renovar nao pode troca-lo.

create table if not exists public.partnerships (
  id                     uuid primary key default gen_random_uuid(),
  influencer_id          uuid not null references public.influencers(id) on delete cascade,
  campaign_id            uuid references public.campaigns(id) on delete set null,

  status                 text not null default 'ativa',
  starts_at              date not null default current_date,
  ends_at                date,

  -- O cache e quando ele sai
  fee_amount             numeric not null default 0,
  fee_timing             text not null default 'inicio',

  -- A comissao
  commission_per_sale    numeric not null default 0,
  commission_starts_at   integer not null default 1,
  -- 'parceria' = a contagem recomeca neste acordo. 'historico' = continua do
  -- total do influenciador. Substitui o commission_count_since de 18/08.
  commission_counts_from text not null default 'parceria',

  payment_schedule       text not null default 'fim',

  -- A oferta ao cliente
  discount_type          text not null,
  discount_value         numeric not null,
  validity_days          integer not null,
  coupon_title           text,
  coupon_description     text,

  created_at             timestamptz not null default now()
);

alter table public.partnerships drop constraint if exists partnerships_status_check;
alter table public.partnerships add constraint partnerships_status_check
  check (status = any (array['ativa'::text, 'encerrada'::text]));

alter table public.partnerships drop constraint if exists partnerships_fee_timing_check;
alter table public.partnerships add constraint partnerships_fee_timing_check
  check (fee_timing = any (array['inicio'::text, 'fechamento'::text]));

alter table public.partnerships drop constraint if exists partnerships_counts_from_check;
alter table public.partnerships add constraint partnerships_counts_from_check
  check (commission_counts_from = any (array['parceria'::text, 'historico'::text]));

alter table public.partnerships drop constraint if exists partnerships_schedule_check;
alter table public.partnerships add constraint partnerships_schedule_check
  check (payment_schedule = any (array['fim'::text, 'mensal'::text]));

alter table public.partnerships drop constraint if exists partnerships_discount_type_check;
alter table public.partnerships add constraint partnerships_discount_type_check
  check (discount_type = any (array['fixed'::text, 'percentage'::text]));

-- UMA ativa por influenciador. Decisao do Cesar. No banco, nao so na tela:
-- duas ativas deixariam o sistema sem saber qual desconto aplicar.
drop index if exists partnerships_uma_ativa_por_influencer;
create unique index partnerships_uma_ativa_por_influencer
  on public.partnerships (influencer_id) where status = 'ativa';

create index if not exists partnerships_influencer_idx on public.partnerships (influencer_id);

alter table public.partnerships enable row level security;

-- A landing publica precisa ler os termos sem login.
drop policy if exists partnerships_select_public on public.partnerships;
create policy partnerships_select_public on public.partnerships
  for select using (true);

drop policy if exists partnerships_write_admin on public.partnerships;
create policy partnerships_write_admin on public.partnerships
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- De qual acordo cada venda nasceu.
alter table public.coupons
  add column if not exists partnership_id uuid references public.partnerships(id);

-- Uma parceria ativa por influenciador, com os termos que ele tem hoje.
insert into public.partnerships (
  influencer_id, campaign_id, status, starts_at, ends_at,
  fee_amount, commission_per_sale, commission_starts_at,
  discount_type, discount_value, validity_days, coupon_title, coupon_description
)
select i.id, i.campaign_id, 'ativa', coalesce(i.created_at::date, current_date), i.partnership_ends_at,
       i.fee_amount, i.commission_per_sale, i.commission_starts_at,
       i.discount_type, i.discount_value, i.validity_days, i.coupon_title, i.coupon_description
from public.influencers i
where not exists (select 1 from public.partnerships p where p.influencer_id = i.id);

-- Cada cupom aponta para a parceria do seu influenciador.
update public.coupons c
   set partnership_id = p.id
  from public.partnerships p
 where p.influencer_id = c.influencer_id
   and c.partnership_id is null;
```

- [ ] **Step 3: Aplicar**

Via MCP: `apply_migration(project_id: "uufrrhqrafxybdhkhvln", name: "parcerias", query: <conteúdo>)`.

- [ ] **Step 4: Conferir que ninguém mudou de termo**

```sql
select i.instagram_handle,
       (i.discount_value = p.discount_value
        and i.validity_days = p.validity_days
        and i.commission_per_sale = p.commission_per_sale
        and i.commission_starts_at = p.commission_starts_at
        and i.fee_amount = p.fee_amount) as bateu
from public.influencers i join public.partnerships p on p.influencer_id = i.id
order by bateu;
```

**Todos têm que dar `bateu = true`.** Se algum der falso, parar e investigar.

E os vínculos:

```sql
select (select count(*) from public.partnerships) as parcerias,
       (select count(*) from public.influencers) as influencers,
       (select count(*) from public.coupons where partnership_id is null) as cupons_sem_parceria,
       (select count(*) from public.partnerships where status='ativa') as ativas;
```

Esperado: 18 parcerias, 18 influencers, **0** cupons sem parceria, 18 ativas.

- [ ] **Step 5: Provar que o índice único funciona**

```sql
begin;
insert into public.partnerships (influencer_id, status, discount_type, discount_value, validity_days)
select id, 'ativa', 'fixed', 100, 30 from public.influencers limit 1;
rollback;
```

Esperado: **erro de índice único**. Se inserir, o índice não está valendo — parar.

- [ ] **Step 6: Tipos**

Em `lib/supabase/types.ts`, acrescentar a tabela `partnerships` (Row com todos os campos obrigatórios exceto `ends_at`, `coupon_title`, `coupon_description` e `campaign_id`, que são `| null`; Insert e Update com tudo opcional exceto `influencer_id`, `discount_type`, `discount_value`, `validity_days` no Insert) e `partnership_id: string | null` nos três blocos de `coupons`.

- [ ] **Step 7: Verificar e commitar**

```bash
npx tsc --noEmit && npx next build && npm test
git add db/migrations/010_parcerias.sql lib/supabase/types.ts
git commit -m "feat(db): parceria vira entidade, uma ativa por influencer"
```

Nada de comportamento mudou: a tabela existe e está preenchida, mas ninguém lê dela ainda.

---

### Task 2: O módulo da parceria

**Files:**
- Create: `lib/partnership.ts`, `tests/partnership.test.ts`

**Interfaces:**
- Produces:
  - `type Parceria = { id: string; status: string; starts_at: string; ends_at: string | null; fee_amount: number; fee_timing: string; commission_per_sale: number; commission_starts_at: number; commission_counts_from: string; payment_schedule: string; discount_type: string; discount_value: number; validity_days: number; coupon_title: string | null; coupon_description: string | null }`
  - `parceriaAtiva(parcerias: Parceria[]): Parceria | null`
  - `parceriaVigente(p: Parceria | null): boolean`
  - `rotuloDesconto(p: { discount_type: string; discount_value: number }): string`

- [ ] **Step 1: Os testes primeiro**

Criar `tests/partnership.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parceriaAtiva, parceriaVigente, rotuloDesconto, type Parceria } from '@/lib/partnership'

const base: Parceria = {
  id: 'p1', status: 'ativa', starts_at: '2026-06-01', ends_at: null,
  fee_amount: 500, fee_timing: 'inicio',
  commission_per_sale: 500, commission_starts_at: 1, commission_counts_from: 'parceria',
  payment_schedule: 'fim',
  discount_type: 'fixed', discount_value: 300, validity_days: 60,
  coupon_title: null, coupon_description: null,
}

const ontem = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
const amanha = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
const hoje = new Date().toISOString().slice(0, 10)

describe('parceriaAtiva', () => {
  it('sem parcerias, devolve null', () => {
    expect(parceriaAtiva([])).toBeNull()
  })

  it('escolhe a de status ativa, ignorando as encerradas', () => {
    const encerrada = { ...base, id: 'p0', status: 'encerrada' }
    expect(parceriaAtiva([encerrada, base])?.id).toBe('p1')
  })

  it('so encerradas devolve null', () => {
    expect(parceriaAtiva([{ ...base, status: 'encerrada' }])).toBeNull()
  })
})

describe('parceriaVigente', () => {
  it('null nao esta vigente', () => {
    expect(parceriaVigente(null)).toBe(false)
  })

  it('ativa sem prazo esta vigente', () => {
    expect(parceriaVigente(base)).toBe(true)
  })

  it('ativa com prazo no futuro esta vigente', () => {
    expect(parceriaVigente({ ...base, ends_at: amanha })).toBe(true)
  })

  it('vale ate o ultimo dia, inclusive', () => {
    // Fechar no proprio dia tiraria um dia de quem negociou.
    expect(parceriaVigente({ ...base, ends_at: hoje })).toBe(true)
  })

  it('prazo vencido nao esta vigente', () => {
    expect(parceriaVigente({ ...base, ends_at: ontem })).toBe(false)
  })

  it('encerrada nao esta vigente, mesmo dentro do prazo', () => {
    expect(parceriaVigente({ ...base, status: 'encerrada', ends_at: amanha })).toBe(false)
  })
})

describe('rotuloDesconto', () => {
  it('valor fixo sai em reais', () => {
    expect(rotuloDesconto({ discount_type: 'fixed', discount_value: 300 })).toBe('R$ 300')
  })

  it('percentual sai com o simbolo', () => {
    expect(rotuloDesconto({ discount_type: 'percentage', discount_value: 15 })).toBe('15%')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npx vitest run tests/partnership.test.ts
```

Esperado: falha ao importar `@/lib/partnership`.

- [ ] **Step 3: Implementar**

Criar `lib/partnership.ts`:

```ts
/**
 * A parceria: o acordo entre a FoxCycles e o influenciador.
 *
 * Existe como entidade desde 18/08/2026. Antes os termos eram campos soltos do
 * influenciador, e renovar sobrescrevia o passado -- o que obrigou a inventar um
 * commission_count_since so para lembrar quando a contagem tinha recomecado.
 *
 * Modulo puro: sem banco e sem React.
 */
export type Parceria = {
  id: string
  status: string
  starts_at: string
  ends_at: string | null
  fee_amount: number
  fee_timing: string
  commission_per_sale: number
  commission_starts_at: number
  commission_counts_from: string
  payment_schedule: string
  discount_type: string
  discount_value: number
  validity_days: number
  coupon_title: string | null
  coupon_description: string | null
}

/** A parceria ativa do influenciador. So existe uma (indice unico no banco). */
export function parceriaAtiva(parcerias: Parceria[]): Parceria | null {
  return parcerias.find((p) => p.status === 'ativa') ?? null
}

/**
 * A parceria esta valendo agora?
 *
 * Ativa e dentro do prazo. Sem prazo definido significa sem fim.
 * Vale ATE o dia combinado, inclusive.
 */
export function parceriaVigente(p: Parceria | null): boolean {
  if (!p || p.status !== 'ativa') return false
  if (!p.ends_at) return true
  return p.ends_at >= new Date().toISOString().slice(0, 10)
}

export function rotuloDesconto(p: { discount_type: string; discount_value: number }): string {
  return p.discount_type === 'fixed' ? `R$ ${p.discount_value}` : `${p.discount_value}%`
}
```

- [ ] **Step 4: Rodar e ver passar**

```bash
npm test
```

Esperado: 12 testes novos passando, total 48.

- [ ] **Step 5: Commit**

```bash
git add lib/partnership.ts tests/partnership.test.ts
git commit -m "feat: modulo da parceria, puro e testado"
```

---

### Task 3: O link passa a depender da parceria

**Files:**
- Modify: `lib/influencer-status.ts`, `tests/influencer-status.test.ts`, `app/c/[coupon_code]/page.tsx`

**Interfaces:**
- Consumes: `Parceria`, `parceriaAtiva`, `parceriaVigente` da Task 2.
- Produces: `linkAtivo(inf, parceria)` — assinatura muda: o prazo agora vem da parceria.

- [ ] **Step 1: Ajustar os testes existentes**

Em `tests/influencer-status.test.ts`, `linkAtivo` passa a receber dois argumentos: o influenciador (só `active`) e a parceria. Reescrever os casos:

```ts
const parceria = (ends_at: string | null, status = 'ativa') =>
  ({ ...base, ends_at, status }) as Parceria

it('abre com influencer ativo e parceria vigente', () => {
  expect(linkAtivo({ active: true }, parceria(null))).toBe(true)
})

it('fecha quando a parceria venceu', () => {
  expect(linkAtivo({ active: true }, parceria(ontem))).toBe(false)
})

it('fecha quando a parceria foi encerrada', () => {
  expect(linkAtivo({ active: true }, parceria(amanha, 'encerrada'))).toBe(false)
})

it('fecha quando o influencer esta inativo, mesmo com parceria vigente', () => {
  expect(linkAtivo({ active: false }, parceria(amanha))).toBe(false)
})

it('fecha quando nao ha parceria nenhuma', () => {
  expect(linkAtivo({ active: true }, null)).toBe(false)
})
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npx vitest run tests/influencer-status.test.ts
```

- [ ] **Step 3: Implementar**

Em `lib/influencer-status.ts`:

```ts
import { parceriaVigente, type Parceria } from './partnership'

/**
 * Quando o link do influenciador abre.
 *
 * Ate 18/08/2026 dependia da CAMPANHA, o que derrubava todos de uma vez -- e
 * naquele dia deixou 17 de 18 links mortos. Depois passou a depender do
 * influenciador. Agora depende da PARCERIA, que e onde o prazo realmente vive.
 *
 * A checagem acontece quando alguem abre o link, sem depender de rotina
 * agendada.
 */
export function linkAtivo(inf: { active: boolean }, parceria: Parceria | null): boolean {
  return inf.active && parceriaVigente(parceria)
}

export function motivoLinkInativo(inf: { active: boolean }, parceria: Parceria | null): string | null {
  if (!inf.active) return 'Influencer inativo'
  if (!parceria) return 'Sem parceria'
  if (parceria.status !== 'ativa') return 'Parceria encerrada'
  if (parceria.ends_at && parceria.ends_at < new Date().toISOString().slice(0, 10)) {
    return 'Parceria vencida'
  }
  return null
}

/** A parceria vence nos proximos `dias`? */
export function venceEmAte(p: Parceria | null, dias: number): boolean {
  if (!p?.ends_at || p.status !== 'ativa') return false
  const hoje = new Date()
  const limite = new Date(hoje.getTime() + dias * 86400000).toISOString().slice(0, 10)
  return p.ends_at >= hoje.toISOString().slice(0, 10) && p.ends_at <= limite
}
```

- [ ] **Step 4: A landing lê da parceria**

Em `app/c/[coupon_code]/page.tsx`, os dois selects passam a trazer a parceria:

```ts
.select('*, partnerships(*), campaigns(name)')
```

E o corpo usa `const p = parceriaAtiva(influencer.partnerships ?? [])`, com `if (!influencer || !linkAtivo(influencer, p)) notFound()`. Desconto e textos saem de `p`.

- [ ] **Step 5: Verificar**

```bash
npx tsc --noEmit && npx eslint . && npx next build && npm test
```

- [ ] **Step 6: Testar o link em runtime**

Subir `npx next dev` e abrir `/c/CAIIUXO300`. Esperado: HTTP 200 mostrando **R$ 300**.

Para testar o caso vencido, **não alterar dado real**: usar transação com rollback pelo MCP e conferir a consulta, ou confiar nos testes de unidade do Step 1, que cobrem os quatro casos.

- [ ] **Step 7: Commit**

```bash
git add lib/influencer-status.ts tests/influencer-status.test.ts "app/c/[coupon_code]/page.tsx"
git commit -m "feat: link depende da parceria, que e onde o prazo vive"
```

---

### Task 4: Criação de cupom lê da parceria

**Files:**
- Modify: `app/api/coupons/route.ts`, `app/api/admin/coupon-express/route.ts`, `app/api/admin/influencer-lookup/route.ts`

**Interfaces:**
- Consumes: `parceriaAtiva`, `linkAtivo` das Tasks 2 e 3.

- [ ] **Step 1: `/api/coupons`**

O select traz `partnerships(*)`; a validade e o retrato saem da parceria ativa, e o insert grava `partnership_id`:

```ts
    const p = parceriaAtiva(influencer.partnerships ?? [])
    if (!linkAtivo(influencer, p)) {
      return NextResponse.json({ error: 'Este link não está mais ativo.' }, { status: 400 })
    }

    const expiresAt = addDays(new Date(), p!.validity_days)

    const result = await insertCouponWithRetry(supabase, {
      influencer_id: influencer.id,
      campaign_id: influencer.campaign_id,
      partnership_id: p!.id,
      discount_type: p!.discount_type,
      discount_value: p!.discount_value,
      commission_per_sale: p!.commission_per_sale,
      // ...resto igual
    }, 'coupon_number')
```

- [ ] **Step 2: `coupon-express` e `influencer-lookup`**

Mesma troca: buscar `partnerships(*)`, usar `parceriaAtiva`, validar com `linkAtivo`, e gravar `partnership_id` no insert do express.

- [ ] **Step 3: Verificar**

```bash
npx tsc --noEmit && npx eslint . && npx next build && npm test
```

- [ ] **Step 4: Testar a criação ponta a ponta**

Criar um cupom real pelo link e conferir:

```sql
select coupon_number, partnership_id is not null as tem_parceria,
       discount_value, commission_per_sale, (expires_at::date - current_date) as dias
from public.coupons order by created_at desc limit 1;
```

Esperado: parceria preenchida, R$ 300, comissão R$ 500, 60 dias. **Apagar o cupom de teste depois.**

- [ ] **Step 5: Commit**

```bash
git add app/api
git commit -m "feat: cupom nasce vinculado a parceria"
```

---

### Task 5: Comissão lê da parceria

**Files:**
- Modify: `lib/commission.ts`, `tests/commission.test.ts`, `app/admin/(protected)/influencers/page.tsx`

**Interfaces:**
- Produces: `ContratoInfluencer` troca `commission_count_since: string | null` por `commission_counts_from: 'parceria' | 'historico'` e ganha `partnership_id: string`.

- [ ] **Step 1: Os testes**

Substituir os dois testes de `commission_count_since` em `tests/commission.test.ts` por:

```ts
  it('contando pela parceria, so as vendas dela contam', () => {
    const r = calcularComissao(
      { ...contrato, commission_counts_from: 'parceria', partnership_id: 'p2' },
      [
        { ...venda('velha', '05'), partnership_id: 'p1' },
        { ...venda('nova1', '20'), partnership_id: 'p2' },
        { ...venda('nova2', '21'), partnership_id: 'p2' },
      ]
    )
    expect(r.totalVendas).toBe(2)
    expect(r.vendasQueContam).toBe(1) // comeca na 2a
    expect(r.comissaoGerada).toBe(500)
  })

  it('contando pelo historico, as vendas antigas tambem contam', () => {
    const r = calcularComissao(
      { ...contrato, commission_counts_from: 'historico', partnership_id: 'p2' },
      [
        { ...venda('velha', '05'), partnership_id: 'p1' },
        { ...venda('nova', '20'), partnership_id: 'p2' },
      ]
    )
    expect(r.totalVendas).toBe(2)
    expect(r.vendasQueContam).toBe(1)
  })
```

E o helper `venda` ganha `partnership_id: 'p1'` no padrão.

- [ ] **Step 2: Rodar e ver falhar**

```bash
npx vitest run tests/commission.test.ts
```

- [ ] **Step 3: Implementar**

Em `lib/commission.ts`, `VendaParaComissao` ganha `partnership_id: string | null`, o contrato troca o campo, e o filtro por data vira filtro por parceria:

```ts
  const vendas = cupons
    .filter(VENDA_CONTA_QUANDO)
    .filter((c) =>
      contrato.commission_counts_from === 'historico' ||
      c.partnership_id === contrato.partnership_id
    )
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
```

- [ ] **Step 4: Rodar e ver passar**

```bash
npm test
```

- [ ] **Step 5: A página passa os campos**

Em `influencers/page.tsx`, o select traz `partnerships(*)` e `coupons(..., partnership_id)`, e o contrato é montado da parceria ativa em vez do influenciador.

- [ ] **Step 6: O critério que amarra tudo**

```sql
select i.instagram_handle, count(c.id) filter (where c.verified) as vendas,
       sum(c.commission_per_sale) filter (where c.verified) as total
from public.influencers i left join public.coupons c on c.influencer_id = i.id
where i.coupon_code = 'CAIIUXO300' group by i.instagram_handle;
```

**Tem que dar R$ 3.000.** E a tela tem que mostrar o mesmo. Se mudar, algo quebrou.

- [ ] **Step 7: Commit**

```bash
git add lib/commission.ts tests/commission.test.ts "app/admin/(protected)/influencers/page.tsx"
git commit -m "feat: comissao conta por parceria, nao por data magica"
```

---

### Task 6: Prorrogar e Renovar de verdade

**Files:**
- Modify: `app/api/admin/influencer-renew/route.ts`, `components/admin/ParceriaPanel.tsx`

**Interfaces:**
- Consumes: tabela da Task 1.
- Produces: `POST /api/admin/influencer-renew` com `{ influencer_id, acao: 'prorrogar' | 'renovar', ends_at, termos?, counts_from? }`.

- [ ] **Step 1: A rota**

**Prorrogar** muda `ends_at` da parceria ativa. **Renovar** encerra a ativa e cria outra, na mesma transação lógica:

```ts
  const supabase = await createClient()

  const { data: atual } = await supabase
    .from('partnerships').select('*')
    .eq('influencer_id', influencer_id).eq('status', 'ativa').maybeSingle()

  if (!atual) return NextResponse.json({ error: 'Este influencer não tem parceria ativa.' }, { status: 400 })

  if (acao === 'prorrogar') {
    const { error } = await supabase.from('partnerships')
      .update({ ends_at: ends_at || null }).eq('id', atual.id)
    if (error) return NextResponse.json({ error: mensagemDeErro(error.message) }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  // Renovar: encerra a atual ANTES de abrir a nova, senao o indice unico recusa.
  const { error: erroEncerrar } = await supabase.from('partnerships')
    .update({ status: 'encerrada' }).eq('id', atual.id)
  if (erroEncerrar) return NextResponse.json({ error: mensagemDeErro(erroEncerrar.message) }, { status: 400 })

  const { error: erroCriar } = await supabase.from('partnerships').insert({
    influencer_id,
    campaign_id: atual.campaign_id,
    status: 'ativa',
    starts_at: new Date().toISOString().slice(0, 10),
    ends_at: ends_at || null,
    fee_amount: Number(termos?.fee_amount ?? atual.fee_amount),
    fee_timing: termos?.fee_timing ?? atual.fee_timing,
    commission_per_sale: Number(termos?.commission_per_sale ?? atual.commission_per_sale),
    commission_starts_at: Number(termos?.commission_starts_at ?? atual.commission_starts_at),
    commission_counts_from: counts_from ?? 'parceria',
    payment_schedule: termos?.payment_schedule ?? atual.payment_schedule,
    discount_type: termos?.discount_type ?? atual.discount_type,
    discount_value: Number(termos?.discount_value ?? atual.discount_value),
    validity_days: Number(termos?.validity_days ?? atual.validity_days),
    coupon_title: atual.coupon_title,
    coupon_description: atual.coupon_description,
  })
```

> **Ordem importa:** encerrar antes de criar. O índice único recusa duas ativas. Se o insert falhar depois do update, o influenciador fica sem parceria ativa — devolver erro claro dizendo isso, para o César saber que precisa recriar.

- [ ] **Step 2: O painel**

`ParceriaPanel.tsx` ganha os campos novos: regra de pagamento (`no fim` / `a cada 30 dias`), quando o fee sai (`no início` / `no fechamento`), e a caixa "recomeçar a contagem" passa a gravar `counts_from`.

- [ ] **Step 3: Verificar**

```bash
npx tsc --noEmit && npx eslint . && npx next build && npm test
```

- [ ] **Step 4: Testar as duas operações com rollback**

```sql
begin;
-- simula renovar o @caiiuxo por R$ 450
update public.partnerships set status='encerrada'
 where influencer_id = (select id from public.influencers where coupon_code='CAIIUXO300') and status='ativa';
insert into public.partnerships (influencer_id, status, discount_type, discount_value, validity_days, commission_per_sale)
select id, 'ativa', 'fixed', 450, 60, 900 from public.influencers where coupon_code='CAIIUXO300';

select (select count(*) from public.coupons c join public.influencers i on i.id=c.influencer_id
        where i.coupon_code='CAIIUXO300' and c.discount_value = 300) as cupons_antigos_intactos;
rollback;
```

Esperado: **6**. Os cupons antigos não podem mudar de valor — é a prova de que o retrato funciona.

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/influencer-renew/route.ts components/admin/ParceriaPanel.tsx
git commit -m "feat: renovar encerra uma parceria e abre outra"
```

---

### Task 7: A tela do influenciador

**Files:**
- Create: `components/admin/ParceriaAtiva.tsx`
- Modify: `components/admin/InfluencersList.tsx`, `components/admin/InfluencerForm.tsx`, `app/admin/(protected)/influencers/page.tsx`

- [ ] **Step 1: O cartão da parceria**

`ParceriaAtiva.tsx` mostra, dentro do cartão do influenciador: período, desconto, comissão, regra de pagamento, e o histórico das parcerias encerradas recolhido.

- [ ] **Step 2: O formulário se divide**

`InfluencerForm.tsx` separa visualmente **Dados da pessoa** (nome, @, código, ativo) de **Termos da parceria** (desconto, validade, comissão, fee, prazo, regra de pagamento). Ao criar um influenciador, cria a parceria junto.

- [ ] **Step 3: Campanha ganha duração padrão**

A campanha passa a ter `default_partnership_days`, e escolher a campanha preenche `ends_at` como hoje + N. É o que o César tentava fazer ao colocar "60 dias" na campanha — só que aquele campo era a validade do cupom.

Requer migração pequena, incluída aqui:

```sql
alter table public.campaigns
  add column if not exists default_partnership_days integer;
```

- [ ] **Step 4: Conferir o tamanho**

```bash
wc -l components/admin/InfluencersList.tsx components/admin/InfluencerForm.tsx components/admin/ParceriaAtiva.tsx
```

Nenhum acima de 500. `InfluencersList` já estourou duas vezes — extrair antes de acrescentar.

- [ ] **Step 5: Verificar**

```bash
npx tsc --noEmit && npx eslint . && npx next build && npm test
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: tela mostra a parceria ativa e o historico"
```

---

### Task 8: Aposentar os campos antigos

**Files:**
- Create: `db/migrations/011_limpa_termos_do_influencer.sql`

Só depois que tudo lê da parceria. Deixar os campos duplicados convida alguém a editar o lugar errado.

- [ ] **Step 1: Provar que ninguém mais lê**

```bash
grep -rn "influencer.discount_value\|influencer.validity_days\|influencer.commission_per_sale\|partnership_ends_at\|commission_count_since" app components lib --include=*.ts --include=*.tsx | grep -v types.ts
```

Esperado: **nenhuma linha**. Se aparecer alguma, migrar antes de seguir.

- [ ] **Step 2: A migração**

```sql
-- 011_limpa_termos_do_influencer.sql
-- Os termos vivem na parceria desde a migration 010. Manter copia no
-- influenciador convida alguem a editar o lugar errado e nao surtir efeito.

alter table public.influencers
  drop column if exists discount_type,
  drop column if exists discount_value,
  drop column if exists validity_days,
  drop column if exists coupon_title,
  drop column if exists coupon_description,
  drop column if exists partnership_ends_at,
  drop column if exists commission_count_since,
  drop column if exists fee_amount,
  drop column if exists commission_per_sale,
  drop column if exists commission_starts_at;
```

- [ ] **Step 3: Verificar tudo de novo**

```bash
npx tsc --noEmit && npx eslint . && npx next build && npm test
```

E abrir a landing, o balcão e a tela de influencers para confirmar que nada quebrou.

- [ ] **Step 4: Commit e push**

```bash
git add -A
git commit -m "chore(db): remove os termos duplicados do influencer"
git push origin master
```

---

## Critérios de aceite

- [ ] `npx tsc --noEmit` limpo
- [ ] `npx eslint .` sem warnings novos (os 3 pré-existentes continuam)
- [ ] `npx next build` passa
- [ ] `npm test` verde, com os testes novos de parceria
- [ ] Nenhum arquivo acima de 500 linhas
- [ ] 18 parcerias ativas, uma por influenciador, e nenhum cupom sem `partnership_id`
- [ ] Nenhum influenciador mudou de termo na migração
- [ ] O índice único recusa uma segunda parceria ativa
- [ ] **O "a pagar" do `@caiiuxo` continua R$ 3.000**
- [ ] Renovar com valor novo **não** altera o desconto dos cupons antigos
- [ ] O link continua o mesmo depois de renovar
- [ ] `docs/BACKLOG.md` atualizado ao fim

## Depois deste plano

Subsistemas 2 a 5, na ordem do `docs/BACKLOG.md`: fechamentos e pagamentos, funil de prospecção, portal do influenciador, e a organização geral de menus. Mais a **entrega A** pendente do balcão, que é independente disto.
