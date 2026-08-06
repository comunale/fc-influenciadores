# Vendedores no balcão e escopo final dos papéis — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Amarrar cada validação de cupom a um vendedor nomeado e fechar o escopo de tela de cada papel, deixando o Lojista só com Validar e Cupons.

**Architecture:** Uma tabela nova `sellers` (nome, loja, ativo) e uma coluna `seller_id` em `coupons`. O vendedor é escolhido numa lista suspensa nos dois fluxos da tela Validar, e o vínculo é conferido em duas camadas — checagem na rota da API e trigger no Postgres — porque esconder na tela nunca foi trava neste sistema. Na mesma entrega, `/api/coupons/validate` para de aceitar o nome do validador vindo do corpo da requisição.

**Tech Stack:** Next.js 16.2.6 (App Router), React 19, Tailwind v4, Supabase (Postgres + RLS), TypeScript.

**Spec de origem:** `docs/superpowers/specs/2026-08-05-vendedores-e-papeis-design.md` (aprovada pelo César em 2026-08-05).

---

## Global Constraints

- Este projeto **não tem framework de teste**. Verificação = `npx tsc --noEmit`, `npx eslint .`, `npx next build`, asserções SQL via MCP do Supabase e smoke test HTTP com curl. **Não adicionar Vitest/Jest nesta entrega.**
- Este **não é o Next.js que você conhece** (regra do `AGENTS.md` do projeto). Antes de escrever código de rota ou de página, ler o guia relevante em `node_modules/next/dist/docs/`. Respeitar avisos de depreciação.
- Arquivos abaixo de **500 linhas** (regra do `CLAUDE.md` do repositório). `ValidarClient.tsx` já está em 479 linhas — a Task 5 **precisa** extrair um componente antes de acrescentar qualquer coisa.
- Ler o arquivo antes de editar. Nunca commitar segredos.
- Nomes de coluna em **inglês** (`seller_id`, `store_name`, `active`). Rótulos de tela em **português** ("Vendedor", "Loja").
- Toda regra de permissão vale na API **e** no banco.
- O banco é **produção** e é compartilhado com o fc-digitalcard (tabelas `card_*`). Não tocar em nada fora de `coupons`, `admin_profiles`, `sellers` e nas funções nomeadas neste plano.
- Migrations são aplicadas via MCP do Supabase (`apply_migration`) e o SQL fica versionado em `db/migrations/`.
- Project ID do Supabase: `uufrrhqrafxybdhkhvln`.
- Papéis no banco: `admin` (Administrador), `finance` (Financeiro), `moderator` (**Lojista** — o valor de banco enganou gente antes; a tela nunca diz "moderador").

## Armadilha do `store_name` — leia antes da Task 4

A lista de vendedores do balcão é filtrada por igualdade exata entre `sellers.store_name` e `admin_profiles.store_name` do usuário logado. Hoje existem **dois** logins de loja no banco, e os valores **não seguem o mesmo padrão**:

| Login (`name`) | `store_name` gravado |
|---|---|
| Campinas 1 | `Campinas 1` |
| Campinas 2 | `Fox Cycles Campinas 2` |

Cadastrar um vendedor como `"Campinas 2"` faz a lista aparecer **vazia** no balcão da Campinas 2, sem erro nenhum na tela. Copiar os valores acima ao pé da letra. Se o César quiser padronizar os nomes das lojas, isso é uma decisão dele e vira outro plano — não fazer de passagem aqui.

## Decisão já tomada, não reabrir

O vendedor escolhe o próprio nome numa lista **sem PIN e sem senha**. Nada impede que escolha o nome de um colega. O campo é **rastro, não prova** — serve para revelar padrão, não para sustentar cobrança individual. Foi oferecido PIN de 4 dígitos e login individual; o César escolheu a lista pura por velocidade no balcão. Não implementar PIN "só por garantia".

---

### Task 1: Migração do banco — tabela `sellers` e vínculo no cupom

**Files:**
- Create: `db/migrations/003_sellers_and_coupon_seller.sql`
- Aplicar via MCP `apply_migration` no projeto `uufrrhqrafxybdhkhvln`

**Interfaces:**
- Consumes: funções `public.is_admin()` e `public.is_finance()`, que já existem (criadas na migração 001).
- Produces: tabela `public.sellers(id, name, store_name, active, created_at)`; coluna `public.coupons.seller_id uuid`; funções `public.caller_store_name()` e `public.seller_ok_for_caller(uuid)`; triggers `coupons_guard_non_admin_update` (substituída) e `coupons_guard_insert` (nova).

- [ ] **Step 1: Escrever o arquivo de migração**

Criar `db/migrations/003_sellers_and_coupon_seller.sql`:

