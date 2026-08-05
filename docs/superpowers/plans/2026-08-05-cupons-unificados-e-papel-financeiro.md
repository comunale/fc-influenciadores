# Cupons unificados e papel Financeiro — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fundir as páginas Participantes e Cupons em uma só, criar o papel Financeiro e adicionar os campos Conferido, Pago e NF ao cupom.

**Architecture:** As duas páginas já consultam a mesma tabela `coupons` com a mesma query — a unificação remove duplicação real, não só conveniência. O papel novo entra como um terceiro valor em `admin_profiles.role`, e as permissões de escrita por campo são aplicadas em duas camadas: allowlist na rota da API e trigger no Postgres, seguindo o padrão já estabelecido na sessão anterior (a tela nunca é a única trava).

**Tech Stack:** Next.js 16.2.6 (App Router), React 19, Tailwind v4, Supabase (Postgres + RLS), TypeScript, xlsx.

## Estado da execução (atualizado em 2026-08-05)

| Task | Estado |
|---|---|
| 1 — Migração do banco | ✅ **feita**, testada e commitada (`dcf6412`) |
| 1b — NF obrigatória no banco | ✅ **feita** (`db/migrations/002_require_invoice_for_verified.sql`) |
| 2 — Tipos e permissões | pendente |
| 3 — Allowlist na API | pendente |
| 4 — Acesso do Financeiro | pendente ← **destrava o login do financeiro** |
| 5 — Criar/editar Financeiro pela tela | pendente |
| 6 — Página unificada | pendente |

**Já existe no banco:** o usuário `financeiro@foxcycles.com.br` com papel `finance`, ativo e com e-mail confirmado. Ele **ainda não consegue entrar** — `proxy.ts` e `AdminNav` só conhecem `admin` e `moderator`. A Task 4 resolve.

**Testes de permissão já validados no banco** (todos com rollback, nada ficou gravado): lojista bloqueado de conferir mas ainda validando no balcão; admin sem restrição; financeiro conferindo/pagando/NF mas bloqueado de alterar dados do cliente; conferir sem NF barrado pela constraint.

## Global Constraints

- Este projeto **não tem framework de teste**. Verificação = `npx tsc --noEmit`, `npx eslint .`, `npx next build`, asserções SQL via Supabase e smoke test HTTP com curl. Não adicionar Vitest/Jest nesta entrega.
- Arquivos abaixo de 500 linhas (regra do CLAUDE.md do repositório).
- Ler o arquivo antes de editar. Nunca commitar segredos.
- Nomes de coluna em **inglês**, para casar com o schema existente (`customer_name`, `used_at`, `used_by_admin`). Rótulos de tela em **português**.
- Toda regra de permissão vale na API **e** no banco. Esconder na tela não é trava.
- O banco é **produção** e é compartilhado com outro projeto (tabelas `card_*` do fc-digitalcard). Não tocar em nada fora de `coupons`, `admin_profiles` e nas funções nomeadas neste plano.
- Migrations são aplicadas via MCP do Supabase (`apply_migration`) e o SQL fica versionado em `db/migrations/`.

## Modelo de papéis (decidido)

Valor no banco (`admin_profiles.role`) e rótulo na tela:

| Banco | Tela | Quem é |
|---|---|---|
| `admin` | Administrador | Dono do sistema |
| `finance` | Financeiro | Setor financeiro (novo) |
| `moderator` | **Lojista** | Vendedor da loja |

**Por que `moderator` continua com esse nome no banco:** hoje 3 usuários reais têm esse valor, e ele aparece na RLS, no `proxy.ts` e em ~30 pontos do código. Renomear para `store` seria puro risco por ganho cosmético. A confusão se resolve trocando o **rótulo** para "Lojista" em toda a interface, que é onde a confusão existe.

**Por que `finance` e não "moderador":** você chamou o papel de "moderador", mas esse termo já é o valor de banco do lojista. Usar a mesma palavra para os dois seria a pior combinação possível. `finance` / "Financeiro" descreve melhor e não colide.

### Matriz de permissões

| | admin | finance | moderator |
|---|---|---|---|
| Dashboard | ✓ | ✓ | ✗ |
| Validar (balcão) | ✓ | ✗ | ✓ |
| Cupons (unificada) | ✓ edita | ✓ campos financeiros | ✓ só lê |
| Influencers | ✓ edita | ✓ lê | ✓ lê |
| Campanhas | ✓ edita | ✗ | ✓ lê |
| Configurações | ✓ | ✗ | ✗ |
| Marcar **Conferido** | ✓ | ✓ | ✗ |
| Marcar **Pago** | ✓ | ✓ | ✗ |
| Preencher **NF** | ✓ | ✓ | ✗ |
| Excluir cupom | ✓ | ✗ | ✗ |
| Exportar XLS | ✓ | ✓ | ✓ |

