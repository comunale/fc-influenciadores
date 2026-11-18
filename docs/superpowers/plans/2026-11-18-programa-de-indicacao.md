# Programa de Indicação — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** qualquer pessoa se cadastra, sai com link e cupom, divulga, e a FOX
exporta quem tem quanto a receber — sem pagar nada por dentro do sistema.

**Architecture:** o cupom da indicação é um `coupons` como qualquer outro, com
`indicador_id` no lugar de `influencer_id` — assim o balcão, a conferência de NF,
a impressão e a página `/cupom/[numero]` já servem ao programa sem duplicação. O
indicador é tabela própria (`indicadores`), com conta de verdade no Supabase Auth
sob um e-mail sintético derivado do CPF, papel `indicador` em `admin_profiles`, e
área separada em `/indicador`. O prêmio nunca é escrito pelo sistema: a tela do
admin exporta.

**Tech Stack:** Next.js 16 (App Router), React 19, Tailwind v4, TypeScript,
Vitest, Supabase (Postgres + RLS + Auth), `xlsx` (já dependência).

**Spec:** `docs/superpowers/specs/2026-11-17-programa-de-indicacao-design.md`

## Global Constraints

- Valores do programa: desconto do comprador **R$ 300**, prêmio do indicador **R$ 200**.
- O prêmio só conta **depois de `verified = true`** (NF conferida). Decisão do César, 18/11.
- Teto conta **usos** (`status = 'used'`); batido, o link **para de gerar cupom**. Nasce **desligado** (`teto_usos = null`).
- Cupom da indicação **não vence**: `expires_at` fica nulo.
- Idade mínima **18 anos**, calculada pela data de nascimento.
- CPF que já é de influenciador **com parceria ativa** é recusado no cadastro.
- O sistema **não paga**: nada escreve em `coupons.paid`, nada cria `settlements`.
- `moderator` na tela é sempre **"Lojista"**, nunca "Moderador". Não existe papel `gestor`.
- Rota pública nova passa por `checkRateLimit` com `COUPON_RULES`, como `/api/coupons`.
- Aceite: **termos do programa é obrigatório**; **comunicações/publicidade é opcional** — consentimento de marketing sob a LGPD tem de ser livre, então são dois campos, não um.
- Rota pública lê e grava por `createAdminClient()`; rota de usuário logado, por `await createClient()`.

## Review Focus

1. **CPF já cadastrado como indicador** → mensagem dizendo isso e o caminho (entrar), não 500. (Task 3)
2. **Comprador cujo CPF já tem cupom na campanha do programa** → 409 devolvendo o número do cupom que ele já tem. (Task 4)
3. **Indicador encerrado pela empresa** (`ativo = false`) → o link recusa com motivo, e a área dele abre explicando. (Task 4, Task 5)
4. **Teto batido** → o link recusa nomeando o teto; o painel dela mostra que chegou no limite. (Task 4, Task 5)
5. **Cupom sem influenciador nas telas antigas** (`/admin/cupons`, `/admin/validar`, `/cupom/[numero]`, dashboard, prévia do Financeiro) → aparece como "Indicação", não quebra nem entra em fechamento. (Task 6)

---

### Task 1: Migração 036 — banco do programa

**Files:**
- Create: `db/migrations/036_programa_de_indicacao.sql`
- Create: `scripts/verifica-036.sql`
- Modify: `lib/supabase/types.ts` (regerar)

**Interfaces:**
- Produces: tabelas `indicadores`, `indicador_cliques`; colunas `coupons.indicador_id`,
  `coupons.indicador_cpf`; `admin_profiles.indicador_id`; papel `'indicador'`;
  campanha `'Programa de Indicação'` (`discount_type='fixed'`, `discount_value=300`).

- [ ] **Step 1: Ler antes de escrever**

Ler `db/migrations/030_fecha_escalada_de_privilegio_no_perfil.sql` inteira. Ela guarda
`admin_profiles` por trigger e enumera papéis; se o novo papel `'indicador'` não passar
por ela, o cadastro nasce quebrado. O que ela exigir entra nesta migração.

- [ ] **Step 2: Escrever a migração**

Na ordem, em um arquivo:

