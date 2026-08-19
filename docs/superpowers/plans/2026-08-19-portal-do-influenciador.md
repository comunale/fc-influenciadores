# Portal do Influenciador — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao influenciador uma área própria onde ele acompanha o que o link dele produziu — cupons gerados, vendas aprovadas e comissão — sem alcançar nada do sistema interno.

**Architecture:** Um papel novo (`influencer`) ligado ao registro do influenciador por `admin_profiles.influencer_id`. A regra "ele só vê o que é dele" vale em três camadas: a consulta do servidor, o `proxy.ts` e a RLS. **Antes de existir qualquer usuário com o papel novo, as políticas atuais são apertadas** — hoje elas dizem `authenticated using (true)`, o que entregaria o sistema inteiro ao primeiro usuário externo.

**Tech Stack:** Next.js 16.2.6 (App Router, `proxy.ts`), React 19, Supabase (Postgres + RLS), Tailwind v4, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-18-portal-do-influenciador-design.md`

## Global Constraints

- **O influenciador vê o primeiro nome do cliente e nada mais.** Nunca sobrenome, CPF, telefone ou e-mail. O corte é feito no servidor: o nome completo não pode entrar na resposta que chega ao navegador.
- **Dado bancário não aparece no portal**, nem para ler. `influencer_payment_info` fica fora de toda consulta do portal.
- **O portal é somente leitura.** Nenhuma rota de escrita, nenhuma política de INSERT/UPDATE/DELETE para o papel novo.
- **Só conta como venda o que o Financeiro aprovou** (`verified = true`). É a regra que já vive em `VENDA_CONTA_QUANDO`, em `lib/commission.ts`.
- **A migration sobe junto com o código**, nunca antes. Foi assim que o balcão ficou 12 dias fora do ar em agosto.
- Nunca alterar dado real solto para testar. Teste de banco roda em transação com rollback; regra de negócio se testa na função pura.
- Na interface, `moderator` se chama **Lojista**. Nunca "moderador".

---

### Task 1: Apertar as políticas atuais antes de existir usuário externo

Hoje toda política diz `to authenticated using (true)`. Isso era seguro porque só existiam papéis internos. O papel novo herdaria: ler todo cupom com CPF, criar cupom em nome de qualquer um, **validar cupom** (aprovar a própria venda) e ler todo perfil interno.

Esta task não constrói nada do portal. Ela fecha a porta por onde o portal entraria.

**Files:**
- Create: `db/migrations/014_portal_influenciador.sql`
- Test: `tests/db/portal-rls.test.ts`

**Interfaces:**
- Produces: função `eh_interno()` → `boolean`; função `meu_influencer_id()` → `uuid`; coluna `admin_profiles.influencer_id`; coluna `partnerships.portal_visible`.

- [ ] **Step 1: Escrever a migration**

```sql
-- Quem é da casa: admin, Financeiro ou Lojista. Security definer para não
-- recursar na própria política de admin_profiles.
create or replace function public.eh_interno()
returns boolean language sql stable security definer set search_path to 'public'
as $$
  select exists (
    select 1 from public.admin_profiles
    where id = auth.uid() and role in ('admin','finance','moderator') and active = true
  );
$$;

-- O influenciador dono da sessão atual. Null para usuário interno.
create or replace function public.meu_influencer_id()
returns uuid language sql stable security definer set search_path to 'public'
as $$
  select influencer_id from public.admin_profiles
  where id = auth.uid() and role = 'influencer' and active = true;
$$;

alter table public.admin_profiles
  add column if not exists influencer_id uuid references public.influencers(id) on delete cascade;

-- Um influenciador tem no máximo um acesso.
create unique index if not exists admin_profiles_influencer_unico
  on public.admin_profiles (influencer_id) where influencer_id is not null;

-- O papel e o vínculo andam juntos: papel influencer exige vínculo, e quem
-- não é influencer não tem vínculo nenhum.
alter table public.admin_profiles drop constraint if exists admin_profiles_vinculo_coerente;
alter table public.admin_profiles add constraint admin_profiles_vinculo_coerente check (
  (role = 'influencer' and influencer_id is not null)
  or (role <> 'influencer' and influencer_id is null)
);

-- Parceria visível no portal. Nasce true; as antigas ficam false porque os
-- valores vieram de planilha e já foram acertados por fora.
alter table public.partnerships
  add column if not exists portal_visible boolean not null default true;
update public.partnerships set portal_visible = false where created_at < now();

-- ---- aperto das políticas existentes ----

drop policy if exists coupons_select_authenticated on public.coupons;
create policy coupons_select_interno on public.coupons
  for select to authenticated using (eh_interno());

