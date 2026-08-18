# Pendências: balcão, financeiro e parceria — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar tudo que ficou pendente e não depende de decisão nova: o anti-abuso do balcão, os dados bancários no Financeiro, e o aviso de parceria vencendo.

**Architecture:** Três entregas independentes, cada uma útil sozinha e na ordem em que o valor aparece. A A fecha o problema que originou o projeto (o balcão usar o cupom como desconto). A B destrava o Financeiro pagar sem sair do sistema. A C usa o `pg_cron` já instalado para avisar antes da parceria vencer.

**Tech Stack:** Next.js 16.2.6 (App Router), React 19, Tailwind v4, Supabase (Postgres + RLS), TypeScript, Vitest.

**Specs:** `docs/superpowers/specs/2026-07-28-cupom-express-anti-abuso-design.md` (entrega A, aprovada e nunca implementada). B e C foram desenhadas na conversa de 18/08 e estão descritas aqui.

## Global Constraints

- Verificação = `npx tsc --noEmit`, `npx eslint .`, `npx next build` e `npm test`.
- Arquivos abaixo de **500 linhas** (`CLAUDE.md`). `InfluencersList` já estourou duas vezes — extrair antes de acrescentar.
- Este **não é o Next.js que você conhece** (`AGENTS.md`). Ler `node_modules/next/dist/docs/` antes de mexer em rota ou página.
- Colunas em **inglês**, rótulos de tela em **português**.
- Toda regra de permissão vale na tela, na API **e** no banco.
- Banco de **produção**, compartilhado com o fc-digitalcard (`card_*`). Não tocar fora de `coupons`, `influencers`, `campaigns`, `sellers`, `admin_profiles`.
- Migrations via MCP (`apply_migration`), SQL versionado em `db/migrations/`. Próximo número: **009**.
- Project ID: `uufrrhqrafxybdhkhvln`.
- Papéis: `admin` (superusuário), `finance` (Financeiro), `moderator` (**Lojista**).
- **Migração que muda regra de operação sobe junto com o código.** Em 06/08 a migração dos vendedores foi aplicada com o código parado numa branch e o balcão ficou 12 dias sem validar cupom, em silêncio.

## O levantamento completo

Varri `docs/BACKLOG.md` e todas as seções "fora de escopo" dos planos e specs anteriores.

### Neste plano

| | O quê | De onde veio |
|---|---|---|
| **A** | QR no balcão + telefone repetido | spec de 28/07, aprovada e nunca feita |
| **B** | Dados bancários dos influenciadores | pedido de 18/08 |
| **C** | Aviso de parceria vencendo | pedido de 18/08 |

### Fora deste plano, e por quê

- **Portal do influenciador.** Bloqueado por decisão do César: os dados atuais vieram de planilha e não podem ser expostos sem separar "migrado" de "nascido no sistema". Duas saídas na mesa (data de corte, ou marcar os antigos) e nenhuma escolhida.
- **`fee_paid_at`** — controle de pagamento do fixo. Precisa da decisão de como o fixo é acertado.
- **"Pagar tudo deste influenciador"** — hoje é cupom a cupom. Só faz sentido com mais volume.
- **Avaliar se `campaigns.active` ainda serve** — desde 18/08 não derruba link. Não incomoda ninguém hoje.
- **19 testes de banco dormindo** — exigiriam a senha do Postgres de produção. O caminho certo é um projeto Supabase separado.
- **PIN por vendedor** — o César recusou explicitamente em 06/08. Não é pendência, é decisão.

### Já resolvido, para não voltar à lista

- ~~Cálculo de comissão~~ — feito em 18/08 (`lib/commission.ts`).
- ~~Prazo de parceria~~ — feito em 18/08 (`partnership_ends_at`).
- ~~Leitura de QR no balcão~~ — **já funcionava e ninguém sabia.** O QR do cupom aponta para `/admin/validar?codigo=FOX-XXXXXX`, e a tela lê o parâmetro e busca sozinha. A Task 1 só torna isso visível.

---

# Entrega A — Balcão: QR e telefone repetido

Fecha o problema que originou o projeto: o vendedor consegue criar um cupom sozinho, em vinte segundos, atribuído a qualquer influenciador, sem prova de que a indicação existiu.

O que já foi construído (NF, Conferido, Pago, vendedor nomeado) ataca pela auditoria, **depois** da venda. Isto ataca pela prevenção, **no** balcão.

### Task 1: Tornar visível que o QR já funciona

**Files:**
- Modify: `app/admin/(protected)/validar/ValidarClient.tsx`

