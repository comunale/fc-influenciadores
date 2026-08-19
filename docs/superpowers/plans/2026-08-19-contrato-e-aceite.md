# Contrato e Aceite — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trazer o contrato para dentro do sistema — gerado a partir dos dados da parceria, aceito pelo influenciador no portal dele, e com o link ligando só depois do aceite.

**Architecture:** Um modelo de texto com campos, versionado. Cada parceria nova gera um contrato; o influenciador preenche o que falta, lê e aceita; o texto final é **congelado** no aceite, junto com data e IP. Toda escrita do influenciador passa por função `security definer` — ele nunca ganha política de INSERT ou UPDATE em tabela alguma.

**Tech Stack:** Next.js 16.2.6 (App Router, `proxy.ts`), React 19, Supabase (Postgres + RLS), Tailwind v4, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-19-contrato-e-aceite-design.md`

## Global Constraints

- **A trava do link vale só para parceria criada de agora em diante.** As de @caiiuxo e @mariananavi ficam isentas: os links já estão em bio e story.
- **O texto congela no aceite.** Editar o modelo depois nunca altera contrato já aceito.
- **Nada de IA gerando ou revisando o texto.** Preenchimento de campos, determinístico.
- **O influenciador nunca recebe política de INSERT/UPDATE em tabela.** Escrita só por função que descobre o dono pela sessão.
- **O aceite grava situação, data e IP — nada mais.** Não existe caminho que aceite corpo de texto vindo dele. Um influenciador que edite o próprio contrato depois de gerado destrói a prova.
- **Não há envio de e-mail.** O contrato vive no portal.
- **A migração sobe junto com o código.**
- Teste de banco em transação com `rollback`; regra de negócio em função pura.
- Na interface, `moderator` se chama **Lojista**.

---

### Task 1: Banco — tabelas, isenção e as funções de escrita

**Files:**
- Create: `db/migrations/022_contrato_e_aceite.sql`

**Interfaces:**
- Produces: `contract_templates`, `contracts`, `influencer_contract_data`, `partnerships.contract_required`; funções `portal_meu_contrato()`, `portal_salvar_meus_dados()`, `portal_aceitar_contrato()`.

- [ ] **Step 1: Escrever a migration**

```sql
-- Modelo versionado. Nunca editado no lugar: cada mudanca nasce uma versao.
create table if not exists public.contract_templates (
  id uuid primary key default gen_random_uuid(),
  versao int not null,
  titulo text not null,
  corpo text not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid
);
create unique index if not exists contract_templates_versao on public.contract_templates (versao);

-- Dados de qualificacao. Fora de `influencers`, que o Lojista le -- ele nao tem
-- por que ver o endereco de ninguem.
create table if not exists public.influencer_contract_data (
  influencer_id uuid primary key references public.influencers(id) on delete cascade,
  cpf text,
  estado_civil text,
  endereco text,
  cep text,
  updated_at timestamptz not null default now()
);

create table if not exists public.contracts (
  id uuid primary key default gen_random_uuid(),
  partnership_id uuid not null references public.partnerships(id) on delete cascade,
  template_id uuid references public.contract_templates(id),
  template_versao int,
  -- O texto final, com os campos ja preenchidos. Guardado INTEIRO de proposito:
  -- e o que permite responder "o que exatamente ele aceitou".
  corpo text not null,
  status text not null default 'rascunho'
    check (status in ('rascunho','aguardando','aceito','descumprido','cancelado')),
  imagem_meses int not null default 6,
  accepted_at timestamptz,
  accepted_ip text,
  accepted_user_agent text,
  created_at timestamptz not null default now()
);
create unique index if not exists contracts_parceria_unico on public.contracts (partnership_id);

alter table public.partnerships
  add column if not exists contract_required boolean not null default true;

-- Isencao das duas parcerias vigentes: os links ja estao em bio e story.
update public.partnerships p set contract_required = false
  from public.influencers i
 where i.id = p.influencer_id
   and i.instagram_handle in ('@caiiuxo','@mariananavi')
   and p.status = 'ativa';

alter table public.contracts enable row level security;
alter table public.contract_templates enable row level security;
alter table public.influencer_contract_data enable row level security;

-- Interno: admin manda, Financeiro le (precisa saber se ha contrato antes de pagar).
create policy contracts_admin on public.contracts for all to authenticated using (is_admin());
create policy contracts_finance_read on public.contracts for select to authenticated using (is_finance());
create policy templates_admin on public.contract_templates for all to authenticated using (is_admin());
create policy dados_admin on public.influencer_contract_data for all to authenticated using (is_admin());

-- O influenciador NAO ganha politica nenhuma aqui. Tudo por funcao.
```

- [ ] **Step 2: As três funções do portal**

```sql
-- Le o contrato da parceria dele. Devolve o corpo ja pronto.
create or replace function public.portal_meu_contrato()
returns table (id uuid, corpo text, status text, accepted_at timestamptz,
               falta_dados boolean)