**O admin não tem restrição alguma.** Ele cria, apaga, edita e marca qualquer campo, em qualquer papel. As travas por papel existem para o Financeiro e para o Lojista; o admin passa por cima de todas. Foi decidido assim: separação de funções no campo Pago criaria um impasse, já que hoje existe um único admin.

### Colunas novas em `coupons`

| Coluna | Tipo | Rótulo | Preenchida por |
|---|---|---|---|
| `verified` | `boolean not null default false` | Conferido | admin, finance |
| `verified_at` | `timestamptz` | — | automático |
| `verified_by` | `text` | — | automático |
| `paid` | `boolean not null default false` | Pago | admin, finance |
| `paid_at` | `timestamptz` | Data pgto | automático |
| `paid_by` | `text` | — | automático |
| `invoice_number` | `text` | NF | admin, finance |

`verified` é a **conferência da venda** contra a NF, feita depois que o lojista já validou no balcão. Não substitui `status`.

### Regra: NF obrigatória para conferir

**Não é possível marcar `verified = true` sem `invoice_number` preenchido.** Sem nota fiscal não há prova da venda, e sem conferência não se paga o influenciador — é isso que fecha o circuito.

O número da NF é a trava mais forte do sistema: nota fiscal não se inventa, é documento rastreável amarrado a uma moto específica, com valor e comprador. As outras regras dificultam o uso indevido do cupom; esta é a que amarra.

Aplicada em três camadas:
1. **Banco** — `check constraint` em `coupons` (Task 1)
2. **API** — validação no PATCH antes de gravar (Task 3)
3. **Tela** — checkbox Conferido desabilitado enquanto o campo NF estiver vazio (Task 6)

## Estrutura de arquivos

**Criar:**
- `db/migrations/001_add_finance_role_and_coupon_fields.sql` — SQL versionado da Task 1
- `lib/auth/roles.ts` — papéis, rótulos e helpers de permissão (fonte única da verdade)
- `components/admin/cupons/CuponsTable.tsx` — orquestração e tabela
- `components/admin/cupons/CuponsFilters.tsx` — barra de filtros
- `components/admin/cupons/CuponsRow.tsx` — linha, edição inline e os checkboxes novos
- `components/admin/cupons/exportCupons.ts` — geração do XLS
- `components/admin/cupons/types.ts` — tipos compartilhados

**Modificar:**
- `lib/supabase/types.ts` — colunas novas
- `lib/supabase/server.ts` — `requireRole()` ao lado de `requireAdmin()`
- `app/api/admin/coupons/route.ts` — allowlist de campos por papel
- `app/api/admin/create-user/route.ts` e `update-user/route.ts` — aceitar `finance`
- `components/admin/UserManagement.tsx` — criar/editar Financeiro, rótulo "Lojista"
- `components/admin/AdminNav.tsx` — remover Participantes, navegação por papel
- `proxy.ts` — rotas permitidas para `finance`
- `app/admin/(protected)/cupons/page.tsx` — página unificada
- `app/admin/(protected)/participantes/page.tsx` — vira redirect

**Deletar:**
- `components/admin/ParticipantesTable.tsx` (402 linhas)
- `components/admin/CuponsTable.tsx` (505 linhas — substituído pela pasta `cupons/`)

---

### Task 1: Migração do banco

**Files:**
- Create: `db/migrations/001_add_finance_role_and_coupon_fields.sql`
- Aplicar via MCP Supabase `apply_migration`, projeto `uufrrhqrafxybdhkhvln`, nome `add_finance_role_and_coupon_fields`

**Interfaces:**
- Produces: colunas `verified`, `verified_at`, `verified_by`, `paid`, `paid_at`, `paid_by`, `invoice_number` em `coupons`; funções `public.is_finance()` e `public.can_read_admin()`; trigger `coupons_guard_non_admin_update` reescrito.

- [ ] **Step 1: Confirmar o estado de partida**

Rodar via MCP `execute_sql`:

```sql
select role, count(*) from public.admin_profiles group by role;
select conname, pg_get_constraintdef(oid) from pg_constraint
where conrelid = 'public.admin_profiles'::regclass and contype = 'c';
```

Esperado: `admin`=1, `moderator`=3, nenhum `store`. Constraint permite `('admin','store','moderator')`.
Se aparecer alguma linha com `store`, **pare** — o plano assume que esse valor está livre.

- [ ] **Step 2: Escrever o SQL da migração**