Nenhuma funcionalidade nova: o QR do cupom já abre a tela de validar com o código preenchido e pesquisado. O que falta é a loja saber disso.

- [ ] **Step 1: Uma linha no bloco de instrução**

No bloco que já explica a tela (aquele que diz "Digite o código do cupom do cliente..."), acrescentar:

```tsx
<p className="text-gray-500 text-xs mt-2">
  Dica: aponte a câmera do celular para o QR Code do cupom do cliente — a tela
  abre com o código já preenchido.
</p>
```

- [ ] **Step 2: Verificar**

```bash
npx tsc --noEmit && npx eslint "app/admin/(protected)/validar/ValidarClient.tsx" && npx next build
```

Testar de verdade: abrir `/cupom/<numero>` de um cupom existente, apontar a câmera do celular para o QR, e confirmar que cai em `/admin/validar?codigo=...` com o cupom já buscado. Precisa estar logado no celular.

- [ ] **Step 3: Commit**

```bash
git add "app/admin/(protected)/validar/ValidarClient.tsx"
git commit -m "docs: avisa no balcao que o QR do cupom ja abre a validacao"
```

---

### Task 2: Lojista perde o cadastro express

**Files:**
- Modify: `app/api/admin/coupon-express/route.ts`
- Modify: `lib/auth/roles.ts`

O ponto central da spec: o vendedor deixa de conseguir criar cliente sozinho.

- [ ] **Step 1: A ação nova na matriz**

Em `lib/auth/roles.ts`, acrescentar em `Action` e em `MATRIX`:

```ts
  | 'coupons.express'
```

```ts
  // Cadastro express no balcao: so admin, como saida de emergencia.
  // O lojista perdeu em 18/08 -- era o caminho que permitia inventar indicacao.
  'coupons.express': ['admin'],
```

- [ ] **Step 2: A trava na rota**

Em `app/api/admin/coupon-express/route.ts`, trocar `requireRole(['admin', 'moderator'])` por `requireRole(['admin'])`.

**É aqui que a regra vale de verdade** — esconder na tela não é trava. O bloco que checa a loja do vendedor quando `auth.role === 'moderator'` vira código morto e sai junto.

- [ ] **Step 3: Verificar que o lojista é recusado**

```bash
npx tsc --noEmit && npx next build
```

Subir `npx next dev`, logar como lojista, e confirmar que chamar a rota devolve 403.

- [ ] **Step 4: Commit**

```bash
git add app/api/admin/coupon-express/route.ts lib/auth/roles.ts
git commit -m "feat: cadastro express passa a ser so do admin"
```

---

### Task 3: QR do influenciador no lugar do formulário

**Files:**
- Create: `components/admin/ExpressQR.tsx`
- Modify: `app/admin/(protected)/validar/ValidarClient.tsx`

Quando o lojista digita o código de um influenciador, em vez do formulário aparece um QR grande do link público. O cliente escaneia com **o próprio celular** e preenche os próprios dados.

O QR aponta para `{SITE_URL}/c/{coupon_code}` — a landing que já existe. Não há tela nova para o cliente.

- [ ] **Step 1: O componente**

Criar `components/admin/ExpressQR.tsx`, usando `qrcode` como o `CouponCard` já faz:

```tsx
'use client'

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

/**
 * QR do link do influenciador, para o CLIENTE gerar o proprio cupom no balcao.
 *
 * Substitui o formulario express do lojista. O vendedor sozinho nao consegue
 * mais inventar uma indicacao: quem preenche e o cliente, no aparelho dele.
 * Ver docs/superpowers/specs/2026-07-28-cupom-express-anti-abuso-design.md
 */
export function ExpressQR({
  couponCode,
  handle,
  descontoLabel,
  validityDays,
}: {
  couponCode: string
  handle: string
  descontoLabel: string
  validityDays: number
}) {
  const [qr, setQr] = useState('')
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://influenciadores.foxcycles.com.br'
  const url = `${siteUrl}/c/${couponCode}`

  useEffect(() => {
    QRCode.toDataURL(url, { width: 480, margin: 1 }).then(setQr).catch(() => setQr(''))
  }, [url])

  return (
    <div className="bg-[#141414] border border-[#00ff87]/30 rounded-xl p-6 flex flex-col items-center gap-4">
      <div className="text-center">
        <div className="text-xs text-[#00ff87] font-bold uppercase tracking-wider">Indicado por</div>
        <div className="text-white font-bold text-xl mt-1">{handle}</div>
        <div className="text-[#00ff87] font-black text-3xl mt-2">{descontoLabel}</div>
        <div className="text-gray-400 text-xs">válido por {validityDays} dias</div>
      </div>

      {qr && (
        <div className="bg-white p-3 rounded-xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="QR Code do link do influencer" className="w-56 h-56" />
        </div>
      )}

      <p className="text-gray-300 text-sm text-center leading-relaxed">
        Peça para <span className="text-white font-semibold">o cliente</span> apontar a câmera
        do celular dele para este código e preencher os próprios dados.
      </p>
      <p className="text-gray-600 text-xs text-center">
        Depois é só digitar o código do cupom que ele receber, aqui nesta tela.
      </p>
    </div>
  )
}
```