language sql stable security definer set search_path to 'public'
as $$
  select c.id, c.corpo, c.status, c.accepted_at,
         (d.cpf is null or d.endereco is null or d.estado_civil is null) as falta_dados
    from public.contracts c
    join public.partnerships p on p.id = c.partnership_id
    left join public.influencer_contract_data d on d.influencer_id = p.influencer_id
   where p.influencer_id = public.meu_influencer_id();
$$;

-- Escreve SO os dados dele. O alvo vem da sessao, nao do pedido -- ele nao
-- consegue nomear a linha que quer alterar.
create or replace function public.portal_salvar_meus_dados(
  p_cpf text, p_estado_civil text, p_endereco text, p_cep text)
returns void language plpgsql security definer set search_path to 'public'
as $$
declare meu uuid := public.meu_influencer_id();
begin
  if meu is null then raise exception 'sem permissao'; end if;

  insert into public.influencer_contract_data (influencer_id, cpf, estado_civil, endereco, cep)
  values (meu, p_cpf, p_estado_civil, p_endereco, p_cep)
  on conflict (influencer_id) do update
    set cpf = excluded.cpf, estado_civil = excluded.estado_civil,
        endereco = excluded.endereco, cep = excluded.cep, updated_at = now();
end $$;

-- O aceite. Muda situacao e grava a prova. NAO recebe corpo de texto.
create or replace function public.portal_aceitar_contrato(p_ip text, p_agent text)
returns void language plpgsql security definer set search_path to 'public'
as $$
declare meu uuid := public.meu_influencer_id();
begin
  if meu is null then raise exception 'sem permissao'; end if;

  update public.contracts c
     set status = 'aceito', accepted_at = now(),
         accepted_ip = p_ip, accepted_user_agent = p_agent
    from public.partnerships p
   where p.id = c.partnership_id
     and p.influencer_id = meu
     and c.status = 'aguardando';

  if not found then raise exception 'nao ha contrato aguardando aceite'; end if;
end $$;

revoke all on function public.portal_meu_contrato(),
  public.portal_salvar_meus_dados(text,text,text,text),
  public.portal_aceitar_contrato(text,text) from public;
grant execute on function public.portal_meu_contrato(),
  public.portal_salvar_meus_dados(text,text,text,text),
  public.portal_aceitar_contrato(text,text) to authenticated;
```

- [ ] **Step 3: Provar em transação com rollback**

Com sessão de influenciador simulada, confirmar: `select * from contracts` devolve 0 linhas (sem política para ele); `portal_meu_contrato()` devolve o dele; `update contracts set corpo=...` é negado; `portal_aceitar_contrato` só muda `status`, `accepted_at`, `accepted_ip` e `accepted_user_agent` — comparar a linha antes e depois campo a campo. `rollback` ao fim.

- [ ] **Step 4: Aplicar e commitar**

---

### Task 2: Módulo puro — preencher o modelo

**Files:**
- Create: `lib/contracts/preencher.ts`, `lib/contracts/extenso.ts`
- Test: `tests/contracts.test.ts`

**Interfaces:**
- Produces: `preencher(modelo: string, dados: DadosDoContrato): { corpo: string, faltando: string[] }`; `porExtenso(valor: number): string`.

- [ ] **Step 1: Testes que falham**

```ts
describe('porExtenso', () => {
  it('escreve o valor como se escreve em contrato', () => {
    expect(porExtenso(500)).toBe('quinhentos reais')
    expect(porExtenso(3000)).toBe('três mil reais')
    expect(porExtenso(1)).toBe('um real')
    expect(porExtenso(0)).toBe('zero reais')
  })
})