```sql
create table public.indicadores (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cpf text not null unique,
  telefone text not null,
  sexo text not null check (sexo in ('F','M','outro')),
  data_nascimento date not null,
  codigo text not null unique,
  teto_usos integer check (teto_usos is null or teto_usos > 0),
  ativo boolean not null default true,
  encerrado_em timestamptz,
  encerrado_por text,
  aceite_termos boolean not null check (aceite_termos = true),
  aceite_comunicacoes boolean not null default false,
  aceite_at timestamptz not null default now(),
  aceite_ip text,
  created_at timestamptz not null default now(),
  constraint indicadores_encerramento_coerente
    check ((ativo and encerrado_em is null) or (not ativo and encerrado_em is not null))
);
```

`indicador_cliques`: `id bigserial`, `indicador_id uuid not null references indicadores(id) on delete cascade`,
`created_at timestamptz not null default now()`, `ip text`, `user_agent text`, índice
`(indicador_id, created_at desc)`.

Em `coupons`: adiciona `indicador_id uuid references indicadores(id)` e `indicador_cpf text`;
derruba o `not null` de `influencer_id`, `customer_email` e `expires_at`; índice parcial
`on coupons(indicador_id) where indicador_id is not null`; e três CHECKs —
`coupons_dono_unico` (exatamente um de `influencer_id`/`indicador_id`),
`coupons_indicacao_coerente` (`indicador_id` e `indicador_cpf` vivem juntos) e
`coupons_sem_autoindicacao` (`indicador_cpf is null or indicador_cpf <> customer_cpf`).

Em `admin_profiles`: adiciona `indicador_id uuid references indicadores(id)`, recria
`admin_profiles_role_check` com `'indicador'` na lista, e recria
`admin_profiles_vinculo_coerente` com três casos — `influencer` exige `influencer_id`,
`indicador` exige `indicador_id`, papel interno exige os dois nulos.

RLS: `indicadores` e `indicador_cliques` com RLS ligada; `select` para `is_admin()`,
`is_finance()` e para o dono (por `admin_profiles` onde `id = auth.uid()` e
`indicador_id` bate); `update` só para `is_admin()` e `is_finance()`; **nenhuma policy de
insert** — só service_role escreve. Nunca `using (true)`.

Campanha do programa: insert guardado por `where not exists (... where name = 'Programa de Indicação')`,
com `discount_type='fixed'`, `discount_value=300`, `active=true`. `validity_days` recebe
3650 e **não é lido** (decisão 11: o cupom não vence) — comentar isso na linha.

Termina com um `PARA DESFAZER` completo e uma `select` de verificação.

- [ ] **Step 3: Escrever `scripts/verifica-036.sql`**

Mesmo padrão de `scripts/verifica-035.sql`: tudo dentro de `begin … rollback`, cada caso
com fixtures próprias, checando SQLSTATE **e** o motivo nomeado, e um RESUMO no fim,
contado à mão, com a tabela de casos reimpressa depois dele. Casos obrigatórios:

| # | Caso | Esperado |
|---|---|---|
| 1 | cupom com `influencer_id` e `indicador_id` juntos | recusa `coupons_dono_unico` |
| 2 | cupom sem nenhum dos dois | recusa `coupons_dono_unico` |
| 3 | cupom de indicação com `indicador_cpf = customer_cpf` | recusa `coupons_sem_autoindicacao` |
| 4 | cupom de indicação com `indicador_cpf` nulo | recusa `coupons_indicacao_coerente` |
| 5 | cupom de indicação com `expires_at` e `customer_email` nulos | passa |
| 6 | cupom de influenciador como hoje | passa (nada regrediu) |
| 7 | `indicadores` com `aceite_termos = false` | recusa |
| 8 | `indicadores` com `ativo = false` e `encerrado_em` nulo | recusa |
| 9 | `teto_usos = 0` | recusa |
| 10 | dois `indicadores` com o mesmo CPF | recusa unique |
| 11 | `admin_profiles` role `'indicador'` sem `indicador_id` | recusa |
| 12 | `admin_profiles` role `'indicador'` com `influencer_id` também | recusa |
| 13 | `admin_profiles` role `'admin'` com `indicador_id` | recusa |
| 14 | dois cupons do mesmo CPF na campanha do programa | recusa unique existente |

- [ ] **Step 4: Rodar o verifica ANTES de aplicar**

O César roda `scripts/verifica-036.sql` na base, com a migração ainda **não** aplicada.
Esperado: os casos 1–4 e 7–13 saem **VERMELHO** e o RESUMO acusa a diferença. Um verifica
que já sai verde antes da migração não prova nada.

- [ ] **Step 5: Aplicar a migração e rodar o verifica de novo**