- [ ] **Step 2: Trocar o formulário pelo QR**

Em `ValidarClient.tsx`, o bloco "FLUXO 2: Cadastro express via handle" passa a renderizar `<ExpressQR />` quando o papel não pode usar o express, e o formulário quando pode:

```tsx
{influencer && !successCoupon && (
  can(role, 'coupons.express') ? (
    /* formulário express — admin, saída de emergência */
  ) : (
    <ExpressQR
      couponCode={influencer.coupon_code}
      handle={influencer.instagram_handle}
      descontoLabel={formatDiscount(influencer)}
      validityDays={influencer.validity_days}
    />
  )
)}
```

Isso exige a página passar o `role` para o `ValidarClient`, que hoje só recebe `sellers` e `initialCode`.

- [ ] **Step 3: Conferir o tamanho antes de commitar**

```bash
wc -l "app/admin/(protected)/validar/ValidarClient.tsx"
```

Se passar de 500, extrair o formulário express para `components/admin/ExpressForm.tsx` antes de seguir.

- [ ] **Step 4: Verificar**

```bash
npx tsc --noEmit && npx eslint . && npx next build && npm test
```

Testar como lojista: digitar um código de influenciador e confirmar que aparece o QR e **não** o formulário. Como admin: confirmar que o formulário ainda aparece.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: balcao mostra QR do influencer no lugar do formulario"
```

---

### Task 4: Telefone repetido

**Files:**
- Create: `lib/coupons/telefone-repetido.ts`
- Create: `tests/telefone-repetido.test.ts`
- Modify: `app/admin/(protected)/cupons/page.tsx`, `components/admin/cupons/CuponsRow.tsx`

O furo que sobra: o vendedor determinado escaneia o QR com o próprio celular e preenche. O que denuncia isso é o mesmo telefone aparecendo em clientes diferentes.

Decisão da spec: **marcar e alertar, não bloquear**. Telefone repetido tem caso legítimo (marido e mulher), e bloquear geraria chamado no meio de uma venda. A dissuasão vem da visibilidade.

Definição: dois ou mais cupons com o mesmo `customer_phone` e `customer_cpf` **diferentes**. Mesmo telefone com o mesmo CPF é a mesma pessoa — caso legítimo.

- [ ] **Step 1: Os testes primeiro**

Criar `tests/telefone-repetido.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { telefonesSuspeitos } from '@/lib/coupons/telefone-repetido'

const c = (id: string, phone: string, cpf: string) => ({ id, customer_phone: phone, customer_cpf: cpf })