Criar `db/migrations/001_add_finance_role_and_coupon_fields.sql`:

```sql
-- Colunas de conferencia e pagamento
alter table public.coupons
  add column if not exists verified       boolean not null default false,
  add column if not exists verified_at    timestamptz,
  add column if not exists verified_by    text,
  add column if not exists paid           boolean not null default false,
  add column if not exists paid_at        timestamptz,
  add column if not exists paid_by        text,
  add column if not exists invoice_number text;

-- Papel novo. 'store' era permitido e nunca foi usado: sai.
alter table public.admin_profiles drop constraint if exists admin_profiles_role_check;
alter table public.admin_profiles add constraint admin_profiles_role_check
  check (role = any (array['admin'::text, 'finance'::text, 'moderator'::text]));

create or replace function public.is_finance()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.admin_profiles
    where id = auth.uid() and role = 'finance' and active = true
  );
$$;

-- UPDATE: admin e financeiro passam; lojista so na transicao de validacao.
drop policy if exists coupons_update_admin_or_validation on public.coupons;
create policy coupons_update_admin_or_validation on public.coupons
  for update to authenticated
  using (public.is_admin() or public.is_finance() or status = 'pending')
  with check (public.is_admin() or public.is_finance() or status in ('used', 'expired'));

-- Trigger: quem pode mudar o que, por papel.
create or replace function public.coupons_guard_non_admin_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- service_role, rotas server-side e admin passam direto: admin nao tem restricao.
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  if public.is_finance() then
    if new.customer_name  is distinct from old.customer_name
       or new.customer_cpf   is distinct from old.customer_cpf
       or new.customer_email is distinct from old.customer_email
       or new.customer_phone is distinct from old.customer_phone
       or new.coupon_number  is distinct from old.coupon_number
       or new.influencer_id  is distinct from old.influencer_id
       or new.campaign_id    is distinct from old.campaign_id
       or new.expires_at     is distinct from old.expires_at
       or new.created_at     is distinct from old.created_at
       or new.status         is distinct from old.status
    then
      raise exception 'Financeiro so pode alterar conferencia, pagamento e NF.';
    end if;
    return new;
  end if;

  -- lojista: so a validacao no balcao
  if new.customer_name  is distinct from old.customer_name
     or new.customer_cpf   is distinct from old.customer_cpf
     or new.customer_email is distinct from old.customer_email
     or new.customer_phone is distinct from old.customer_phone
     or new.coupon_number  is distinct from old.coupon_number
     or new.influencer_id  is distinct from old.influencer_id
     or new.campaign_id    is distinct from old.campaign_id
     or new.expires_at     is distinct from old.expires_at
     or new.created_at     is distinct from old.created_at
     or new.verified       is distinct from old.verified
     or new.paid           is distinct from old.paid
     or new.invoice_number is distinct from old.invoice_number
  then
    raise exception 'Apenas administradores podem alterar os dados do cupom.';
  end if;

  return new;
end;
$$;

drop trigger if exists coupons_guard_non_admin_update on public.coupons;
create trigger coupons_guard_non_admin_update
  before update on public.coupons
  for each row execute function public.coupons_guard_non_admin_update();
```

- [ ] **Step 3: Aplicar a migração**

Via MCP: `apply_migration(project_id: "uufrrhqrafxybdhkhvln", name: "add_finance_role_and_coupon_fields", query: <conteúdo do arquivo>)`.

- [ ] **Step 4: Verificar que as colunas e o papel existem**

```sql
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema='public' and table_name='coupons'
  and column_name in ('verified','verified_at','verified_by','paid','paid_at','paid_by','invoice_number')
order by column_name;

select pg_get_constraintdef(oid) from pg_constraint
where conname = 'admin_profiles_role_check';
```

Esperado: 7 colunas; `verified` e `paid` com `not null default false`. Constraint com `admin`, `finance`, `moderator`.

- [ ] **Step 5: Testar as travas por papel, com rollback**

Criar um usuário `finance` temporário só para o teste e usar o UUID do lojista existente (`aa3a3eb4-43e8-43b1-bfca-f71ebc047a42`) e do admin (`9b1a0c84-0c0a-4c31-9b19-37d0759fc0c2`).

Teste A — lojista NÃO pode marcar conferido (deve dar exceção):

```sql
begin;
insert into public.coupons (coupon_number, influencer_id, campaign_id, customer_name,
  customer_cpf, customer_phone, customer_email, status, expires_at)
select 'FOX-TST100', i.id, i.campaign_id, 'Teste', '00000000191', '19999999999',
       't@t.com', 'pending', now() + interval '30 days'
from public.influencers i limit 1;
set local role authenticated;
set local request.jwt.claims = '{"sub":"aa3a3eb4-43e8-43b1-bfca-f71ebc047a42","role":"authenticated"}';
update public.coupons set verified = true where coupon_number = 'FOX-TST100';
rollback;
```