drop policy if exists coupons_insert_authenticated on public.coupons;
create policy coupons_insert_interno on public.coupons
  for insert to authenticated with check (eh_interno());

drop policy if exists coupons_update_admin_or_validation on public.coupons;
create policy coupons_update_interno on public.coupons
  for update to authenticated
  using (is_admin() or is_finance() or (eh_interno() and status = 'pending'));

drop policy if exists influencers_select_authenticated on public.influencers;
create policy influencers_select_interno on public.influencers
  for select to authenticated using (eh_interno());

drop policy if exists partnerships_select_authenticated on public.partnerships;
create policy partnerships_select_interno on public.partnerships
  for select to authenticated using (eh_interno());

-- Todo mundo lê o próprio perfil; o resto da lista é dos internos.
drop policy if exists authenticated_read_profiles on public.admin_profiles;
create policy profiles_select on public.admin_profiles
  for select to authenticated using (eh_interno() or id = auth.uid());

-- ---- o que o influenciador enxerga ----

create policy coupons_select_influencer on public.coupons
  for select to authenticated
  using (influencer_id = meu_influencer_id());

create policy partnerships_select_influencer on public.partnerships
  for select to authenticated
  using (influencer_id = meu_influencer_id() and portal_visible = true);

create policy influencers_select_proprio on public.influencers
  for select to authenticated
  using (id = meu_influencer_id());
```

- [ ] **Step 2: Conferir que nenhum papel interno perdeu acesso**

Rodar, com a sessão de cada papel simulada, e confirmar que os números batem com os de hoje. Em transação com `rollback` — nunca soltar `set role` sem transação.

- [ ] **Step 3: Aplicar a migration**

- [ ] **Step 4: Provar o aperto**

Criar um perfil `influencer` de teste em transação, assumir a identidade dele e confirmar: 0 cupons de outros influenciadores, 0 perfis internos, insert negado, update negado. `rollback` ao fim.

- [ ] **Step 5: Commit**

```bash
git add db/migrations/014_portal_influenciador.sql tests/db/portal-rls.test.ts
git commit -m "feat(seguranca): politicas exigem papel interno antes do portal existir"
```

---

### Task 2: Módulo puro do portal

**Files:**
- Create: `lib/portal.ts`
- Test: `tests/portal.test.ts`

**Interfaces:**
- Consumes: `calcularComissao`, `ContratoInfluencer`, `VendaParaComissao` de `lib/commission.ts`; `Parceria` de `lib/partnership.ts`.
- Produces:
  - `primeiroNome(nome: string | null): string`
  - `type VendaNoPortal = { id, primeiro_nome, data, aprovada }`
  - `type ParceriaNoPortal = { id, periodo, visivel, resumo: ResumoComissao | null, vendas: VendaNoPortal[] }`
  - `montarPortal(parcerias: Parceria[], cupons: CupomDoPortal[]): ParceriaNoPortal[]`

- [ ] **Step 1: Escrever os testes que falham**

```ts
describe('primeiroNome', () => {
  it('devolve so o primeiro termo', () => {
    expect(primeiroNome('Marcos Ribeiro Silva')).toBe('Marcos')
  })
  it('aguenta nome vazio ou nulo', () => {
    expect(primeiroNome(null)).toBe('Cliente')
    expect(primeiroNome('   ')).toBe('Cliente')
  })
  it('nao vaza sobrenome em nome composto', () => {
    expect(primeiroNome('Ana Paula Souza')).toBe('Ana')
  })
})