describe('preencher', () => {
  it('troca cada campo pelo valor', () => {
    const r = preencher('Nome: {{influenciador.nome}}', { influenciador: { nome: 'Caio' } })
    expect(r.corpo).toBe('Nome: Caio')
    expect(r.faltando).toEqual([])
  })

  it('LISTA o que faltou em vez de deixar buraco no texto', () => {
    // Contrato com {{cpf}} sobrando no meio e um humano assinando embaixo e o
    // pior desfecho possivel -- pior que nao gerar.
    const r = preencher('CPF: {{influenciador.cpf}}', { influenciador: {} })
    expect(r.faltando).toEqual(['influenciador.cpf'])
  })

  it('nao deixa marcacao nenhuma sobrar quando tudo esta preenchido', () => {
    const r = preencher(MODELO_COMPLETO, DADOS_COMPLETOS)
    expect(r.corpo).not.toMatch(/\{\{|\}\}/)
  })
})
```

- [ ] **Step 2–5:** rodar, implementar, rodar, commit.

---

### Task 3: O modelo inicial, com as correções

**Files:**
- Create: `db/migrations/023_modelo_inicial_do_contrato.sql`

O texto que o César escreveu, com as sete correções decididas em 19/08: validação em dois passos; cupom no lugar do print; item b) do fee; prazo como campo; "de 6 meses"; nova regra de descumprimento (encerra, paga comissão de venda feita, restitui fee); cláusula sobre dados de cliente pertencerem à FoxCycles.

- [ ] **Step 1: Escrever o modelo como versão 1**
- [ ] **Step 2: Conferir que `preencher` não deixa marcação sobrando** com dados de exemplo
- [ ] **Step 3: Aplicar e commitar**

---

### Task 4: O link passa a exigir contrato

**Files:**
- Modify: `lib/influencer-status.ts`, `app/c/[coupon_code]/page.tsx`
- Test: `tests/influencer-status.test.ts`

**Interfaces:**
- Consumes: `linkAtivo(inf, parceria)` de hoje.
- Produces: `linkAtivo(inf, parceria, contratoOk?)`; `motivoLinkInativo` ganha `'Contrato não aceito'`.

- [ ] **Step 1: Testes**

```ts
it('parceria isenta liga o link sem contrato', () => {
  expect(linkAtivo(inf, { ...p, contract_required: false }, false)).toBe(true)
})
it('parceria que exige contrato so liga com aceite', () => {
  expect(linkAtivo(inf, { ...p, contract_required: true }, false)).toBe(false)
  expect(linkAtivo(inf, { ...p, contract_required: true }, true)).toBe(true)
})
it('diz o motivo certo', () => {
  expect(motivoLinkInativo(inf, { ...p, contract_required: true }, false))
    .toBe('Contrato não aceito')
})
```

- [ ] **Step 2–4:** rodar, implementar, rodar.
- [ ] **Step 5: A página pública respeita** — `/c/CODIGO` não abre o formulário sem contrato aceito, e diz o motivo em linguagem de gente.
- [ ] **Step 6: Commit**

---

### Task 5: Admin — lista e página do contrato

**Files:**
- Create: `app/admin/(protected)/contratos/page.tsx`, `app/admin/(protected)/contratos/[id]/page.tsx`
- Create: `components/admin/contratos/ContratosList.tsx`, `ContratoView.tsx`
- Modify: `components/admin/AdminNav.tsx` (menu Contratos), `proxy.ts` (rota para admin e Financeiro)

A lista mostra influenciador, parceria, situação e data do aceite. A página mostra o texto, permite ajustar enquanto não aceito, e traz o botão de registrar descumprimento.

- [ ] **Step 1–4:** implementar, conferir que Financeiro lê e não edita, commit.

---

### Task 6: Admin — editor do modelo

**Files:**
- Create: `app/admin/(protected)/contratos/modelo/page.tsx`, `components/admin/contratos/ModeloEditor.tsx`
- Create: `app/api/admin/contract-template/route.ts`

Editor com a lista de campos ao lado e prévia preenchida com dados de exemplo. Salvar cria uma versão nova; as antigas continuam existindo.

- [ ] **Step 1–4:** implementar, conferir que contrato aceito não muda ao salvar modelo novo, commit.

---

### Task 7: Portal — preencher, ler e aceitar

**Files:**
- Create: `app/portal/(dentro)/contrato/page.tsx`, `components/portal/ContratoAceite.tsx`, `components/portal/MeusDados.tsx`
- Create: `app/api/portal/aceitar/route.ts` (captura o IP no servidor)
- Modify: `components/portal/PortalNav.tsx` (aba Contrato), `app/portal/(dentro)/page.tsx` (aviso quando pendente)

O IP é lido no servidor, do cabeçalho da requisição — nunca enviado pelo navegador, que é campo que o próprio interessado poderia forjar.

Contrato pendente abre o portal nele: sem aceite não há link, e mostrar o Resumo vazio sem explicar seria pior.

Depois de aceito, continua consultável, com a data do aceite visível.

- [ ] **Step 1–5:** implementar, testar o fluxo inteiro com uma parceria de teste, commit.

---

### Task 8: Registrar descumprimento

**Files:**
- Create: `app/api/admin/contract-breach/route.ts`
- Modify: `components/admin/contratos/ContratoView.tsx`

**O sistema não detecta post apagado.** Quem percebe, registra. A partir daí: encerra a parceria, desliga o link, congela a comissão devida até a data e abre a pendência de restituição do fee.

A comissão de venda já confirmada **continua devida** — a moto foi vendida. Só o fee volta.

- [ ] **Step 1–5:** implementar, testar a cascata, commit.

---

## Self-Review

**Cobertura da spec:** aceite trava o link (1, 4) · isenção das duas atuais (1) · sem IA (2, 3) · dados preenchidos pelos dois lados (1, 5, 7) · congelamento no aceite (1, 6) · escrita isolada por função (1, 7) · menu próprio (5, 6) · aba no portal (7) · descumprimento (8) · correções do texto (3).

**Ordem:** a Task 4 (trava) vem depois da 1, 2 e 3, porque travar o link antes de existir contrato para aceitar deixaria todo mundo sem link. Mesma lição da migração que derrubou o balcão por 12 dias.

**Tipos:** `DadosDoContrato` nasce na Task 2 e é consumido na 3, 5, 6 e 7. `linkAtivo` muda de assinatura na Task 4 — todos os chamadores de hoje (`InfluencersList`, página pública, filtros) precisam passar o novo argumento, e o TypeScript aponta cada um.