Esperado: `ERROR: Apenas administradores podem alterar os dados do cupom.`

Teste B — lojista AINDA consegue validar no balcão (não pode ter quebrado):

```sql
begin;
insert into public.coupons (coupon_number, influencer_id, campaign_id, customer_name,
  customer_cpf, customer_phone, customer_email, status, expires_at)
select 'FOX-TST101', i.id, i.campaign_id, 'Teste', '00000000272', '19999999999',
       't@t.com', 'pending', now() + interval '30 days'
from public.influencers i limit 1;
set local role authenticated;
set local request.jwt.claims = '{"sub":"aa3a3eb4-43e8-43b1-bfca-f71ebc047a42","role":"authenticated"}';
with u as (update public.coupons set status='used', used_at=now(), used_by_admin='Campinas 1'
           where coupon_number='FOX-TST101' returning 1)
select count(*) as deve_ser_1 from u;
rollback;
```

Esperado: `1`. **Se der 0 ou erro, a migração quebrou a operação da loja — reverter antes de seguir.**

Teste C — admin PODE marcar pago (não tem restrição):

```sql
begin;
insert into public.coupons (coupon_number, influencer_id, campaign_id, customer_name,
  customer_cpf, customer_phone, customer_email, status, expires_at)
select 'FOX-TST102', i.id, i.campaign_id, 'Teste', '00000000353', '19999999999',
       't@t.com', 'pending', now() + interval '30 days'
from public.influencers i limit 1;
set local role authenticated;
set local request.jwt.claims = '{"sub":"9b1a0c84-0c0a-4c31-9b19-37d0759fc0c2","role":"authenticated"}';
with u as (update public.coupons set paid = true, paid_at = now(), paid_by = 'César Comunale'
           where coupon_number = 'FOX-TST102' returning 1)
select count(*) as deve_ser_1 from u;
rollback;
```

Esperado: `1`. O admin não tem nenhuma restrição de campo.

- [ ] **Step 6: Confirmar que nenhum dado de teste sobrou**

```sql
select coalesce(string_agg(coupon_number, ', '), 'limpo') from public.coupons
where coupon_number like 'FOX-TST%';
select count(*) as total from public.coupons;
```

Esperado: `limpo` e `14`.

- [ ] **Step 7: Commit**

```bash
git add db/migrations/001_add_finance_role_and_coupon_fields.sql
git commit -m "feat(db): papel finance e campos de conferencia, pagamento e NF no cupom"
```

---

### Task 2: Tipos e fonte única de permissões

**Files:**
- Create: `lib/auth/roles.ts`
- Modify: `lib/supabase/types.ts`, `lib/supabase/server.ts`

**Interfaces:**
- Produces: `type Role = 'admin' | 'finance' | 'moderator'`; `ROLE_LABELS: Record<Role, string>`; `can(role, action)`; `requireRole(roles: Role[])` em `server.ts`.
- Consumes: colunas criadas na Task 1.

- [ ] **Step 1: Criar o módulo de papéis**

Criar `lib/auth/roles.ts`:

```ts
export type Role = 'admin' | 'finance' | 'moderator'

export const ROLES: Role[] = ['admin', 'finance', 'moderator']

// Rótulo de tela. "moderator" é o lojista — o valor de banco ficou por
// compatibilidade, mas a interface nunca deve dizer "moderador".
export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrador',
  finance: 'Financeiro',
  moderator: 'Lojista',
}

export type Action =
  | 'coupons.read'
  | 'coupons.edit'
  | 'coupons.delete'
  | 'coupons.verify'
  | 'coupons.pay'
  | 'coupons.invoice'
  | 'validate'
  | 'dashboard'
  | 'influencers.edit'
  | 'campaigns.edit'
  | 'settings'

const MATRIX: Record<Action, Role[]> = {
  'coupons.read':     ['admin', 'finance', 'moderator'],
  'coupons.edit':     ['admin'],
  'coupons.delete':   ['admin'],
  'coupons.verify':   ['admin', 'finance'],
  'coupons.pay':      ['admin', 'finance'],
  'coupons.invoice':  ['admin', 'finance'],
  'validate':         ['admin', 'moderator'],
  'dashboard':        ['admin', 'finance'],
  'influencers.edit': ['admin'],
  'campaigns.edit':   ['admin'],
  'settings':         ['admin'],
}

export function can(role: string | null | undefined, action: Action): boolean {
  if (!role) return false
  return MATRIX[action].includes(role as Role)
}

export function isRole(value: string): value is Role {
  return (ROLES as string[]).includes(value)
}
```