Esperado: 14 de 14 OK.

- [ ] **Step 5b: Fechar a divida da NF unica, se a base permitir**

Medir primeiro: `select invoice_number, count(*) from coupons where invoice_number is not null group by 1 having count(*) > 1`.
Zero linhas → criar `create unique index coupons_invoice_number_key on coupons(invoice_number) where invoice_number is not null`
na mesma migração. Uma linha ou mais → **não criar**, e relatar os números repetidos ao César:
o índice falharia e a migração inteira voltaria atrás. A spec chama isso de dívida aberta desde setembro.

- [ ] **Step 6: Regerar os tipos e commitar**

Regerar `lib/supabase/types.ts` do projeto `uufrrhqrafxybdhkhvln`. Conferir que
`coupons.Insert.influencer_id`, `customer_email` e `expires_at` ficaram opcionais e que
`indicadores` apareceu.

```bash
git add db/migrations/036_programa_de_indicacao.sql scripts/verifica-036.sql lib/supabase/types.ts
git commit -m "feat(indicacao): migracao 036 com indicadores, cliques e cupom sem influenciador"
```

---

### Task 2: As regras, em TypeScript puro

**Files:**
- Create: `lib/indicacao/regras.ts`
- Test: `tests/indicacao/regras.test.ts`

**Interfaces:**
- Produces:
  - `emailSinteticoDoCpf(cpf: string): string` → `${digitos}@indicador.foxcycles.com.br`
  - `maiorDeIdade(dataNascimento: string, hoje?: Date): boolean`
  - `gerarCodigoDeIndicacao(): string` → `generateCouponNumber('IND')`
  - `tetoAtingido(usos: number, teto: number | null): boolean`
  - `type CupomDoIndicador = { status: string; verified: boolean; commission_per_sale: number | null }`
  - `resumoDoIndicador(cupons: CupomDoIndicador[]): { cupons: number; usos: number; premiados: number; aReceber: number }`

- [ ] **Step 1: Escrever os testes que falham**

```ts
test('email sintetico usa so os digitos do CPF', () => {
  expect(emailSinteticoDoCpf('123.456.789-09')).toBe('12345678909@indicador.foxcycles.com.br')
})

test('faz 18 anos hoje: entra', () => {
  expect(maiorDeIdade('2008-11-18', new Date('2026-11-18T12:00:00Z'))).toBe(true)
})

test('faz 18 anos amanha: nao entra', () => {
  expect(maiorDeIdade('2008-11-19', new Date('2026-11-18T12:00:00Z'))).toBe(false)
})

test('teto nulo nunca atinge', () => {
  expect(tetoAtingido(999, null)).toBe(false)
})

test('teto atinge no igual, nao so no maior', () => {
  expect(tetoAtingido(10, 10)).toBe(true)
  expect(tetoAtingido(9, 10)).toBe(false)
})

test('resumo: usos conta used; a receber conta used E verified', () => {
  const r = resumoDoIndicador([
    { status: 'used', verified: true, commission_per_sale: 200 },
    { status: 'used', verified: false, commission_per_sale: 200 },
    { status: 'pending', verified: false, commission_per_sale: 200 },
  ])
  expect(r).toEqual({ cupons: 3, usos: 2, premiados: 1, aReceber: 200 })
})

test('a receber soma o valor gravado no cupom, nao um 200 fixo', () => {
  const r = resumoDoIndicador([{ status: 'used', verified: true, commission_per_sale: 150 }])
  expect(r.aReceber).toBe(150)
})
```

- [ ] **Step 2: Rodar e ver falhar** — `npm test -- tests/indicacao/regras.test.ts`. Esperado: FAIL, módulo não existe.
- [ ] **Step 3: Implementar `lib/indicacao/regras.ts`** com as assinaturas do bloco Interfaces. `maiorDeIdade` compara datas civis (ano, mês, dia), sem fuso: `new Date('2008-11-18')` em UTC contra um `hoje` local erra por um dia.
- [ ] **Step 4: Rodar e ver passar.**
- [ ] **Step 5: Commit** — `git commit -m "feat(indicacao): regras de idade, teto, email sintetico e resumo"`

---

### Task 3: Landing, cadastro e conta

**Files:**
- Create: `app/indique/page.tsx`
- Create: `components/indicacao/FormularioDeCadastro.tsx`
- Create: `app/api/indicacao/cadastro/route.ts`
- Test: `tests/indicacao/cadastro.test.ts`