describe('montarPortal', () => {
  it('parceria invisivel vira linha fechada, sem vendas nem valores', () => {
    const r = montarPortal([parceriaAntiga], cupons)
    expect(r[0].visivel).toBe(false)
    expect(r[0].vendas).toEqual([])
    expect(r[0].resumo).toBeNull()
  })
  it('parceria visivel traz resumo e vendas', () => { /* ... */ })
  it('venda nao conferida aparece como pendente, sem valor', () => { /* ... */ })
})
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run tests/portal.test.ts`
- [ ] **Step 3: Implementar `lib/portal.ts`**
- [ ] **Step 4: Rodar e ver passar**
- [ ] **Step 5: Commit**

---

### Task 3: O papel `influencer` na matriz

**Files:**
- Modify: `lib/auth/roles.ts`
- Test: `tests/roles.test.ts`

**Interfaces:**
- Produces: `Role` passa a incluir `'influencer'`; `ROLES` continua **só com os internos**.

Detalhe que importa: `ROLES` alimenta o seletor de papel em Configurações e o `isRole()` que valida `/api/admin/create-user`. Mantendo `influencer` fora dele, ninguém cria acesso de portal por engano pela tela de usuários — só pela rota dedicada da Task 8, que exige o vínculo. E como o papel não entra em nenhuma linha do `MATRIX`, `can()` responde `false` para tudo por padrão.

- [ ] **Step 1: Testes**

```ts
it('influencer nao pode nada na matriz interna', () => {
  expect(can('influencer', 'coupons.read')).toBe(false)
  expect(can('influencer', 'validate')).toBe(false)
  expect(can('influencer', 'influencers.payment')).toBe(false)
})
it('influencer nao entra no seletor de usuarios internos', () => {
  expect(ROLES).toEqual(['admin', 'finance', 'moderator'])
  expect(isRole('influencer')).toBe(false)
})
it('tem rotulo de tela', () => {
  expect(ROLE_LABELS.influencer).toBe('Influenciador')
})
```

- [ ] **Step 2–5:** rodar, implementar, rodar, commit.

---

### Task 4: Roteamento — `proxy.ts`

**Files:**
- Modify: `proxy.ts`

- [ ] **Step 1: Adicionar `/portal` ao matcher e as duas travas**

O influenciador só existe dentro de `/portal`; os internos não têm o que fazer lá. Quem não está logado em `/portal` vai para `/portal/login`, não para o login do admin.

- [ ] **Step 2: Conferir na mão** — internos continuam entrando no admin; influenciador em `/admin/cupons` é redirecionado para `/portal`.
- [ ] **Step 3: Commit**

---

### Task 5: Entrada do portal — login e layout

**Files:**
- Create: `app/portal/login/page.tsx`, `app/portal/layout.tsx`
- Create: `lib/portal/sessao.ts` (`getInfluencerDaSessao()`)

Layout próprio, fora do grupo `(protected)` do admin: sem menu interno, sem link para o admin.

- [ ] **Step 1–3:** implementar, conferir que o login manda para `/portal`, commit.

---

### Task 6: Resumo — `/portal`

**Files:**
- Create: `app/portal/page.tsx`, `components/portal/ResumoParceria.tsx`

Mostra a parceria vigente, os números dela e o link do influenciador. Parceria encerrada e invisível aparece como *"Parceria X · encerrada · sem detalhes"*.

**A consulta seleciona `customer_name` e devolve `primeiroNome(...)`.** Não seleciona `customer_cpf`, `customer_phone` nem `customer_email` em momento nenhum.

- [ ] **Step 1–4:** implementar, conferir que o HTML da resposta não contém sobrenome nem CPF, commit.

---

### Task 7: Vendas — `/portal/vendas`

**Files:**
- Create: `app/portal/vendas/page.tsx`, `components/portal/ListaVendas.tsx`

Lista por parceria: primeiro nome, data, situação (pendente / aprovada). Sem valores por venda quando a parceria é invisível.

- [ ] **Step 1–4:** implementar, conferir, commit.

---

### Task 8: Criar acesso ao portal, pela tela de Influencers

**Files:**
- Create: `app/api/admin/portal-access/route.ts`
- Modify: `components/admin/InfluencersTable.tsx` (botão "Criar acesso ao portal")

Só admin. Recebe `influencer_id`, e-mail e senha inicial (mínimo 8 caracteres). Cria o usuário e o perfil com `role = 'influencer'` e o vínculo preenchido — os dois na mesma operação, porque o check constraint da Task 1 recusa um sem o outro. Se o perfil falhar, o usuário de auth é apagado, como já faz `/api/admin/create-user`.

Sem autocadastro e sem convite por e-mail — envio de e-mail foi descartado no projeto.

- [ ] **Step 1–5:** testes da rota, implementar, conferir na tela, commit.

---

## Self-Review

**Cobertura da spec:** acesso por e-mail e senha (5, 8) · papel novo (1, 3) · bloqueio cruzado de rotas (4) · primeiro nome e nada mais (2, 6, 7) · parceria antiga como linha fechada (1, 2, 6) · comissão só do que foi aprovado (2) · somente leitura (1, 3) · três camadas (1, 4, 6) · sem dado bancário (constraint global; nenhuma task consulta a tabela).

**Ordem:** a Task 1 vem primeiro de propósito. Qualquer outra ordem cria uma janela em que existe usuário externo com política larga.

**Tipos:** `ResumoComissao`, `ContratoInfluencer` e `Parceria` são reaproveitados como já estão; `montarPortal` é o único tipo novo que atravessa tasks, definido na 2 e consumido na 6 e 7.