- [ ] **Step 2: Adicionar as colunas novas aos tipos do Supabase**

Em `lib/supabase/types.ts`, dentro de `coupons`, acrescentar em **Row**, **Insert** e **Update**. Em `Row` os campos são obrigatórios; em `Insert`/`Update` todos opcionais:

```ts
// Row
verified: boolean
verified_at: string | null
verified_by: string | null
paid: boolean
paid_at: string | null
paid_by: string | null
invoice_number: string | null

// Insert e Update (mesmos campos, todos com ?)
verified?: boolean
verified_at?: string | null
verified_by?: string | null
paid?: boolean
paid_at?: string | null
paid_by?: string | null
invoice_number?: string | null
```

- [ ] **Step 3: Adicionar `requireRole` em `lib/supabase/server.ts`**

Logo abaixo de `requireAdmin`, mesmo formato de retorno:

```ts
import type { Role } from '@/lib/auth/roles'

// Igual ao requireAdmin, mas aceita uma lista de papéis e devolve qual deles é.
export async function requireRole(allowed: Role[]): Promise<
  | { userId: string; role: Role; name: string; error?: never }
  | { userId?: never; role?: never; name?: never; error: string; status: number }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autorizado.', status: 401 }

  const { data: profile } = await supabase
    .from('admin_profiles')
    .select('role, active, name')
    .eq('id', user.id)
    .single()

  if (!profile?.active) return { error: 'Conta inativa.', status: 403 }
  if (!allowed.includes(profile.role as Role)) {
    return { error: 'Sem permissão para esta ação.', status: 403 }
  }

  return { userId: user.id, role: profile.role as Role, name: profile.name }
}
```

- [ ] **Step 4: Verificar**

```bash
npx tsc --noEmit && npx eslint lib/auth/roles.ts lib/supabase/server.ts lib/supabase/types.ts
```

Esperado: sem erros e sem warnings novos.

- [ ] **Step 5: Commit**

```bash
git add lib/auth/roles.ts lib/supabase/types.ts lib/supabase/server.ts
git commit -m "feat: fonte unica de papeis e permissoes, com o papel finance"
```

---

### Task 3: Allowlist de campos por papel na API

**Files:**
- Modify: `app/api/admin/coupons/route.ts`

**Interfaces:**
- Consumes: `requireRole` e `can` da Task 2; colunas da Task 1.
- Produces: `PATCH /api/admin/coupons` aceitando `verified`, `paid`, `invoice_number` conforme o papel; `DELETE` continua só admin.

- [ ] **Step 1: Reescrever o `PATCH` com allowlist**

Substituir o `requireAdmin` local do arquivo pelo `requireRole` compartilhado e trocar o corpo do PATCH:

**Importante:** usar `createClient()` (sessão do usuário), **não** `createAdminClient()`.
A service role passa direto pelo trigger do Postgres, o que anularia a trava do banco e
deixaria a allowlist da API como única proteção. Com a sessão do usuário, as duas camadas
valem e uma discordância entre elas vira erro visível em vez de furo silencioso.

```ts
import { requireRole, createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { Role } from '@/lib/auth/roles'

// Quais colunas cada papel pode escrever. O banco repete essa regra no trigger:
// se as duas discordarem, o banco vence e a API devolve 500 — o que é o certo.
const FIELDS_BY_ROLE: Record<Role, string[]> = {
  admin: ['status', 'customer_name', 'customer_phone', 'customer_email', 'customer_cpf',
          'verified', 'paid', 'invoice_number'],
  finance: ['verified', 'paid', 'invoice_number'],
  moderator: [],
}

export async function PATCH(request: Request) {
  const auth = await requireRole(['admin', 'finance'])
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await request.json().catch(() => ({}))
  const { id, ...data } = body
  if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })

  const allowed = FIELDS_BY_ROLE[auth.role]
  const update: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(data)) {
    if (!allowed.includes(key)) continue
    if (key === 'verified' || key === 'paid') {
      update[key] = Boolean(value)
    } else {
      update[key] = String(value).trim()
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nenhum campo permitido para o seu perfil.' }, { status: 400 })
  }

  // NF obrigatória para conferir. O banco tem a mesma constraint; esta checagem
  // existe para devolver uma mensagem legível em vez do erro cru do Postgres.
  if (update.verified === true) {
    const nf = typeof update.invoice_number === 'string' ? update.invoice_number.trim() : ''
    if (!nf) {
      const { data: atual } = await (await createClient())
        .from('coupons').select('invoice_number').eq('id', id).single()
      if (!atual?.invoice_number?.trim()) {
        return NextResponse.json(
          { error: 'Informe o número da NF antes de marcar como conferido.' },
          { status: 400 }
        )
      }
    }
  }

  // Carimbo de quem e quando — nunca vem do cliente.
  const now = new Date().toISOString()
  if ('verified' in update) {
    update.verified_at = update.verified ? now : null
    update.verified_by = update.verified ? auth.name : null
  }
  if ('paid' in update) {
    update.paid_at = update.paid ? now : null
    update.paid_by = update.paid ? auth.name : null
  }

  const supabase = await createClient()
  const { error: dbErr } = await supabase.from('coupons').update(update).eq('id', id)
  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
```