**Interfaces:**
- Consumes: Task 2 inteira; `checkRateLimit`/`getClientIp`/`COUPON_RULES`; `validateCPF`; `validarCelular`; `createAdminClient`.
- Produces: `POST /api/indicacao/cadastro` recebe `{ nome, cpf, telefone, sexo, data_nascimento, senha, aceite_termos, aceite_comunicacoes }` e devolve `201 { codigo, link }` ou erro nomeado; e a função pura
  `validarCadastro(body: unknown): { ok: true; dados: DadosDeCadastro } | { ok: false; erro: string }`, exportada da própria rota para o teste.

- [ ] **Step 1: Escrever os testes de `validarCadastro`**

Um caso por recusa, cada um conferindo a mensagem: CPF inválido; menor de 18; telefone
quebrado (`119999999`); `aceite_termos` ausente ou `false`; senha com menos de 8
caracteres; sexo fora de `F|M|outro`. Mais um caso com corpo completo e válido devolvendo
`ok: true`, com CPF e telefone já **só com dígitos**.

- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar a rota**

Ordem, e ela importa: rate limit por IP → `validarCadastro` → CPF já em `indicadores`
(409, "Este CPF já está cadastrado. Entre com seu CPF e senha.") → CPF é de influenciador
com parceria ativa (409, dizendo que quem tem parceria já ganha comissão) → sorteia
`codigo` com retry em colisão de unique → `auth.admin.createUser` com
`emailSinteticoDoCpf(cpf)`, `email_confirm: true` e a senha → insere `indicadores` →
insere `admin_profiles` com `role: 'indicador'`, `indicador_id` e `name` → devolve
`{ codigo, link }`. Se qualquer passo depois do `createUser` falhar, apaga o usuário
criado antes de devolver o erro: conta órfã no Auth impede a pessoa de tentar de novo.

- [ ] **Step 4: Rodar os testes.**
- [ ] **Step 5: Escrever a landing**

`app/indique/page.tsx` — pública, sem login, na identidade visual do resto do sistema.
Explica: quem indica ganha **R$ 200** por venda conferida, quem compra ganha **R$ 300**
de desconto, qualquer pessoa pode participar, e a FOX paga o prêmio por fora. O
formulário é `FormularioDeCadastro` (client component) com nome, CPF, telefone, sexo,
data de nascimento, senha, aceite dos termos (obrigatório) e aceite de comunicações
(opcional, desmarcado). No sucesso, mostra o **código** e o **link** com botão de copiar,
e o caminho para a área dela. Rodapé com `marketing@foxcycles.com.br` para dúvidas e
senha esquecida.

- [ ] **Step 6: Commit** — `git commit -m "feat(indicacao): landing publica, cadastro e conta do indicador"`

---

### Task 4: O link, o clique e o cupom do comprador

**Files:**
- Create: `app/i/[codigo]/page.tsx`
- Create: `components/indicacao/FormularioDoComprador.tsx`
- Create: `app/api/indicacao/cupom/route.ts`
- Modify: `proxy.ts` (incluir `/i/:path*` no matcher)
- Test: `tests/indicacao/cupom.test.ts`

**Interfaces:**
- Consumes: Task 1 (colunas), Task 2 (`tetoAtingido`), `insertCouponWithRetry`.
- Produces: `POST /api/indicacao/cupom` recebe `{ codigo, customer_name, customer_cpf, customer_phone, accept_communications }` → `201 { coupon_number }`; e a função pura
  `podeGerar(i: { ativo: boolean; teto_usos: number | null }, usos: number): { ok: true } | { ok: false; erro: string }`, exportada para teste.

- [ ] **Step 1: Escrever os testes de `podeGerar`**

Ativo sem teto → ok. Ativo, teto 10, 9 usos → ok. Teto 10, 10 usos → recusa nomeando o
limite. Teto 10, 11 usos → recusa. `ativo: false` → recusa dizendo que o benefício foi
encerrado, **e essa recusa vem antes da do teto** (quem foi encerrado não deve ouvir
falar de limite).

- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar a rota**