```sql
-- 003_sellers_and_coupon_seller.sql
-- Vendedor nomeado no balcao. Ver docs/superpowers/specs/2026-08-05-vendedores-e-papeis-design.md
--
-- used_by_admin continua sendo o LOGIN que operou o sistema.
-- seller_id e o nome REIVINDICADO pela pessoa no balcao.
-- Os dois sao fatos diferentes e ficam lado a lado de proposito: e o par que revela padrao.

-- ── Tabela de vendedores ──
create table if not exists public.sellers (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  store_name text not null,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists sellers_store_active_idx on public.sellers (store_name, active);

alter table public.sellers enable row level security;

-- Leitura: qualquer autenticado (o lojista precisa montar a lista do balcao).
drop policy if exists sellers_select_authenticated on public.sellers;
create policy sellers_select_authenticated on public.sellers
  for select to authenticated using (true);

-- Escrita: so admin.
drop policy if exists sellers_insert_admin on public.sellers;
create policy sellers_insert_admin on public.sellers
  for insert to authenticated with check (public.is_admin());

drop policy if exists sellers_update_admin on public.sellers;
create policy sellers_update_admin on public.sellers
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Sem policy de DELETE de proposito: vendedor nunca e excluido, so desativado.
-- Excluir levaria junto o historico de quem validou o que.

-- ── Vinculo no cupom ──
alter table public.coupons
  add column if not exists seller_id uuid references public.sellers(id);

create index if not exists coupons_seller_idx on public.coupons (seller_id);

-- ── Helpers de checagem ──
create or replace function public.caller_store_name()
returns text language sql stable security definer set search_path = public as $$
  select store_name from public.admin_profiles where id = auth.uid();
$$;

-- Vendedor serve para quem esta chamando? Precisa existir, estar ativo e
-- ser da loja do chamador. Admin nao tem loja no perfil e passa por cima.
create or replace function public.seller_ok_for_caller(p_seller uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.sellers s
    where s.id = p_seller
      and s.active
      and (public.is_admin() or s.store_name = public.caller_store_name())
  );
$$;

-- ── Guard de UPDATE (substitui a versao da migracao 001) ──
create or replace function public.coupons_guard_non_admin_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
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
       or new.seller_id      is distinct from old.seller_id
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

  -- Validacao no balcao exige vendedor da propria loja.
  if new.status = 'used' and old.status is distinct from 'used' then
    if new.seller_id is null then
      raise exception 'Escolha o vendedor antes de validar o cupom.';
    end if;
    if not public.seller_ok_for_caller(new.seller_id) then
      raise exception 'Vendedor invalido para esta loja.';
    end if;
  end if;

  -- Trocar o vendedor depois da validacao e coisa de admin.
  if new.seller_id is distinct from old.seller_id
     and old.status = 'used'
  then
    raise exception 'Apenas administradores podem trocar o vendedor de um cupom ja validado.';
  end if;

  return new;
end;
$$;

drop trigger if exists coupons_guard_non_admin_update on public.coupons;
create trigger coupons_guard_non_admin_update
  before update on public.coupons
  for each row execute function public.coupons_guard_non_admin_update();

-- ── Guard de INSERT (novo) ──
-- O cadastro express insere o cupom ja com status 'used'. Sem este trigger,
-- o caminho mais usado do sistema (100% das vendas reais saem do express)
-- ficaria sem nenhuma trava de banco no vinculo do vendedor.
-- A policy coupons_insert_public permite insert anonimo (o formulario publico
-- em /c/): esse caso entra com auth.uid() nulo, seller_id nulo e status
-- 'pending', e passa direto.
create or replace function public.coupons_guard_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  if new.status = 'used' then
    if new.seller_id is null then
      raise exception 'Escolha o vendedor antes de validar o cupom.';
    end if;
    if not public.seller_ok_for_caller(new.seller_id) then
      raise exception 'Vendedor invalido para esta loja.';
    end if;
  elsif new.seller_id is not null and not public.seller_ok_for_caller(new.seller_id) then
    raise exception 'Vendedor invalido para esta loja.';
  end if;

  return new;
end;
$$;

drop trigger if exists coupons_guard_insert on public.coupons;
create trigger coupons_guard_insert
  before insert on public.coupons
  for each row execute function public.coupons_guard_insert();
```

- [ ] **Step 2: Aplicar a migração**

Usar o MCP do Supabase, ferramenta `apply_migration`, com `project_id: uufrrhqrafxybdhkhvln`, `name: "003_sellers_and_coupon_seller"` e o conteúdo do arquivo acima.

- [ ] **Step 3: Verificar que a estrutura existe**

Rodar via MCP `execute_sql`:

```sql
select
  (select count(*) from information_schema.tables
     where table_schema='public' and table_name='sellers')            as tabela_sellers,
  (select count(*) from information_schema.columns
     where table_schema='public' and table_name='coupons'
       and column_name='seller_id')                                    as coluna_seller_id,
  (select count(*) from pg_policies
     where schemaname='public' and tablename='sellers')                as policies_sellers,
  (select count(*) from pg_trigger
     where tgname in ('coupons_guard_insert','coupons_guard_non_admin_update')
       and not tgisinternal)                                           as triggers;
```

Esperado: `tabela_sellers=1`, `coluna_seller_id=1`, `policies_sellers=3`, `triggers=2`.

- [ ] **Step 4: Provar que o trigger barra vendedor de outra loja**

Rodar via MCP `execute_sql`. O bloco inteiro dá `rollback` no fim — **nada fica gravado**:

```sql
begin;

insert into public.sellers (id, name, store_name)
values ('00000000-0000-0000-0000-0000000000a1', 'Teste Loja A', 'Campinas 1'),
       ('00000000-0000-0000-0000-0000000000a2', 'Teste Loja B', 'Fox Cycles Campinas 2');

-- Sem auth.uid() o guard passa direto (rotas server-side e service_role).
-- Para provar a trava, chamamos a funcao de checagem com o admin simulado
-- desligado: sem sessao, is_admin() e false e caller_store_name() e null,
-- entao nenhum vendedor casa.
select public.seller_ok_for_caller('00000000-0000-0000-0000-0000000000a1') as deve_ser_false;

-- Vendedor inativo nunca serve, para ninguem.
update public.sellers set active = false
  where id = '00000000-0000-0000-0000-0000000000a1';
select public.seller_ok_for_caller('00000000-0000-0000-0000-0000000000a1') as deve_ser_false_tambem;

rollback;
```

Esperado: as duas colunas voltam `false`. A trava por loja com sessão real é testada em runtime na Task 5, logando como Campinas 1 e tentando um vendedor da Campinas 2 via curl.

- [ ] **Step 5: Confirmar que os 14 cupons antigos continuam intactos**

```sql
select count(*) as total, count(seller_id) as com_vendedor from public.coupons;
```

Esperado: `com_vendedor = 0` e `total` igual ao que já existia. Cupons anteriores à regra ficam com `seller_id` nulo de propósito — não inventar vendedor para eles.

- [ ] **Step 6: Commit**

```bash
git add db/migrations/003_sellers_and_coupon_seller.sql
git commit -m "feat(db): tabela de vendedores e vinculo do vendedor no cupom"
```

---

### Task 2: Tipos e API de vendedores

**Files:**
- Modify: `lib/supabase/types.ts` (bloco `coupons` e novo bloco `sellers`)
- Create: `app/api/admin/sellers/route.ts`

**Interfaces:**
- Consumes: `requireRole(allowed: Role[]): Promise<RoleAuth>` e `createClient()` de `@/lib/supabase/server`. `RoleAuth` é a união `{ ok: true; userId: string; role: Role; name: string } | { ok: false; error: string; status: number }` — o guard é sempre `if (!auth.ok)`.
- Produces: `Database['public']['Tables']['sellers']`; rota `/api/admin/sellers` com `GET` (lista visível para quem chamou), `POST` (cria, só admin) e `PATCH` (renomeia / troca de loja / ativa / desativa, só admin).

- [ ] **Step 1: Adicionar `seller_id` ao bloco `coupons` em `lib/supabase/types.ts`**