O `DELETE` do mesmo arquivo troca o `requireAdmin` local por `requireRole(['admin'])`. Como
`requireRole` não devolve mais um client (o antigo helper local devolvia), o DELETE passa a
abrir o seu:

```ts
export async function DELETE(request: Request) {
  const auth = await requireRole(['admin'])
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { ids } = await request.json().catch(() => ({ ids: [] }))
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'ids[] obrigatório' }, { status: 400 })
  }

  const supabase = await createClient()
  const { error: dbErr } = await supabase.from('coupons').delete().in('id', ids)
  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })

  return NextResponse.json({ deleted: ids.length })
}
```

A função `requireAdmin` local no topo do arquivo é apagada — passa a valer a compartilhada.

- [ ] **Step 2: Verificar tipos e build**

```bash
npx tsc --noEmit && npx eslint app/api/admin/coupons/route.ts && npx next build
```

- [ ] **Step 3: Smoke test sem autenticação**

```bash
npx next dev -p 3114 &
sleep 15
curl -s -w " <- %{http_code}\n" -X PATCH http://localhost:3114/api/admin/coupons \
  -H "Content-Type: application/json" -d '{"id":"x","verified":true}'
```

Esperado: `{"error":"Não autorizado."} <- 401`.

- [ ] **Step 4: Commit**

```bash
git add app/api/admin/coupons/route.ts
git commit -m "feat(api): allowlist de campos do cupom por papel"
```

---

### Task 4: Acesso do papel Financeiro

**Files:**
- Modify: `proxy.ts`, `components/admin/AdminNav.tsx`, `app/admin/(protected)/configuracoes/page.tsx`

**Interfaces:**
- Consumes: `can()` e `ROLE_LABELS` da Task 2.
- Produces: `finance` navegando em `/admin`, `/admin/cupons` e `/admin/influencers`; bloqueado no resto.

- [ ] **Step 1: Trocar a regra do proxy**

Em `proxy.ts`, substituir o bloco `MODERATOR_BLOCKED_PREFIXES` e a checagem `profile?.role === 'moderator'` por uma tabela de rotas permitidas por papel:

```ts
// Prefixos que cada papel pode acessar. A primeira entrada é o destino
// do redirect quando a rota pedida não é permitida.
const ALLOWED_BY_ROLE: Record<string, string[]> = {
  admin:     ['/admin'],
  finance:   ['/admin/cupons', '/admin', '/admin/influencers'],
  moderator: ['/admin/validar', '/admin/cupons', '/admin/influencers', '/admin/campanhas'],
}

function isAllowed(role: string, pathname: string): boolean {
  if (role === 'admin') return true
  const allowed = ALLOWED_BY_ROLE[role] ?? []
  return allowed.some((p) => pathname === p || pathname.startsWith(p + '/'))
}
```

E na checagem de permissão:

```ts
if (profile?.role && profile.role !== 'admin') {
  if (!isAllowed(profile.role, pathname)) {
    const home = ALLOWED_BY_ROLE[profile.role]?.[0] ?? '/admin/validar'
    return NextResponse.redirect(new URL(home, request.url))
  }
}
```

Atenção: `finance` tem `/admin` na lista (dashboard), mas o lojista não — replicando o comportamento atual em que o moderador é jogado para `/admin/validar`.

- [ ] **Step 2: Navegação por papel**

Em `components/admin/AdminNav.tsx`: importar `ROLE_LABELS` de `@/lib/auth/roles`, **remover a entrada Participantes** e ajustar os papéis:

```ts
const ALL_NAV = [
  { href: '/admin',               label: 'Dashboard',     exact: true,  roles: ['admin', 'finance'] },
  { href: '/admin/validar',       label: 'Validar',       exact: false, roles: ['admin', 'moderator'] },
  { href: '/admin/cupons',        label: 'Cupons',        exact: false, roles: ['admin', 'finance', 'moderator'] },
  { href: '/admin/influencers',   label: 'Influencers',   exact: false, roles: ['admin', 'finance', 'moderator'] },
  { href: '/admin/campanhas',     label: 'Campanhas',     exact: false, roles: ['admin', 'moderator'] },
  { href: '/admin/configuracoes', label: 'Configurações', exact: false, roles: ['admin'] },
]
```