Rate limit → corpo (nome, CPF válido, telefone por `validarCelular`; **sem e-mail**) →
busca o indicador por `codigo` (404) → conta `usos` (`coupons` com aquele `indicador_id`
e `status = 'used'`) → `podeGerar` (409) → recusa se `customer_cpf === indicador.cpf`
("Você não pode usar o seu próprio link", 400; o CHECK do banco é a rede, não a mensagem)
→ `insertCouponWithRetry` com `campaign_id` da campanha do programa, `indicador_id`,
`indicador_cpf`, `discount_type: 'fixed'`, `discount_value: 300`,
`commission_per_sale: 200`, `influencer_id: null`, `partnership_id: null`,
`customer_email: null`, `expires_at: null`, `status: 'pending'` → trata `duplicate_cpf`
com 409 devolvendo o `coupon_number` que aquele CPF já tem.

- [ ] **Step 4: Escrever a página do link**

`app/i/[codigo]/page.tsx` — server component. Busca o indicador; grava um
`indicador_cliques` por carregamento (IP e user-agent do request); se o código não
existe, ou está encerrado, ou bateu o teto, mostra a tela honesta em vez do formulário.
Senão mostra "Indicado por <primeiro nome>", a oferta de R$ 300, e
`FormularioDoComprador` com nome, CPF, telefone e o aceite opcional de comunicações. No
sucesso, manda para `/cupom/[numero]`, que já existe.

- [ ] **Step 5: Rodar `npm test` e `npm run build`.**
- [ ] **Step 6: Commit** — `git commit -m "feat(indicacao): link publico com clique, teto e cupom do comprador"`

---

### Task 5: Área do indicador e cartão de benefícios

**Files:**
- Create: `lib/indicacao/sessao.ts`
- Create: `app/indicador/login/page.tsx`
- Create: `app/indicador/(dentro)/layout.tsx`
- Create: `app/indicador/(dentro)/page.tsx`
- Create: `app/indicador/(dentro)/cartao/page.tsx`
- Modify: `proxy.ts`
- Test: `tests/indicacao/sessao.test.ts`

**Interfaces:**
- Consumes: Task 2 (`emailSinteticoDoCpf`, `resumoDoIndicador`).
- Produces: `getIndicadorDaSessao(): Promise<{ userId: string; indicadorId: string; nome: string; codigo: string; ativo: boolean; tetoUsos: number | null } | null>`,
  espelho de `lib/portal/sessao.ts` — por `createClient()` (sessão do usuário), nunca service role.

- [ ] **Step 1: Escrever o teste de `sessao`**

Com o client do Supabase mockado, como `tests/portal.test.ts` faz: perfil com
`role: 'influencer'` → `null`; perfil `role: 'indicador'` com `active: false` → `null`;
perfil `role: 'indicador'` ativo → devolve o objeto.

- [ ] **Step 2: Rodar e ver falhar. Step 3: Implementar. Step 4: Rodar e ver passar.**

- [ ] **Step 5: Login por CPF**