Nos três sub-blocos do bloco `coupons`, acrescentar a linha logo depois de `invoice_number`:

- Em `Row:` → `seller_id: string | null`
- Em `Insert:` → `seller_id?: string | null`
- Em `Update:` → `seller_id?: string | null`

E no array `Relationships` do bloco `coupons`, acrescentar:

```ts
          {
            foreignKeyName: "coupons_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
```

- [ ] **Step 2: Adicionar o bloco `sellers` em `lib/supabase/types.ts`**

Dentro de `Tables`, em ordem alfabética (depois de `coupons`):

```ts
      sellers: {
        Row: {
          id: string
          name: string
          store_name: string
          active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          store_name: string
          active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          store_name?: string
          active?: boolean
          created_at?: string
        }
        Relationships: []
      }
```

- [ ] **Step 3: Criar `app/api/admin/sellers/route.ts`**

```ts
import { requireRole, createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// GET — lista os vendedores que quem chamou pode ver.
// Admin e financeiro veem todos; lojista só os da própria loja.
export async function GET() {
  const auth = await requireRole(['admin', 'finance', 'moderator'])
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const supabase = await createClient()

  let query = supabase
    .from('sellers')
    .select('id, name, store_name, active, created_at')
    .order('store_name')
    .order('name')

  if (auth.role === 'moderator') {
    const { data: profile } = await supabase
      .from('admin_profiles')
      .select('store_name')
      .eq('id', auth.userId)
      .single()

    // Lojista sem loja no perfil não pode ver a lista inteira: devolve vazio.
    if (!profile?.store_name) return NextResponse.json({ sellers: [] })
    query = query.eq('store_name', profile.store_name)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ sellers: data ?? [] })
}

// POST — cria um vendedor. Só admin.
export async function POST(request: Request) {
  const auth = await requireRole(['admin'])
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await request.json().catch(() => ({}))
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const storeName = typeof body.store_name === 'string' ? body.store_name.trim() : ''

  if (!name) return NextResponse.json({ error: 'Nome é obrigatório.' }, { status: 400 })
  if (!storeName) return NextResponse.json({ error: 'Loja é obrigatória.' }, { status: 400 })

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sellers')
    .insert({ name, store_name: storeName })
    .select('id, name, store_name, active, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ seller: data }, { status: 201 })
}

// PATCH — renomeia, troca de loja ou ativa/desativa. Só admin.
// Não existe DELETE de propósito: excluir levaria junto o histórico de
// quem validou o quê. Renomear corrige o nome em todo o histórico.
export async function PATCH(request: Request) {
  const auth = await requireRole(['admin'])
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await request.json().catch(() => ({}))
  const id = typeof body.id === 'string' ? body.id : ''
  if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })

  const update: { name?: string; store_name?: string; active?: boolean } = {}

  if (typeof body.name === 'string') {
    const name = body.name.trim()
    if (!name) return NextResponse.json({ error: 'Nome não pode ficar vazio.' }, { status: 400 })
    update.name = name
  }
  if (typeof body.store_name === 'string') {
    const storeName = body.store_name.trim()
    if (!storeName) return NextResponse.json({ error: 'Loja não pode ficar vazia.' }, { status: 400 })
    update.store_name = storeName
  }
  if (typeof body.active === 'boolean') {
    update.active = body.active
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nada para atualizar.' }, { status: 400 })
  }

  const supabase = await createClient()
  const { error } = await supabase.from('sellers').update(update).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Verificar tipos, lint e build**

```bash
npx tsc --noEmit && npx eslint lib/supabase/types.ts app/api/admin/sellers/route.ts && npx next build
```

Esperado: os três limpos.

- [ ] **Step 5: Smoke test de 401**

Com `npm run dev` rodando na porta 3114, sem cookie de sessão:

```bash
curl -s -w " <- %{http_code}\n" http://localhost:3114/api/admin/sellers
curl -s -w " <- %{http_code}\n" -X POST http://localhost:3114/api/admin/sellers \
  -H 'Content-Type: application/json' -d '{"name":"X","store_name":"Y"}'
```

Esperado: `{"error":"Não autorizado."} <- 401` nos dois.

- [ ] **Step 6: Commit**

```bash
git add lib/supabase/types.ts app/api/admin/sellers/route.ts
git commit -m "feat(api): tipos e rota de vendedores"
```

---

### Task 3: Aba "Vendedores" em Configurações

**Files:**
- Create: `components/admin/SellerManagement.tsx`
- Modify: `components/admin/ConfigTabs.tsx`
- Modify: `app/admin/(protected)/configuracoes/page.tsx`

**Interfaces:**
- Consumes: `/api/admin/sellers` (POST e PATCH) da Task 2. `Button` de `@/components/ui/button`, `Input` de `@/components/ui/input`, `toast` de `react-hot-toast`, `useRouter` de `next/navigation` — o mesmo conjunto que `UserManagement.tsx` já usa.
- Produces: `export function SellerManagement({ sellers, storeNames }: { sellers: Seller[]; storeNames: string[] })` e o tipo `Seller = { id: string; name: string; store_name: string; active: boolean; created_at: string }`.

Segue o padrão visual da aba Usuários: lista com um item por linha, formulário de criação que abre/fecha, edição inline. Sem botão Excluir — vendedor só desativa.

- [ ] **Step 1: Criar `components/admin/SellerManagement.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export interface Seller {
  id: string
  name: string
  store_name: string
  active: boolean
  created_at: string
}