describe('telefonesSuspeitos', () => {
  it('lista vazia nao acusa nada', () => {
    expect(telefonesSuspeitos([]).size).toBe(0)
  })

  it('mesmo telefone e mesmo CPF e a mesma pessoa, nao acusa', () => {
    // Acontece de verdade: a pessoa participa de duas campanhas.
    const r = telefonesSuspeitos([c('a', '19999998888', '111'), c('b', '19999998888', '111')])
    expect(r.size).toBe(0)
  })

  it('mesmo telefone com CPFs diferentes acusa os dois cupons', () => {
    const r = telefonesSuspeitos([c('a', '19999998888', '111'), c('b', '19999998888', '222')])
    expect(r.has('a')).toBe(true)
    expect(r.has('b')).toBe(true)
  })

  it('telefones diferentes nao acusam', () => {
    const r = telefonesSuspeitos([c('a', '19999998888', '111'), c('b', '19999997777', '222')])
    expect(r.size).toBe(0)
  })

  it('telefone vazio nao acusa', () => {
    const r = telefonesSuspeitos([c('a', '', '111'), c('b', '', '222')])
    expect(r.size).toBe(0)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npx vitest run tests/telefone-repetido.test.ts
```

- [ ] **Step 3: Implementar**

Criar `lib/coupons/telefone-repetido.ts`:

```ts
/**
 * Cupons cujo telefone aparece em CPFs diferentes.
 *
 * E o sinal que denuncia o vendedor que escaneia o QR com o proprio celular e
 * preenche pelo cliente. Marcar e alertar, nunca bloquear: telefone repetido
 * tem caso legitimo (marido e mulher) e bloquear geraria chamado no meio de uma
 * venda. A dissuasao vem da visibilidade.
 */
export function telefonesSuspeitos(
  cupons: { id: string; customer_phone: string; customer_cpf: string }[]
): Set<string> {
  const porTelefone = new Map<string, Set<string>>()
  for (const c of cupons) {
    const tel = (c.customer_phone || '').trim()
    if (!tel) continue
    if (!porTelefone.has(tel)) porTelefone.set(tel, new Set())
    porTelefone.get(tel)!.add(c.customer_cpf)
  }

  const suspeitos = new Set<string>()
  for (const c of cupons) {
    const tel = (c.customer_phone || '').trim()
    if (tel && (porTelefone.get(tel)?.size ?? 0) > 1) suspeitos.add(c.id)
  }
  return suspeitos
}
```

- [ ] **Step 4: Rodar e ver passar**

```bash
npm test
```

- [ ] **Step 5: Marcar na tela**

Em `cupons/page.tsx`, calcular `const suspeitos = telefonesSuspeitos(coupons)` e passar para a tabela. Na linha, ao lado do telefone no bloco expandido e como um ícone discreto na linha:

```tsx
{suspeito && (
  <span title="Este telefone aparece em clientes com CPFs diferentes"
    className="text-xs text-yellow-500 ml-1">⚠</span>
)}
```

- [ ] **Step 6: Conferir contra o banco**

```sql
select customer_phone, count(distinct customer_cpf) as cpfs, count(*) as cupons
from public.coupons where customer_phone <> ''
group by customer_phone having count(distinct customer_cpf) > 1;
```

A tela tem que marcar exatamente os cupons que essa consulta retorna.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: marca cupons com telefone repetido em CPFs diferentes"
```

---

# Entrega B — Financeiro: dados bancários

Onde o Financeiro cadastra como pagar cada influenciador, sem sair do sistema.

### Task 5: Colunas e permissão

**Files:**
- Create: `db/migrations/009_dados_bancarios.sql`
- Modify: `lib/supabase/types.ts`, `lib/auth/roles.ts`

- [ ] **Step 1: A migração**

Criar `db/migrations/009_dados_bancarios.sql`:

```sql
-- 009_dados_bancarios.sql
-- Onde o Financeiro guarda como pagar cada influenciador.
--
-- Dado sensivel: so admin e finance leem e escrevem. O Lojista nao pode ver --
-- ele nem tem motivo para abrir a tela de influencers.

alter table public.influencers
  add column if not exists payment_method   text,
  add column if not exists pix_key          text,
  add column if not exists bank_name        text,
  add column if not exists bank_agency      text,
  add column if not exists bank_account     text,
  add column if not exists payment_document text,
  add column if not exists payment_notes    text;

alter table public.influencers drop constraint if exists influencers_payment_method_check;
alter table public.influencers add constraint influencers_payment_method_check
  check (payment_method is null or payment_method = any (array['pix'::text, 'conta'::text]));
```

**Atenção — o Lojista hoje enxerga `influencers`:** a policy `influencers_select_public` é `using (true)`. Como os dados bancários entram na mesma tabela, o Lojista passaria a poder lê-los pela API mesmo sem ver a tela.

O Lojista **não acessa mais** `/admin/influencers` desde 18/08 (`proxy.ts`), então a tela está fechada — mas a API não. Fechar isso é parte desta task:

```sql
-- A landing publica precisa ler o influencer sem estar logada (anon).
-- Entao a leitura publica continua, mas sem os campos bancarios: eles saem para
-- uma view, e a tabela crua deixa de ser legivel por quem nao e admin/finance.
--
-- ATENCAO ao executar: conferir antes quais rotas leem `influencers` com a
-- sessao do usuario, e nao quebrar a landing `/c/[coupon_code]`.
```

> **⚠️ Esta parte precisa de decisão antes de executar.** Restringir a leitura de `influencers` pode quebrar a landing pública, que lê a tabela sem login. As opções são: (a) mover os campos bancários para uma tabela própria `influencer_payment_info` com RLS só de admin/finance, ou (b) manter na mesma tabela e aceitar que um Lojista logado consiga lê-los pela API. **Recomendo (a)** — é mais trabalho, mas dado bancário não deve depender de ninguém lembrar de filtrar coluna.

- [ ] **Step 2: Decidir (a) ou (b) com o César antes de aplicar**

Não aplicar a migração até isso estar decidido. Se for (a), reescrever o SQL acima como tabela separada com FK para `influencers` e RLS `using (is_admin() or is_finance())`.

- [ ] **Step 3: Tipos e ação na matriz**

`lib/auth/roles.ts` ganha `'influencers.payment'` com `['admin', 'finance']`.

- [ ] **Step 4: Commit**

```bash
git add db/migrations/009_dados_bancarios.sql lib/supabase/types.ts lib/auth/roles.ts
git commit -m "feat(db): dados bancarios do influenciador"
```

---

### Task 6: A tela

**Files:**
- Create: `components/admin/DadosBancarios.tsx`
- Modify: `components/admin/InfluencersList.tsx`

- [ ] **Step 1: O painel**

Um painel por influenciador, aberto por um botão **Dados bancários**, visível só para quem tem `influencers.payment`. Campos: forma (PIX ou conta), chave PIX, banco, agência, conta, CPF/CNPJ do recebedor, observações.

- [ ] **Step 2: Salvar por rota, não pelo cliente**

Criar `app/api/admin/influencer-payment/route.ts` com `requireRole(['admin', 'finance'])`. Não gravar pelo cliente Supabase direto — dado sensível passa por allowlist explícita, como já fazemos em `/api/admin/coupons`.

- [ ] **Step 3: Verificar**

```bash
npx tsc --noEmit && npx eslint . && npx next build && npm test
wc -l components/admin/InfluencersList.tsx
```

Testar como Financeiro: consegue abrir e salvar. Como Lojista: nem vê o botão, e a rota devolve 403.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: Financeiro cadastra dados bancarios do influenciador"
```

---

# Entrega C — Aviso de parceria vencendo

O `partnership_ends_at` já derruba o link na data. Falta avisar **antes**, para o César fechar as vendas e pagar a comissão a tempo.

### Task 7: Bloco de avisos no Dashboard

**Files:**
- Modify: `app/admin/(protected)/page.tsx`

Não precisa de `pg_cron`: o Dashboard é lido com frequência e a conta é trivial. O agendador só faria sentido se houvesse canal externo — e não há, porque o e-mail foi descartado.

- [ ] **Step 1: Buscar quem vence em 30 dias**

No Dashboard, usar `venceEmAte` de `lib/influencer-status.ts`, que já existe e já é testada:

```ts
const vencendo = (influencers || []).filter((i) => venceEmAte(i, 30))
```

- [ ] **Step 2: O bloco**

Acima das métricas, e só quando houver algo:

```tsx
{vencendo.length > 0 && (
  <div className="bg-yellow-950/30 border border-yellow-900 rounded-xl p-5">
    <h2 className="text-yellow-400 font-bold mb-2">
      {vencendo.length} parceria{vencendo.length !== 1 ? 's' : ''} vencendo em 30 dias
    </h2>
    <p className="text-gray-400 text-xs mb-3">
      Depois da data o link para de funcionar. Prorrogue ou renove antes, e feche
      as comissões do período.
    </p>
    {/* lista com handle, data e link para /admin/influencers */}
  </div>
)}
```

- [ ] **Step 3: Verificar**

```bash
npx tsc --noEmit && npx eslint . && npx next build && npm test
```

Como hoje **ninguém tem prazo definido**, o bloco não deve aparecer. Para testar, definir um prazo em um influenciador, conferir que o bloco surge, e reverter — **em transação com rollback pelo MCP, nunca alterando dado real de forma solta.** Em 18/08 eu deixei o link do @caiiuxo morto ao fazer isso sem cuidado.

- [ ] **Step 4: Commit**

```bash
git add "app/admin/(protected)/page.tsx"
git commit -m "feat: dashboard avisa parcerias vencendo em 30 dias"
```

---

## Critérios de aceite

- [ ] `npx tsc --noEmit` limpo
- [ ] `npx eslint .` sem warnings novos (os 5 pré-existentes continuam)
- [ ] `npx next build` passa
- [ ] `npm test` verde, com os testes novos de telefone repetido
- [ ] Nenhum arquivo acima de 500 linhas
- [ ] **Lojista não consegue mais criar cupom express**, nem pela tela nem pela API
- [ ] Lojista vê o QR do influenciador; admin ainda vê o formulário
- [ ] Cupons com telefone repetido em CPFs diferentes aparecem marcados
- [ ] Lojista não lê dados bancários, nem pela tela nem pela API
- [ ] Dashboard avisa parceria vencendo, e não aparece quando não há nenhuma
- [ ] `docs/BACKLOG.md` atualizado ao fim de cada entrega

## Depois deste plano

Sobra apenas o **portal do influenciador**, bloqueado pela decisão sobre os dados migrados da planilha, e as dívidas técnicas listadas em `docs/BACKLOG.md`.