- [ ] **Step 3: Verificar**

```bash
npx tsc --noEmit && npx eslint proxy.ts components/admin/AdminNav.tsx && npx next build
```

- [ ] **Step 4: Commit**

```bash
git add proxy.ts components/admin/AdminNav.tsx
git commit -m "feat: acesso por papel no proxy e na navegacao, sem Participantes"
```

---

### Task 5: Criar e editar usuário Financeiro

**Files:**
- Modify: `app/api/admin/create-user/route.ts`, `app/api/admin/update-user/route.ts`, `components/admin/UserManagement.tsx`

**Interfaces:**
- Consumes: `ROLES`, `ROLE_LABELS`, `isRole` da Task 2.
- Produces: admin consegue criar e editar usuários `finance` pela tela de Configurações.

- [ ] **Step 1: Aceitar `finance` nas rotas**

Nas duas rotas, trocar `if (!['admin', 'moderator'].includes(role))` por `if (!isRole(role))`, importando de `@/lib/auth/roles`.

A regra de `store_name` continua valendo só para o lojista — as três ocorrências de `role === 'moderator' ? ... : null` ficam como estão. Financeiro não tem loja.

Em `update-user/route.ts`, a trava do último admin (linha ~49) compara `target.role === 'admin' && role !== 'admin'`: continua correta, porque rebaixar admin para `finance` também deve ser barrado se for o último.

- [ ] **Step 2: Atualizar a tela de usuários**

Em `components/admin/UserManagement.tsx`:
- Apagar o `ROLE_LABELS` local e importar de `@/lib/auth/roles`
- Nos dois `<select>` (criação e edição), gerar as opções a partir de `ROLES`:

```tsx
{ROLES.map((r) => (
  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
))}
```

- A badge de papel na listagem passa a diferenciar os três:

```tsx
<span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
  u.role === 'admin' ? 'bg-[#00ff87]/10 text-[#00ff87]' :
  u.role === 'finance' ? 'bg-blue-500/10 text-blue-400' :
  'bg-[#1e1e1e] text-gray-400'
}`}>
  {ROLE_LABELS[u.role as Role] || u.role}
</span>
```

- [ ] **Step 3: Verificar**

```bash
npx tsc --noEmit && npx eslint app/api/admin/create-user/route.ts app/api/admin/update-user/route.ts components/admin/UserManagement.tsx && npx next build
```

- [ ] **Step 4: Criar o usuário do financeiro de verdade**

Rodar a aplicação, entrar como admin, ir em Configurações → Usuários → Novo Usuário, escolher **Financeiro**. Depois confirmar no banco:

```sql
select name, email, role, active from public.admin_profiles where role = 'finance';
```

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/create-user/route.ts app/api/admin/update-user/route.ts components/admin/UserManagement.tsx
git commit -m "feat: criar e editar usuarios do papel Financeiro"
```

---

### Task 6: Página unificada de cupons

**Files:**
- Create: `components/admin/cupons/types.ts`, `CuponsFilters.tsx`, `CuponsRow.tsx`, `exportCupons.ts`, `CuponsTable.tsx`
- Modify: `app/admin/(protected)/cupons/page.tsx`, `app/admin/(protected)/participantes/page.tsx`
- Delete: `components/admin/CuponsTable.tsx`, `components/admin/ParticipantesTable.tsx`

**Interfaces:**
- Consumes: `can()` da Task 2, rota PATCH da Task 3, colunas da Task 1.
- Produces: `/admin/cupons` como única tela de conferência e relatório.

- [ ] **Step 1: Extrair os tipos**

`components/admin/cupons/types.ts` com a interface `CouponRow` — os campos atuais de `CuponsTable` mais os sete novos — e `InfluencerOption { id, name, instagram_handle }`.

- [ ] **Step 2: Mover filtros e export para arquivos próprios**

`CuponsFilters.tsx` recebe o bloco de busca, status, influencer e datas do `CuponsTable` atual, sem mudança de comportamento.

`exportCupons.ts` exporta `exportCuponsXLS(rows: CouponRow[])` com a **união** das colunas das duas tabelas antigas mais as novas:

```ts
const headers = ['Código', 'Data', 'Cliente', 'CPF', 'Telefone', 'Email', 'Influencer',
  'Status', 'Desconto', 'Validade', 'Usado em', 'Validado por',
  'Conferido', 'Pago', 'Data pgto', 'NF']
```