export function SellerManagement({
  sellers,
  storeNames,
}: {
  sellers: Seller[]
  storeNames: string[]
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState({ name: '', store_name: storeNames[0] ?? '' })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ name: '', store_name: '' })

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const res = await fetch('/api/admin/sellers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createForm),
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) { toast.error(data.error || 'Erro ao criar vendedor.'); return }
    toast.success(`Vendedor "${createForm.name}" criado!`)
    setCreateForm({ name: '', store_name: storeNames[0] ?? '' })
    setShowCreate(false)
    router.refresh()
  }

  function openEdit(s: Seller) {
    setEditingId(s.id)
    setEditForm({ name: s.name, store_name: s.store_name })
  }

  async function handleEdit(id: string) {
    if (!editForm.name.trim()) { toast.error('Nome é obrigatório.'); return }
    setLoading(true)
    const res = await fetch('/api/admin/sellers', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...editForm }),
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) { toast.error(data.error || 'Erro ao atualizar vendedor.'); return }
    toast.success('Vendedor atualizado!')
    setEditingId(null)
    router.refresh()
  }

  async function handleToggleActive(s: Seller) {
    setLoading(true)
    const res = await fetch('/api/admin/sellers', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: s.id, active: !s.active }),
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) { toast.error(data.error || 'Erro ao alterar o vendedor.'); return }
    toast.success(s.active ? 'Vendedor desativado.' : 'Vendedor ativado.')
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-gray-500 text-sm">
          {sellers.length} vendedor{sellers.length !== 1 ? 'es' : ''} cadastrado{sellers.length !== 1 ? 's' : ''}
        </p>
        <Button size="sm" onClick={() => setShowCreate((v) => !v)}>
          {showCreate ? 'Cancelar' : '+ Novo Vendedor'}
        </Button>
      </div>

      <p className="text-gray-500 text-xs leading-relaxed">
        O vendedor escolhe o próprio nome na tela Validar, sem senha. O campo serve para
        revelar padrão — não é prova de quem atendeu. Vendedor não se exclui: desative,
        e o histórico de quem validou o quê continua de pé.
      </p>

      {showCreate && (
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-5">
          <h3 className="text-white font-semibold mb-4">Novo vendedor</h3>
          <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Nome *" placeholder="Ex: João da Silva" value={createForm.name}
              onChange={(e) => setCreateForm((p) => ({ ...p, name: e.target.value }))}
              required disabled={loading} />
            <div>
              <label className="text-sm text-gray-300 block mb-1.5">Loja *</label>
              <select
                value={createForm.store_name}
                onChange={(e) => setCreateForm((p) => ({ ...p, store_name: e.target.value }))}
                className="w-full h-12 px-4 rounded-lg border border-[#2a2a2a] bg-[#1e1e1e] text-white text-sm focus:border-[#00ff87] focus:outline-none"
                disabled={loading}
                required
              >
                {storeNames.length === 0 && <option value="">Nenhuma loja cadastrada</option>}
                {storeNames.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="md:col-span-2 flex gap-3">
              <Button type="submit" loading={loading}>Criar vendedor</Button>
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)} disabled={loading}>Cancelar</Button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-[#141414] border border-[#1e1e1e] rounded-xl overflow-hidden divide-y divide-[#1a1a1a]">
        {sellers.length === 0 && (
          <div className="px-6 py-8 text-center text-gray-500 text-sm">Nenhum vendedor cadastrado.</div>
        )}
        {sellers.map((s) => (
          <div key={s.id} className="px-5 py-4">
            {editingId === s.id ? (
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Input label="Nome" value={editForm.name}
                    onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                    disabled={loading} />
                  <div>
                    <label className="text-sm text-gray-300 block mb-1.5">Loja</label>
                    <select
                      value={editForm.store_name}
                      onChange={(e) => setEditForm((p) => ({ ...p, store_name: e.target.value }))}
                      className="w-full h-12 px-4 rounded-lg border border-[#2a2a2a] bg-[#1e1e1e] text-white text-sm focus:border-[#00ff87] focus:outline-none"
                      disabled={loading}
                    >
                      {storeNames.map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" loading={loading} onClick={() => handleEdit(s.id)}>Salvar</Button>
                  <Button size="sm" variant="outline" onClick={() => setEditingId(null)} disabled={loading}>Cancelar</Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-sm font-medium ${s.active ? 'text-white' : 'text-gray-500 line-through'}`}>
                      {s.name}
                    </span>
                    {!s.active && (
                      <span className="text-xs bg-red-950 text-red-400 px-2 py-0.5 rounded-full">Inativo</span>
                    )}
                  </div>
                  <div className="text-gray-500 text-xs mt-0.5">{s.store_name}</div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => openEdit(s)}
                    className="text-xs border border-[#2a2a2a] text-gray-400 hover:text-white hover:border-[#00ff87] px-3 py-1.5 rounded-lg transition-colors">
                    Editar
                  </button>
                  <button onClick={() => handleToggleActive(s)}
                    className={`text-xs border px-3 py-1.5 rounded-lg transition-colors ${
                      s.active ? 'border-red-800 text-red-400 hover:bg-red-950' : 'border-[#00ff87]/30 text-[#00ff87] hover:bg-[#00ff87]/10'
                    }`}>
                    {s.active ? 'Desativar' : 'Ativar'}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Ligar a aba em `components/admin/ConfigTabs.tsx`**

Acrescentar o import:

```tsx
import { SellerManagement, type Seller } from './SellerManagement'
```

Acrescentar a aba entre Usuários e Geral:

```tsx
const TABS = [
  { id: 'usuarios', label: 'Usuários' },
  { id: 'vendedores', label: 'Vendedores' },
  { id: 'geral', label: 'Geral' },
]
```

Acrescentar `sellers` e `storeNames` às props do componente:

```tsx
export function ConfigTabs({
  users,
  currentUserId,
  settings,
  sellers,
  storeNames,
}: {
  users: UserProfile[]
  currentUserId: string
  settings: Settings
  sellers: Seller[]
  storeNames: string[]
}) {
```

E o bloco de conteúdo, depois do bloco `usuarios`:

```tsx
      {activeTab === 'vendedores' && (
        <SellerManagement sellers={sellers} storeNames={storeNames} />
      )}
```

- [ ] **Step 3: Carregar os dados em `app/admin/(protected)/configuracoes/page.tsx`**

Acrescentar a consulta de vendedores ao `Promise.all` já existente:

```tsx
  const [usersRes, settingsRes, sellersRes] = await Promise.all([
    supabase
      .from('admin_profiles')
      .select('id, name, email, role, store_name, active, created_at')
      .order('created_at'),
    supabase
      .from('app_settings')
      .select('company_name, sender_email, whatsapp_text, email_subject, email_body, contact_phone')
      .eq('id', 1)
      .single(),
    supabase
      .from('sellers')
      .select('id, name, store_name, active, created_at')
      .order('store_name')
      .order('name'),
  ])
```

Depois do bloco `settings`, montar a lista de lojas a partir dos logins de lojista — é ela que garante que o `store_name` do vendedor case exatamente com o do login:

```tsx
  // As lojas vêm dos próprios logins de lojista. Digitar o nome à mão abriria
  // espaço para "Campinas 2" ≠ "Fox Cycles Campinas 2", e a lista do balcão
  // apareceria vazia sem erro nenhum na tela.
  const storeNames = Array.from(
    new Set(
      (usersRes.data ?? [])
        .filter((u) => u.role === 'moderator' && u.store_name)
        .map((u) => u.store_name as string)
    )
  ).sort()
```

E passar para o componente:

```tsx
      <ConfigTabs
        users={usersRes.data || []}
        currentUserId={user.id}
        settings={settings}
        sellers={sellersRes.data || []}
        storeNames={storeNames}
      />
```

- [ ] **Step 4: Verificar tipos, lint, build e tamanho dos arquivos**

```bash
npx tsc --noEmit && npx eslint components/admin/SellerManagement.tsx components/admin/ConfigTabs.tsx "app/admin/(protected)/configuracoes/page.tsx" && npx next build
```

Esperado: os três limpos. Conferir também que nenhum arquivo passou de 500 linhas:

```bash
wc -l components/admin/SellerManagement.tsx components/admin/ConfigTabs.tsx "app/admin/(protected)/configuracoes/page.tsx"
```

- [ ] **Step 5: Commit**

```bash
git add components/admin/SellerManagement.tsx components/admin/ConfigTabs.tsx "app/admin/(protected)/configuracoes/page.tsx"
git commit -m "feat: aba de vendedores em configuracoes"
```

---

### Task 4: Cadastro dos vendedores — feito pelo César, não pelo código

**Files:** nenhum. Esta task é operação, não código.

**Decisão do César em 2026-08-06:** a entrega é a **estrutura vazia**. Ninguém pré-cadastra nome de vendedor por migração ou seed — ele mesmo cadastra pela aba Vendedores, justamente porque o quadro muda e ele precisa poder atualizar sem depender de código. Isso encerra a "pendência de conteúdo" que a spec deixou aberta: não era para o código resolver.

**Interfaces:**
- Consumes: a aba Vendedores da Task 3.
- Produces: nada no repositório. Para a Task 5 ser testada em runtime basta **um** vendedor ativo por loja — se o César ainda não cadastrou, criar um temporário e apagá-lo por SQL ao terminar o teste (a tabela não tem policy de DELETE, mas SQL direto via MCP passa por cima da RLS).

- [ ] **Step 1: Cadastrar pela aba Vendedores**

Logar como admin, ir em Configurações → Vendedores e criar um por um. O campo Loja é uma lista suspensa montada a partir dos logins existentes, então o valor sai certo por construção — é isso que fecha a armadilha do `store_name` sem depender de ninguém digitar certo.

Vale confirmar de passagem, mas **não bloqueia nada**: hoje só existem dois logins de loja (Campinas 1 e Campinas 2) e a FOX tem cinco. Se as outras três forem usar o sistema, faltam logins de lojista — outro plano.

- [ ] **Step 2: Conferir que cada loja tem vendedor ativo**

Via MCP `execute_sql`:

```sql
select store_name, count(*) filter (where active) as ativos
from public.sellers group by store_name order by store_name;
```

Esperado: uma linha por loja, `ativos > 0` em todas. Os valores de `store_name` têm que bater **exatamente** com os de `admin_profiles.store_name` — conferir com:

```sql
select distinct store_name from public.admin_profiles where role = 'moderator'
except
select distinct store_name from public.sellers;
```

Esperado: **zero linhas**. Qualquer linha aqui é uma loja cujo balcão vai abrir a lista vazia.

---

### Task 5: Vendedor obrigatório na validação

**Files:**
- Create: `components/admin/SellerSelect.tsx`
- Create: `components/admin/ExpressSuccess.tsx`
- Modify: `app/admin/(protected)/validar/ValidarClient.tsx`
- Modify: `app/admin/(protected)/validar/page.tsx`
- Modify: `app/api/coupons/validate/route.ts`
- Modify: `app/api/admin/coupon-express/route.ts`

**Interfaces:**
- Consumes: `Seller` de `./SellerManagement`; `requireRole` de `@/lib/supabase/server`; `insertCouponWithRetry(supabase, payload, select, attempts?)` de `@/lib/coupons/insert`, que devolve `{ ok: true; coupon } | { ok: false; reason: 'duplicate_cpf' | 'collision' | 'unknown'; message }`.
- Produces: `export function SellerSelect({ sellers, value, onChange, disabled, showStore }: { sellers: Seller[]; value: string; onChange: (id: string) => void; disabled?: boolean; showStore?: boolean })` e `export function ExpressSuccess({ coupon, onReset }: { coupon: CouponData; onReset: () => void })`.

**Por que `ExpressSuccess` é extraído:** `ValidarClient.tsx` está em 479 linhas e o teto do projeto é 500. Sem tirar o bloco de sucesso (~43 linhas) para fora, acrescentar o select estoura o limite. É a extração de menor risco: o bloco não compartilha estado com o resto, só recebe o cupom e o botão de voltar.

- [ ] **Step 1: Criar `components/admin/SellerSelect.tsx`**

```tsx
'use client'

import type { Seller } from './SellerManagement'

// O vendedor escolhe o próprio nome, sem senha e sem PIN — decisão do César
// por velocidade no balcão. É rastro, não prova: nada impede escolher o nome
// de um colega. Serve para revelar padrão.
export function SellerSelect({
  sellers,
  value,
  onChange,
  disabled,
  showStore,
}: {
  sellers: Seller[]
  value: string
  onChange: (id: string) => void
  disabled?: boolean
  showStore?: boolean
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-gray-300">Quem está atendendo? *</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || sellers.length === 0}
        required
        className="h-14 w-full rounded-xl border border-[#2a2a2a] bg-[#1e1e1e] px-4 text-white text-base focus:border-[#00ff87] focus:outline-none focus:ring-1 focus:ring-[#00ff87] disabled:opacity-50"
      >
        <option value="">Selecione o vendedor…</option>
        {sellers.map((s) => (
          <option key={s.id} value={s.id}>
            {showStore ? `${s.name} — ${s.store_name}` : s.name}
          </option>
        ))}
      </select>
      {sellers.length === 0 && (
        <p className="text-red-400 text-xs">
          Nenhum vendedor cadastrado para esta loja. Peça ao administrador para cadastrar
          em Configurações → Vendedores.
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Extrair `components/admin/ExpressSuccess.tsx`**

Mover o bloco `{successCoupon && ( … )}` de `ValidarClient.tsx` (hoje as linhas 434–475) para um componente próprio.

`CouponData` passa a ser exportado de `ValidarClient.tsx` e entra aqui como `import type` — importação só de tipo é apagada na compilação, então o ciclo `ValidarClient → ExpressSuccess → ValidarClient` não existe em runtime. O `formatDiscount`, ao contrário, é valor: importá-lo fecharia o ciclo de verdade. São quatro linhas — repetir aqui é mais barato que criar um módulo compartilhado só para isso.

```tsx
'use client'

import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'
import type { CouponData } from '@/app/admin/(protected)/validar/ValidarClient'

function formatDiscount(campaigns: { discount_type: string; discount_value: number }) {
  return campaigns.discount_type === 'fixed'
    ? formatCurrency(campaigns.discount_value)
    : `${campaigns.discount_value}%`
}

export function ExpressSuccess({ coupon, onReset }: { coupon: CouponData; onReset: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="bg-[#00ff87]/10 border border-[#00ff87]/40 rounded-xl p-6 text-center">
        <div className="text-[#00ff87] text-5xl font-black">✓</div>
        <div className="text-[#00ff87] font-bold text-xl mt-2">Cupom validado com sucesso!</div>
        <div className="text-white font-mono font-black text-3xl mt-3 tracking-widest">
          {coupon.coupon_number}
        </div>
        <div className="text-[#00ff87] font-black text-3xl mt-2">
          {formatDiscount(coupon.campaigns)}
        </div>
        <div className="text-gray-400 text-sm mt-1">de desconto aplicado</div>
      </div>

      <div className="bg-[#141414] border border-[#1e1e1e] rounded-xl p-5">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-xs text-gray-500">Cliente</div>
            <div className="text-white font-semibold">{coupon.customer_name}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Indicado por</div>
            <div className="text-white">@{coupon.influencers.instagram_handle}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500">CPF</div>
            <div className="text-gray-300 font-mono text-xs">
              {coupon.customer_cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Telefone</div>
            <div className="text-gray-300 text-xs">{coupon.customer_phone}</div>
          </div>
        </div>
      </div>

      <Button onClick={onReset} size="lg" className="w-full h-14 font-bold">
        Validar outro cupom
      </Button>
    </div>
  )
}
```

Em `ValidarClient.tsx`, trocar o bloco removido por:

```tsx
      {successCoupon && <ExpressSuccess coupon={successCoupon} onReset={resetAll} />}
```

E exportar o tipo, trocando `interface CouponData {` por `export interface CouponData {`.

- [ ] **Step 3: Carregar os vendedores em `app/admin/(protected)/validar/page.tsx`**

A lista é montada no servidor, filtrada pela loja de quem está logado. Não usar `/api/admin/sellers` aqui — a página já é server component e uma ida à API seria um salto a mais no balcão.

```tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ValidarClient } from './ValidarClient'

interface SearchParams {
  codigo?: string
  [key: string]: string | undefined
}

export default async function ValidarPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const initialCode = params.codigo?.toUpperCase() ?? ''

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/admin/login')

  const { data: profile } = await supabase
    .from('admin_profiles')
    .select('role, store_name')
    .eq('id', user.id)
    .single()

  // O admin não tem loja no perfil: vê todos os vendedores, com a loja ao lado do nome.
  let query = supabase
    .from('sellers')
    .select('id, name, store_name, active, created_at')
    .eq('active', true)
    .order('name')

  if (profile?.role !== 'admin') {
    query = query.eq('store_name', profile?.store_name ?? '')
  }

  const { data: sellers } = await query

  return (
    <ValidarClient
      initialCode={initialCode}
      sellers={sellers ?? []}
      showStore={profile?.role === 'admin'}
    />
  )
}
```

- [ ] **Step 4: Ligar o select nos dois fluxos de `ValidarClient.tsx`**

Acrescentar os imports:

```tsx
import { SellerSelect } from '@/components/admin/SellerSelect'
import { ExpressSuccess } from '@/components/admin/ExpressSuccess'
import type { Seller } from '@/components/admin/SellerManagement'
```

Trocar a assinatura do componente:

```tsx
export function ValidarClient({
  initialCode = '',
  sellers,
  showStore = false,
}: {
  initialCode?: string
  sellers: Seller[]
  showStore?: boolean
}) {
```

Acrescentar o estado, junto dos outros `useState`:

```tsx
  const [sellerId, setSellerId] = useState('')
```

Em `resetAll()`, acrescentar `setSellerId('')`.

No fluxo 1, dentro do bloco `{coupon.status === 'pending' && ( … )}`, colocar o select **antes** do botão e travar o botão sem vendedor:

```tsx
          {coupon.status === 'pending' && (
            <>
              <SellerSelect sellers={sellers} value={sellerId} onChange={setSellerId}
                disabled={validating} showStore={showStore} />
              <Button
                onClick={handleValidate}
                size="xl"
                loading={validating}
                disabled={!sellerId}
                className="w-full font-black text-black text-xl rounded-2xl disabled:opacity-40"
                style={{ minHeight: '72px' }}
              >
                {validating ? 'Validando...' : '✓ APLICAR DESCONTO'}
              </Button>
            </>
          )}
```

Em `handleValidate`, mandar o vendedor:

```tsx
  async function handleValidate() {
    if (!coupon || !sellerId) return
    setValidating(true)
    try {
      const res = await fetch('/api/coupons/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coupon_number: coupon.coupon_number, seller_id: sellerId }),
      })
```

No fluxo 2 (express), colocar o select no formulário logo acima do botão de cadastrar, e travar o botão:

```tsx
            <SellerSelect sellers={sellers} value={sellerId} onChange={setSellerId}
              disabled={saving} showStore={showStore} />

            {expressError && (
              <div className="bg-red-950 border border-red-800 rounded-xl p-3 text-red-400 text-sm text-center">
                {expressError}
              </div>
            )}

            <Button
              type="submit"
              size="xl"
              loading={saving}
              disabled={!sellerId}
              className="w-full font-black text-black text-lg rounded-2xl mt-1 disabled:opacity-40"
              style={{ minHeight: '72px' }}
            >
              {saving ? 'Cadastrando...' : '✓ CADASTRAR E VALIDAR CUPOM'}
            </Button>
```

Em `handleExpressSubmit`, acrescentar a guarda e o campo no corpo:

```tsx
    if (!influencer || !sellerId) return
```

```tsx
        body: JSON.stringify({
          influencer_id: influencer.id,
          campaign_id: influencer.campaign_id,
          customer_name: expressForm.name,
          customer_cpf: expressForm.cpf,
          customer_phone: expressForm.phone,
          customer_email: expressForm.email,
          seller_id: sellerId,
        }),
```

- [ ] **Step 5: Exigir e conferir o vendedor em `app/api/coupons/validate/route.ts`**

Duas mudanças no `POST`: o vendedor passa a ser obrigatório e conferido, e a rota **para de confiar no `admin_name` do corpo**. Hoje qualquer nome enviado na requisição vira o validador gravado — inclusive um inventado.

Trocar o início do `POST`:

```ts
import { requireRole, createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { coupon_number, seller_id } = body

    if (!coupon_number) {
      return NextResponse.json({ error: 'Código do cupom é obrigatório.' }, { status: 400 })
    }
    if (!seller_id) {
      return NextResponse.json({ error: 'Escolha o vendedor antes de validar.' }, { status: 400 })
    }

    const auth = await requireRole(['admin', 'moderator'])
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const supabase = await createClient()

    // Vendedor precisa existir, estar ativo e — se quem chama é lojista —
    // ser da loja dele. Sem esta checagem bastava chamar a API na mão com
    // qualquer id para furar o vínculo. O trigger no Postgres repete a regra.
    const { data: seller } = await supabase
      .from('sellers')
      .select('id, store_name, active')
      .eq('id', seller_id)
      .single()

    if (!seller?.active) {
      return NextResponse.json({ error: 'Vendedor inválido ou inativo.' }, { status: 400 })
    }

    if (auth.role === 'moderator') {
      const { data: profile } = await supabase
        .from('admin_profiles')
        .select('store_name')
        .eq('id', auth.userId)
        .single()

      if (!profile?.store_name || profile.store_name !== seller.store_name) {
        return NextResponse.json({ error: 'Vendedor não pertence à sua loja.' }, { status: 403 })
      }
    }
```

O bloco que buscava o perfil manualmente (`const { data: profile } = await supabase.from('admin_profiles').select('role, name')…` e o `if (!profile)`) sai — `requireRole` já faz isso e devolve `auth.name`.

E no update, gravar o vendedor e usar **sempre** o nome da sessão:

```ts
      .update({
        status: 'used',
        used_at: new Date().toISOString(),
        used_by_admin: auth.name,
        seller_id,
      })
```

O `GET` da mesma rota não muda.

- [ ] **Step 6: Exigir e conferir o vendedor em `app/api/admin/coupon-express/route.ts`**

Acrescentar `seller_id` ao destructuring e à checagem de campos obrigatórios:

```ts
    const { influencer_id, campaign_id, customer_name, customer_cpf, customer_phone, customer_email, seller_id } = body

    if (!influencer_id || !campaign_id || !customer_name || !customer_cpf || !customer_phone || !customer_email) {
      return NextResponse.json({ error: 'Todos os campos são obrigatórios.' }, { status: 400 })
    }
    if (!seller_id) {
      return NextResponse.json({ error: 'Escolha o vendedor antes de validar.' }, { status: 400 })
    }
```

Trocar a busca manual de perfil pelo `requireRole` e acrescentar a checagem do vendedor, logo depois do `createClient()`:

```ts
    const auth = await requireRole(['admin', 'moderator'])
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const supabase = await createClient()

    const { data: seller } = await supabase
      .from('sellers')
      .select('id, store_name, active')
      .eq('id', seller_id)
      .single()

    if (!seller?.active) {
      return NextResponse.json({ error: 'Vendedor inválido ou inativo.' }, { status: 400 })
    }

    if (auth.role === 'moderator') {
      const { data: profile } = await supabase
        .from('admin_profiles')
        .select('store_name')
        .eq('id', auth.userId)
        .single()

      if (!profile?.store_name || profile.store_name !== seller.store_name) {
        return NextResponse.json({ error: 'Vendedor não pertence à sua loja.' }, { status: 403 })
      }
    }
```

Atenção à ordem: o `import { requireRole, createClient } from '@/lib/supabase/server'` substitui o import atual de `createClient`, e o bloco antigo de `auth.getUser()` + `admin_profiles` sai inteiro.

No payload do `insertCouponWithRetry`, trocar `used_by_admin: profile.name` por `used_by_admin: auth.name` e acrescentar o vendedor:

```ts
      used_at: now.toISOString(),
      used_by_admin: auth.name,
      seller_id,
```

- [ ] **Step 7: Verificar tipos, lint, build e tamanho**

```bash
npx tsc --noEmit && npx eslint . && npx next build
wc -l "app/admin/(protected)/validar/ValidarClient.tsx" components/admin/SellerSelect.tsx components/admin/ExpressSuccess.tsx
```

Esperado: tudo limpo e `ValidarClient.tsx` **abaixo de 500 linhas**. Se passou, extrair também o card do influencer para outro componente antes de seguir.

- [ ] **Step 8: Smoke test — vendedor faltando e vendedor de outra loja**

Com `npm run dev` na porta 3114 e um cookie de sessão de **lojista da Campinas 1** (logar no navegador e copiar o cookie, ou usar `curl -b`):

```bash
# Sem vendedor → 400
curl -s -w " <- %{http_code}\n" -X POST http://localhost:3114/api/coupons/validate \
  -H 'Content-Type: application/json' -d '{"coupon_number":"FOX-XXXXXX"}'

# Vendedor de outra loja → 403 (usar um id real da Fox Cycles Campinas 2)
curl -s -w " <- %{http_code}\n" -X POST http://localhost:3114/api/coupons/validate \
  -b "$COOKIE" -H 'Content-Type: application/json' \
  -d '{"coupon_number":"FOX-XXXXXX","seller_id":"<id-da-outra-loja>"}'
```

Esperado: `400` com "Escolha o vendedor antes de validar." e `403` com "Vendedor não pertence à sua loja."

- [ ] **Step 9: Teste em runtime, no navegador**

Logar como lojista da Campinas 1 e conferir, nesta ordem:

1. Tela Validar mostra a lista com **só os vendedores da Campinas 1**.
2. Botão "APLICAR DESCONTO" fica **desabilitado** enquanto nenhum vendedor está escolhido.
3. Cadastro express com vendedor escolhido grava o cupom. Conferir no banco:

```sql
select c.coupon_number, c.used_by_admin, s.name as vendedor, s.store_name
from public.coupons c left join public.sellers s on s.id = c.seller_id
order by c.used_at desc nulls last limit 3;
```

Esperado: `used_by_admin` = o **login** ("Campinas 1") e `vendedor` = a **pessoa** escolhida. São dois fatos diferentes e é justamente o par que revela padrão — se vierem iguais, alguma das duas gravações está errada.

- [ ] **Step 10: Commit**

```bash
git add components/admin/SellerSelect.tsx components/admin/ExpressSuccess.tsx \
  "app/admin/(protected)/validar/ValidarClient.tsx" "app/admin/(protected)/validar/page.tsx" \
  app/api/coupons/validate/route.ts app/api/admin/coupon-express/route.ts
git commit -m "feat: vendedor obrigatorio na validacao e no cadastro express"
```

---

### Task 6: Escopo final dos papéis — Lojista só com Validar e Cupons

**Files:**
- Modify: `lib/auth/roles.ts`
- Modify: `proxy.ts`
- Modify: `components/admin/AdminNav.tsx`

**Interfaces:**
- Consumes: `MATRIX: Record<Action, Role[]>` e `can(role, action)` de `lib/auth/roles.ts`; `ALLOWED_BY_ROLE: Record<string, RouteRule[]>` de `proxy.ts`, onde `RouteRule = { path: string; exact?: boolean }` e a **primeira entrada da lista é o destino do redirect**.
- Produces: nenhuma interface nova — é a matriz da spec valendo nas três camadas.

Matriz final da spec:

| | Admin | Financeiro | Lojista |
|---|---|---|---|
| Dashboard | ✓ | ✓ | ✗ |
| Validar | ✓ | ✗ | ✓ |
| Cupons | ✓ tudo | ✓ NF, Pago, export | ✓ só lê |
| Influencers | ✓ | ✓ lê | ✗ |
| Campanhas | ✓ | ✗ | ✗ |
| Configurações | ✓ | ✗ | ✗ |

- [ ] **Step 1: Ajustar `lib/auth/roles.ts`**

A ação `coupons.read` continua com os três papéis. Nada a mudar em `influencers.edit` nem `campaigns.edit` — os dois já são só `admin`. A matriz de ações não muda nesta task; o que muda é **acesso de rota**, que vive no `proxy.ts` e no `AdminNav`. Confirmar lendo o arquivo e seguir sem alteração se já estiver assim.

- [ ] **Step 2: Tirar Influencers e Campanhas do lojista em `proxy.ts`**

```ts
const ALLOWED_BY_ROLE: Record<string, RouteRule[]> = {
  admin: [{ path: '/admin' }],
  finance: [
    { path: '/admin/cupons' },
    { path: '/admin', exact: true },
    { path: '/admin/influencers' },
  ],
  moderator: [
    { path: '/admin/validar' },
    { path: '/admin/cupons' },
  ],
}
```

O lojista que digitar `/admin/influencers` na barra cai em `/admin/validar`, que é a primeira entrada da lista dele.

- [ ] **Step 3: Tirar do menu em `components/admin/AdminNav.tsx`**

```tsx
const ALL_NAV = [
  { href: '/admin',               label: 'Dashboard',     exact: true,  roles: ['admin', 'finance'] },
  { href: '/admin/validar',       label: 'Validar',       exact: false, roles: ['admin', 'moderator'] },
  { href: '/admin/cupons',        label: 'Cupons',        exact: false, roles: ['admin', 'finance', 'moderator'] },
  { href: '/admin/influencers',   label: 'Influencers',   exact: false, roles: ['admin', 'finance'] },
  { href: '/admin/campanhas',     label: 'Campanhas',     exact: false, roles: ['admin'] },
  { href: '/admin/configuracoes', label: 'Configurações', exact: false, roles: ['admin'] },
]
```

- [ ] **Step 4: Verificar**

```bash
npx tsc --noEmit && npx eslint lib/auth/roles.ts proxy.ts components/admin/AdminNav.tsx && npx next build
```

- [ ] **Step 5: Teste em runtime dos três papéis**

Logar com cada um e conferir o menu e o redirect:

| Papel | Menu esperado | `/admin/campanhas` deve levar a |
|---|---|---|
| `admin` | Dashboard, Validar, Cupons, Influencers, Campanhas, Configurações | a própria página |
| `finance` | Dashboard, Cupons, Influencers | `/admin/cupons` |
| `moderator` | Validar, Cupons | `/admin/validar` |

- [ ] **Step 6: Commit**

```bash
git add lib/auth/roles.ts proxy.ts components/admin/AdminNav.tsx
git commit -m "feat: lojista so acessa validar e cupons"
```

---

## Critérios de aceite da entrega

- [ ] `npx tsc --noEmit` limpo
- [ ] `npx eslint .` limpo
- [ ] `npx next build` passa
- [ ] Nenhum arquivo acima de 500 linhas
- [ ] Toda loja com login de lojista tem pelo menos um vendedor ativo, com `store_name` idêntico ao do login
- [ ] Validar sem vendedor é barrado na tela (botão travado), na API (400) e no banco (trigger)
- [ ] Vendedor de outra loja é barrado na API (403) e no banco (trigger)
- [ ] `used_by_admin` e o nome do vendedor aparecem como fatos **diferentes** no cupom gravado
- [ ] `/api/coupons/validate` não aceita mais nome de validador vindo do corpo da requisição
- [ ] Lojista logado não vê Influencers nem Campanhas, no menu nem digitando a URL

## O que fica de fora desta entrega

- **Task 6 do plano de 2026-08-05** — a tela unificada de Cupons, que é onde a coluna Vendedor vai aparecer para o Financeiro junto de NF, Conferido e Pago. É o próximo plano, e a ordem foi combinada assim de propósito: a tela nova nasce já com a coluna em vez de ser mexida duas vezes.
- **Task 5 do plano de 2026-08-05** — criar/editar o usuário Financeiro pela tela. Continua pendente. Ao encostar em `UserManagement.tsx`, notar que ele tem um `ROLE_LABELS` local que ainda diz "Moderador (Loja)" e não conhece `finance`; a fonte única já existe em `lib/auth/roles.ts`.
- PIN ou login individual por vendedor.
- Tela de relatório separada — o export XLS da tela de Cupons resolve.
- O fluxo do QR code anti-abuso (spec de 2026-07-28), que segue não implementado.
- Cálculo automático de comissão.