`app/indicador/login/page.tsx` — pede **CPF e senha**, converte o CPF em
`emailSinteticoDoCpf` e chama `signInWithPassword`. Erro genérico ("CPF ou senha
incorretos"), nunca dizendo qual dos dois errou. Abaixo, o recado de que senha esquecida
se resolve por `marketing@foxcycles.com.br`.

- [ ] **Step 6: Painel e cartão**

`/indicador` mostra, com `resumoDoIndicador`: cliques no link, cupons gerados, usos,
quantos já foram conferidos e **quanto tem a receber**, mais o link e o código com botão
de copiar. Se `ativo = false`, uma faixa dizendo que o benefício foi encerrado e que os
prêmios já conferidos continuam valendo. Se bateu o teto, uma faixa dizendo isso.
`/indicador/cartao` é o cartão de benefícios: nome, código, link e QR — reaproveitando o
`qrcode` e o padrão de impressão de `app/cupom/[coupon_number]/page.tsx`.

- [ ] **Step 7: Proxy**

Em `proxy.ts`: `/indicador/:path*` entra no matcher; `role === 'indicador'` tem casa em
`/indicador` e é barrado em `/admin` e `/portal`; papel interno que abre `/indicador`
volta para a casa dele; não autenticado em `/indicador/*` vai para `/indicador/login`
preservando `?next=`. O influenciador continua indo para `/portal`.

- [ ] **Step 8: Rodar `npm test` e `npm run build`.**
- [ ] **Step 9: Commit** — `git commit -m "feat(indicacao): area do indicador, login por CPF e cartao de beneficios"`

---

### Task 6: Cupom sem influenciador não quebra nada

**Files:**
- Modify: `app/admin/(protected)/cupons/page.tsx`
- Modify: `app/admin/(protected)/validar/ValidarClient.tsx`, `app/api/coupons/validate/route.ts`
- Modify: `app/cupom/[coupon_number]/page.tsx`
- Modify: `app/admin/(protected)/page.tsx` (dashboard)
- Modify: `lib/settlements/previa.ts` (se a auditoria mostrar que precisa)
- Test: `tests/indicacao/compatibilidade.test.ts`

**Interfaces:**
- Consumes: Task 1 (colunas), Task 4 (cupons de indicação existindo).

- [ ] **Step 1: Auditar antes de mexer**

`grep -rn "influencer_id\|influencers(" app lib components` dá os pontos. Ler cada um e
anotar, em uma lista, o que acontece com `influencer_id = null`: quebra, mostra vazio, ou
soma errado. A lista vai no corpo do commit.

- [ ] **Step 2: Escrever o teste que trava a prévia do Financeiro**

`previaDoFechamento` **não pode** incluir cupom de indicação: ele não tem
`partnership_id` nem `influencer_id`, e o prêmio dele não é comissão de parceria. Teste:
lista com um cupom de parceria e um de indicação → só o de parceria entra, e o valor é o
da parceria.

- [ ] **Step 3: Rodar. Se falhar, corrigir; se passar, dizer por quê**

Se passar de primeira, a prévia já filtra por parceria e o teste é a trava que impede a
regressão. Registrar isso em vez de forçar uma mudança.

- [ ] **Step 4: Corrigir as telas**

Onde havia o influenciador, cupom de indicação mostra **"Indicação — <nome do indicador>"**.
`/admin/cupons` ganha a origem na lista e um filtro por origem (parceria / indicação).
`/admin/validar` mostra a origem, para o vendedor saber o que está validando.
`/cupom/[numero]` mostra quem indicou no lugar do @ do influenciador. O dashboard conta
cupom de indicação **separado**, nunca somado ao de parceria.

- [ ] **Step 5: Rodar `npm test` e `npm run build`.**
- [ ] **Step 6: Commit** com a lista da auditoria no corpo da mensagem.

---

### Task 7: Tela do admin — teto, encerrar e exportação

**Files:**
- Create: `app/admin/(protected)/indicadores/page.tsx`
- Create: `components/admin/indicadores/ListaDeIndicadores.tsx`
- Create: `app/api/admin/indicadores/[id]/route.ts`
- Create: `app/api/admin/indicadores/export/route.ts`
- Modify: `lib/auth/roles.ts`
- Modify: `app/admin/(protected)/layout.tsx` (menu)
- Modify: `proxy.ts` (`/admin/indicadores` na lista do `finance`)
- Test: `tests/indicacao/admin.test.ts`

**Interfaces:**
- Consumes: Task 2 (`resumoDoIndicador`).
- Produces: ação `'indicadores.edit'` em `Action`, liberada para `['admin', 'finance']`.

- [ ] **Step 1: Teste da matriz**

```ts
test('teto de indicacao: admin e financeiro editam; lojista e influenciador nao', () => {
  expect(can('admin', 'indicadores.edit')).toBe(true)
  expect(can('finance', 'indicadores.edit')).toBe(true)
  expect(can('moderator', 'indicadores.edit')).toBe(false)
  expect(can('influencer', 'indicadores.edit')).toBe(false)
  expect(can('indicador', 'indicadores.edit')).toBe(false)
})
```

- [ ] **Step 2: Rodar e ver falhar. Step 3: Adicionar a ação e a linha da matriz. Step 4: Rodar e ver passar.**

- [ ] **Step 5: A tela**

Lista com nome, CPF, telefone, código, cliques, cupons, usos, conferidos, **a receber**,
teto e situação. Por linha: editar o teto (vazio = sem teto) e encerrar/reativar o
benefício — a ação mora junto da informação, nunca "veja em outro lugar". Guarda de papel
no servidor (`requireRole(['admin','finance'])`), além do menu e do proxy.

- [ ] **Step 6: A exportação**

`GET /api/admin/indicadores/export` devolve XLSX (`xlsx`, já dependência) com **uma linha
por cupom conferido a pagar**: indicador, CPF do indicador, telefone, código, cupom,
comprador, CPF do comprador, telefone do comprador, loja, data da validação, NF e o valor
do prêmio. É esse arquivo que o César usa para premiar. Mesma guarda de papel.

- [ ] **Step 7: Rodar `npm test` e `npm run build`. Step 8: Commit.**