Larguras: `[14, 18, 24, 16, 16, 28, 18, 12, 12, 14, 18, 20, 12, 10, 18, 16]`. Manter `!freeze` e `!autofilter` como já são. Nome do arquivo: `cupons-YYYY-MM-DD.xlsx`.

- [ ] **Step 3: Criar a linha com os campos novos**

`CuponsRow.tsx` renderiza a linha e recebe `role: Role`. Os checkboxes ficam desabilitados quando o papel não pode escrever, e cada clique chama o PATCH:

```tsx
<input
  type="checkbox"
  checked={row.verified}
  disabled={!can(role, 'coupons.verify') || saving}
  onChange={(e) => patch({ verified: e.target.checked })}
  className="w-4 h-4 accent-[#00ff87] disabled:opacity-40 disabled:cursor-not-allowed"
/>
```

O campo NF é um `<input type="text">` que salva no `onBlur`, evitando um PATCH por tecla. `verified_by`/`paid_at` aparecem como texto auxiliar abaixo do checkbox quando preenchidos.

**NF obrigatória para conferir.** O checkbox Conferido fica desabilitado enquanto o cupom não tiver NF, com `title` explicando o motivo — o usuário precisa entender por que não consegue clicar, em vez de achar que está quebrado:

```tsx
const semNF = !row.invoice_number?.trim()

<input
  type="checkbox"
  checked={row.verified}
  disabled={!can(role, 'coupons.verify') || semNF || saving}
  title={semNF ? 'Informe o número da NF antes de conferir' : undefined}
  onChange={(e) => patch({ verified: e.target.checked })}
/>
```

Ordem das colunas na tabela: **NF antes de Conferido**, para que o preenchimento siga a ordem natural de uso.

- [ ] **Step 4: Montar o `CuponsTable` novo**

Orquestra filtros, linhas, seleção em massa e export. Título: **"Cupons"**, subtítulo `{n} resultado(s)`. Exclusão em massa só aparece com `can(role, 'coupons.delete')`.

Verificar o tamanho ao final — nenhum arquivo pode passar de 500 linhas:

```bash
wc -l components/admin/cupons/*.tsx components/admin/cupons/*.ts
```

- [ ] **Step 5: Página e redirect**

`app/admin/(protected)/cupons/page.tsx` passa a ler o papel e repassar (`role={role}` em vez de `canEdit`), liberando o acesso para `admin`, `finance` e `moderator`.

`app/admin/(protected)/participantes/page.tsx` vira só:

```tsx
import { redirect } from 'next/navigation'

export default function ParticipantesPage() {
  redirect('/admin/cupons')
}
```

Motivo de manter a rota em vez de apagar: links e favoritos antigos continuam funcionando.

- [ ] **Step 6: Deletar os componentes antigos**

```bash
git rm components/admin/CuponsTable.tsx components/admin/ParticipantesTable.tsx
```

Conferir que ninguém mais os importa:

```bash
grep -rn "ParticipantesTable\|admin/CuponsTable" app components lib
```

Esperado: nenhuma linha.

- [ ] **Step 7: Verificar**

```bash
npx tsc --noEmit && npx eslint . && npx next build
```

- [ ] **Step 8: Conferir na tela**

Subir `npx next dev`, entrar como admin e confirmar: Participantes sumiu do menu; `/admin/participantes` redireciona; os checkboxes Conferido e NF funcionam; Pago aparece desabilitado para o admin; o XLS sai com as 16 colunas.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: unifica Participantes e Cupons em uma tela so, com conferencia, pagamento e NF"
```

---

## Verificação final

- [ ] `npx tsc --noEmit` limpo
- [ ] `npx eslint .` sem warnings novos (os pré-existentes em `page.tsx`, `CouponCard.tsx`, `FoxLogo.tsx` e `test-system.mjs` continuam)
- [ ] `npx next build` passa
- [ ] Nenhum arquivo acima de 500 linhas
- [ ] Lojista continua conseguindo validar cupom no balcão — **este é o teste que não pode falhar**
- [ ] Lojista não consegue marcar Conferido nem Pago, nem pela API nem pelo banco
- [ ] Financeiro marca Conferido, Pago e NF, e não consegue editar dados do cliente
- [ ] `git push origin master`

## Fora de escopo

- O fluxo do QR code anti-abuso (spec de 2026-07-28). Continua não implementado e o commit da spec segue sem push.
- Cálculo automático de comissão a partir de `commission_per_sale` e `commission_starts_at`.
- Detecção de telefone repetido.
- Qualquer notificação fora do sistema.
