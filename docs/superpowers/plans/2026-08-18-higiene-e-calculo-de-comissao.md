# Higiene e cálculo de comissão — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deixar visível se a campanha do influenciador está ativa, corrigir sozinho os cupons vencidos que ficaram como pendentes, e fazer o sistema responder "quanto eu devo a este influenciador".

**Architecture:** O cálculo de comissão vira um módulo puro, sem banco e sem React, testável em milissegundos — é a fundação de que os próximos planos (encerramento de parceria e portal do influenciador) vão depender. A expiração de cupons roda como job diário no `pg_cron`, instalado nesta rodada — o dado fica correto sozinho, sem depender de alguém abrir a tela.

**Tech Stack:** Next.js 16.2.6 (App Router), React 19, Tailwind v4, Supabase (Postgres + RLS), TypeScript, Vitest.

**Spec:** não há documento separado — esta rodada foi interpretada em conversa com o César em 2026-08-18. As decisões estão na seção "Contexto e decisões" abaixo, que faz o papel da spec.

## Global Constraints

- Verificação = `npx tsc --noEmit`, `npx eslint .`, `npx next build` e `npm test`.
- Arquivos abaixo de **500 linhas** (regra do `CLAUDE.md` do repositório).
- Este **não é o Next.js que você conhece** (regra do `AGENTS.md`). Antes de escrever código de rota ou página, ler o guia em `node_modules/next/dist/docs/`.
- Ler o arquivo antes de editar. Nunca commitar segredos.
- Nomes de coluna em **inglês**; rótulos de tela em **português**.
- Toda regra de permissão vale na API **e** no banco. Esconder na tela não é trava.
- O banco é **produção**, compartilhado com o fc-digitalcard (tabelas `card_*`). Não tocar fora de `coupons`, `influencers`, `campaigns`, `sellers`, `admin_profiles`.
- Migrations via MCP do Supabase (`apply_migration`), SQL versionado em `db/migrations/`.
- Project ID do Supabase: `uufrrhqrafxybdhkhvln`.
- Papéis: `admin` (superusuário), `finance` (Financeiro), `moderator` (**Lojista** — a tela nunca diz "moderador").

## Contexto e decisões

### O que o César pediu e o que ficou nesta rodada

Cinco itens foram levantados. Esta rodada cobre **1 e 4** (higiene) e a **fundação de comissão**, que não estava na lista mas é pré-requisito dos itens 3 e 5. Ficam para planos seguintes: dados bancários (2), encerramento de parceria com aviso (3) e portal do influenciador (5, com login por e-mail e senha, já decidido).

### Decisão: a regra da comissão

`commission_starts_at` é **o número da venda a partir da qual a comissão passa a valer**. O César define por influenciador, conforme o combinado com cada um. Se for `1`, paga desde a primeira venda; se for `2`, a primeira não gera comissão e da segunda em diante sim.

Formalmente: as vendas do influenciador são ordenadas cronologicamente e recebem uma posição a partir de 1. A venda na posição `i` gera `commission_per_sale` quando `i >= commission_starts_at`.

### ⚠️ Suposição que precisa de confirmação antes da Task 3

**O que conta como "venda" para gerar comissão é o cupom com `verified = true`** — ou seja, conferido pelo Financeiro contra a NF, não apenas usado no balcão.

É a leitura coerente com o sistema: a corrente NF → Conferido → Pago existe justamente para autorizar pagamento, e pagar comissão por cupom não conferido anularia o controle construído. Mas se o combinado comercial for "conta a partir do uso no balcão", a Task 3 muda de `verified` para `status = 'used'` — **uma linha**, na constante `VENDA_CONTA_QUANDO`.

### ⚠️ Lacuna conhecida: o fixo (`fee_amount`)

Existe `fee_amount` (cachê fixo por influenciador), mas **não existe nenhum campo que registre se ele já foi pago**. Por isso este plano **exibe** o fixo mas **não** o soma em "a pagar" — somar sem saber se já saiu daria número errado.

Resolver isso é decisão do César (um campo `fee_paid_at` no influencer resolveria) e fica registrado como pendência, não como escopo.

### A expiração de cupons (Task 2 — JÁ EXECUTADA)

O problema: cupom vencido continuava `pending` para sempre, porque a correção só acontecia dentro de `/api/coupons/validate`, quando alguém abria **aquele** cupom. Em 18/08 eram **7 de 8 pendentes já vencidos**, o mais antigo de 23/05. A lista ficava suja e o filtro por status mentia.

A primeira versão deste plano evitava agendador porque `pg_cron` não estava instalado, e propunha varrer na carga da tela. O César autorizou instalar o que fizesse sentido, e o `pg_cron` faz: a varredura na tela colocaria uma escrita numa página de leitura e só corrigiria quando alguém olhasse. Além disso o **item 3** da lista dele (avisar sobre encerramento de parceria) é um problema de agendamento — a extensão seria necessária de qualquer jeito.

Resultado, já em produção: extensão instalada, função `public.expirar_cupons_vencidos()` criada e job `expirar-cupons-vencidos` rodando todo dia às 03:15 UTC (00:15 de Brasília). A execução manual de 18/08 expirou os 7 acumulados.

## Estrutura de arquivos

**Criar:**
- `lib/commission.ts` — cálculo puro de comissão, sem banco e sem React
- `tests/commission.test.ts` — testes do cálculo
- `db/migrations/007_expirar_cupons_vencidos.sql` — job diário (✅ já aplicada)

**Modificar:**
- `app/admin/(protected)/influencers/page.tsx` — buscar `campaigns(name, active)` e os dados de comissão
- `components/admin/InfluencersList.tsx` — tag de estado e cartões de comissão

---

### Task 1: Tag de estado do influenciador

**Files:**
- Modify: `app/admin/(protected)/influencers/page.tsx`
- Modify: `components/admin/InfluencersList.tsx`

**Interfaces:**
- Produces: cada item de `enriched` ganha `campaign_active: boolean`.

Hoje a lista mostra "Campanha: X" sem dizer se ela está ativa. São dois interruptores independentes — o influenciador pode estar ativo dentro de uma campanha encerrada, e isso é invisível.

Três estados, nesta ordem de precedência:

| Condição | Etiqueta | Cor |
|---|---|---|
| `influencer.active === false` | Influencer inativo | cinza |
| `campaign_active === false` | Campanha encerrada | vermelho |
| ambos ativos | Ativo | verde |

- [ ] **Step 1: Trazer `active` da campanha na página**

Em `app/admin/(protected)/influencers/page.tsx`, trocar o select e o enriquecimento:

```ts
      .select('*, campaigns(name, active), coupons(status)')
```

E dentro do `.map`, junto de `campaign_name`:

```ts
      campaign_active: (inf.campaigns as { active: boolean } | null)?.active ?? false,
```

- [ ] **Step 2: Renderizar a etiqueta**

Em `components/admin/InfluencersList.tsx`, acrescentar `campaign_active: boolean` ao tipo do influencer recebido, e renderizar a etiqueta ao lado do handle. Colocar logo após o bloco que já mostra o handle e antes da linha "Campanha: …":

```tsx
{(() => {
  const estado = !inf.active
    ? { texto: 'Influencer inativo', cor: 'bg-[#1e1e1e] text-gray-400' }
    : !inf.campaign_active
      ? { texto: 'Campanha encerrada', cor: 'bg-red-950 text-red-400' }
      : { texto: 'Ativo', cor: 'bg-[#00ff87]/10 text-[#00ff87]' }
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${estado.cor}`}>
      {estado.texto}
    </span>
  )
})()}
```

- [ ] **Step 3: Verificar**

```bash
npx tsc --noEmit && npx eslint components/admin/InfluencersList.tsx "app/admin/(protected)/influencers/page.tsx" && npx next build
```

Conferir na tela: hoje existem 3 campanhas, todas ativas, então todos devem aparecer como **Ativo** — exceto influencers com `active = false`. Para testar o estado "Campanha encerrada" sem estragar dado real, desativar uma campanha em Campanhas, olhar a lista, e reativar.

- [ ] **Step 4: Commit**

```bash
git add "app/admin/(protected)/influencers/page.tsx" components/admin/InfluencersList.tsx
git commit -m "feat: etiqueta de estado do influencer e da campanha na listagem"
```

---

### Task 2: Expirar cupons vencidos — ✅ JÁ EXECUTADA em 2026-08-18

**Files:**
- Create: `db/migrations/007_expirar_cupons_vencidos.sql`

**Interfaces:**
- Produces: `public.expirar_cupons_vencidos() returns integer` e o job `expirar-cupons-vencidos` no `cron.job`.

Feita durante o planejamento, porque o César autorizou instalar o `pg_cron` e a
correção passou a ser de banco, sem código de aplicação. Registrada aqui para o
histórico ficar completo. **Nenhum arquivo de aplicação foi tocado** — o
`lib/coupons/expire.ts` da primeira versão deste plano não chegou a existir.

- [x] **Step 1: Instalar a extensão**

`create extension if not exists pg_cron;` — aplicada via MCP.

- [x] **Step 2: Função e agendamento**

`db/migrations/007_expirar_cupons_vencidos.sql`, aplicada via MCP. Função
`security definer` para o trigger `coupons_guard_non_admin_update` deixar
passar (`auth.uid()` é nulo, cai no ramo de rotina de servidor). Job diário às
03:15 UTC, que é 00:15 de Brasília.

- [x] **Step 3: Verificar o agendamento**

```sql
select jobname, schedule, command, active from cron.job;
```

Resultado: `expirar-cupons-vencidos` · `15 3 * * *` · ativo.

- [x] **Step 4: Rodar uma vez e conferir**

```sql
select public.expirar_cupons_vencidos();
```

Resultado: **7 cupons expirados**. Antes: `pending` 8 (7 vencidos). Depois:
`pending` 1, `expired` 7, `used` 7 — intocado. Conferido que `verified`,
`paid` e `seller_id` não mudaram.


### Task 3: Cálculo de comissão

**Files:**
- Create: `lib/commission.ts`
- Create: `tests/commission.test.ts`

**Interfaces:**
- Produces:
  - `type VendaParaComissao = { id: string; verified: boolean; paid: boolean; created_at: string }`
  - `type ContratoInfluencer = { commission_per_sale: number; commission_starts_at: number; fee_amount: number }`
  - `type ResumoComissao = { totalVendas: number; vendasQueContam: number; comissaoGerada: number; comissaoPaga: number; comissaoAPagar: number; fixo: number }`
  - `calcularComissao(contrato: ContratoInfluencer, cupons: VendaParaComissao[]): ResumoComissao`

Módulo **puro**: sem banco, sem React, sem data do sistema. É a fundação dos planos de encerramento de parceria e do portal do influenciador.

- [ ] **Step 1: Escrever os testes primeiro**

Criar `tests/commission.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { calcularComissao, type VendaParaComissao } from '@/lib/commission'

const contrato = { commission_per_sale: 500, commission_starts_at: 2, fee_amount: 500 }

function venda(id: string, dia: string, opts: Partial<VendaParaComissao> = {}): VendaParaComissao {
  return { id, created_at: `2026-06-${dia}T12:00:00Z`, verified: true, paid: false, ...opts }
}

describe('calcularComissao', () => {
  it('sem vendas, nao deve nada', () => {
    const r = calcularComissao(contrato, [])
    expect(r).toMatchObject({ totalVendas: 0, vendasQueContam: 0, comissaoGerada: 0, comissaoAPagar: 0 })
  })

  it('so conta cupom conferido pelo financeiro', () => {
    const r = calcularComissao(contrato, [
      venda('a', '05'),
      venda('b', '06', { verified: false }),
      venda('c', '07'),
    ])
    expect(r.totalVendas).toBe(2)
  })

  it('a primeira venda nao gera comissao quando começa na 2a', () => {
    const r = calcularComissao(contrato, [venda('a', '05')])
    expect(r.vendasQueContam).toBe(0)
    expect(r.comissaoGerada).toBe(0)
  })

  it('da 2a venda em diante gera comissao', () => {
    const cupons = ['05', '06', '07', '08', '09', '10'].map((d, i) => venda(String(i), d))
    const r = calcularComissao(contrato, cupons)
    expect(r.totalVendas).toBe(6)
    expect(r.vendasQueContam).toBe(5)
    expect(r.comissaoGerada).toBe(2500)
  })

  it('quando começa na 1a, todas contam', () => {
    const cupons = ['05', '06', '07'].map((d, i) => venda(String(i), d))
    const r = calcularComissao({ ...contrato, commission_starts_at: 1 }, cupons)
    expect(r.vendasQueContam).toBe(3)
    expect(r.comissaoGerada).toBe(1500)
  })

  it('ordena por data, nao pela ordem que chegou na lista', () => {
    // A venda mais antiga e a que ocupa a posicao 1 e fica sem comissao,
    // mesmo chegando por ultimo na lista.
    const r = calcularComissao(contrato, [venda('novo', '20'), venda('antigo', '01')])
    expect(r.vendasQueContam).toBe(1)
    expect(r.comissaoGerada).toBe(500)
  })

  it('separa o que ja foi pago do que falta pagar', () => {
    const cupons = [
      venda('a', '05'),
      venda('b', '06', { paid: true }),
      venda('c', '07'),
    ]
    const r = calcularComissao(contrato, cupons)
    expect(r.comissaoGerada).toBe(1000)  // posicoes 2 e 3
    expect(r.comissaoPaga).toBe(500)     // so a 'b'
    expect(r.comissaoAPagar).toBe(500)
  })

  it('cupom pago que nao chegou a gerar comissao nao vira credito', () => {
    // A 1a venda nao gera comissao. Se estiver marcada como paga, isso nao pode
    // virar valor negativo nem abater o que ainda falta.
    const r = calcularComissao(contrato, [venda('a', '05', { paid: true }), venda('b', '06')])
    expect(r.comissaoGerada).toBe(500)
    expect(r.comissaoPaga).toBe(0)
    expect(r.comissaoAPagar).toBe(500)
  })

  it('o fixo e informado a parte, nunca somado no que falta pagar', () => {
    // Nao existe campo que registre se o fixo ja foi pago. Somar seria chutar.
    const r = calcularComissao(contrato, [venda('a', '05'), venda('b', '06')])
    expect(r.fixo).toBe(500)
    expect(r.comissaoAPagar).toBe(500)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npx vitest run tests/commission.test.ts
```

Esperado: falha ao importar `@/lib/commission` — o arquivo ainda não existe.

- [ ] **Step 3: Implementar**

Criar `lib/commission.ts`:

```ts
/**
 * Calculo de comissao do influenciador. Modulo puro: sem banco, sem React e
 * sem data do sistema, para ser testavel e reaproveitavel.
 *
 * A regra e por influenciador: `commission_starts_at` e o NUMERO DA VENDA a
 * partir da qual a comissao passa a valer. O Cesar preenche conforme o que
 * combinou com cada um -- 1 paga desde a primeira, 2 pula a primeira.
 */

/** Um cupom candidato a gerar comissao. */
export type VendaParaComissao = {
  id: string
  verified: boolean
  paid: boolean
  created_at: string
}

/** O combinado com o influenciador, como esta no cadastro dele. */
export type ContratoInfluencer = {
  commission_per_sale: number
  commission_starts_at: number
  fee_amount: number
}

export type ResumoComissao = {
  /** Vendas que contam como venda (conferidas pelo Financeiro). */
  totalVendas: number
  /** Dessas, quantas caem na faixa que gera comissao. */
  vendasQueContam: number
  comissaoGerada: number
  comissaoPaga: number
  comissaoAPagar: number
  /** Cache fixo do contrato. Informativo: nao ha registro de que ja foi pago. */
  fixo: number
}

/**
 * O que conta como venda para fins de comissao.
 *
 * `verified` = conferido pelo Financeiro contra a NF. E a leitura coerente com
 * a corrente NF -> Conferido -> Pago, que existe para autorizar pagamento.
 * Se o combinado comercial mudar para "conta ao usar no balcao", trocar aqui
 * para (c) => c.status === 'used' e ajustar o tipo.
 */
const VENDA_CONTA_QUANDO = (c: VendaParaComissao) => c.verified

export function calcularComissao(
  contrato: ContratoInfluencer,
  cupons: VendaParaComissao[]
): ResumoComissao {
  const vendas = cupons
    .filter(VENDA_CONTA_QUANDO)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))

  const inicio = Math.max(1, contrato.commission_starts_at || 1)

  // Posicao e 1-based: a venda i gera comissao quando i >= inicio.
  const queContam = vendas.filter((_, indice) => indice + 1 >= inicio)

  const comissaoGerada = queContam.length * contrato.commission_per_sale
  const comissaoPaga = queContam.filter((v) => v.paid).length * contrato.commission_per_sale

  return {
    totalVendas: vendas.length,
    vendasQueContam: queContam.length,
    comissaoGerada,
    comissaoPaga,
    comissaoAPagar: comissaoGerada - comissaoPaga,
    fixo: contrato.fee_amount,
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

```bash
npx vitest run tests/commission.test.ts
```

Esperado: 9 testes passando.

- [ ] **Step 5: Rodar a suíte inteira**

```bash
npm test && npx tsc --noEmit && npx eslint lib/commission.ts tests/commission.test.ts
```

Esperado: 21 passando, 19 pulados.

- [ ] **Step 6: Commit**

```bash
git add lib/commission.ts tests/commission.test.ts
git commit -m "feat: calculo de comissao por influenciador"
```

---

### Task 4: Comissão na tela de Influencers

**Files:**
- Modify: `app/admin/(protected)/influencers/page.tsx`
- Modify: `components/admin/InfluencersList.tsx`

**Interfaces:**
- Consumes: `calcularComissao`, `ResumoComissao` da Task 3; `campaign_active` da Task 1.

- [ ] **Step 1: Calcular na página**

Em `app/admin/(protected)/influencers/page.tsx`, trazer os campos que o cálculo precisa e chamar a função:

```ts
import { calcularComissao } from '@/lib/commission'
```

Trocar o select para incluir os campos de conferência do cupom:

```ts
      .select('*, campaigns(name, active), coupons(status, verified, paid, created_at, id)')
```

E dentro do `.map`, junto do que já existe:

```ts
    const comissao = calcularComissao(
      {
        commission_per_sale: inf.commission_per_sale,
        commission_starts_at: inf.commission_starts_at,
        fee_amount: inf.fee_amount,
      },
      (inf.coupons as { id: string; verified: boolean; paid: boolean; created_at: string }[]) || []
    )
```

E devolver `comissao` no objeto enriquecido.

- [ ] **Step 2: Mostrar nos cartões**

Em `components/admin/InfluencersList.tsx`, acrescentar `comissao: ResumoComissao` ao tipo recebido e trocar os quatro cartões da grade de métricas. Hoje eles mostram Cupons, Vendas, Fee e Comissão/venda — os dois últimos são só o valor cadastrado e não dizem nada sobre o que se deve.

Passam a ser:

```tsx
<div className="bg-[#1a1a1a] rounded-lg px-3 py-2 text-center">
  <div className="text-xs text-gray-500">Cupons</div>
  <div className="text-white font-bold">{inf.total_coupons}</div>
</div>
<div className="bg-[#1a1a1a] rounded-lg px-3 py-2 text-center">
  <div className="text-xs text-gray-500">Vendas conferidas</div>
  <div className="text-white font-bold">{inf.comissao.totalVendas}</div>
</div>
<div className="bg-[#1a1a1a] rounded-lg px-3 py-2 text-center">
  <div className="text-xs text-gray-500">Comissão gerada</div>
  <div className="text-white font-bold text-sm">{formatCurrency(inf.comissao.comissaoGerada)}</div>
</div>
<div className="bg-[#1a1a1a] rounded-lg px-3 py-2 text-center">
  <div className="text-xs text-gray-500">A pagar</div>
  <div className={`font-bold text-sm ${inf.comissao.comissaoAPagar > 0 ? 'text-[#00ff87]' : 'text-gray-500'}`}>
    {formatCurrency(inf.comissao.comissaoAPagar)}
  </div>
</div>
```

Abaixo da grade, uma linha explicando o contrato — sem isso o número "a pagar" não se sustenta sozinho:

```tsx
<p className="text-xs text-gray-600">
  Contrato: {formatCurrency(inf.commission_per_sale)} por venda, a partir da{' '}
  {inf.commission_starts_at}ª · Fixo de {formatCurrency(inf.comissao.fixo)}{' '}
  <span className="text-gray-700">(pagamento do fixo não é controlado pelo sistema)</span>
</p>
```

- [ ] **Step 3: Verificar**

```bash
npx tsc --noEmit && npx eslint components/admin/InfluencersList.tsx "app/admin/(protected)/influencers/page.tsx" && npx next build && npm test
```

- [ ] **Step 4: Conferir contra o banco**

Hoje só existe 1 cupom conferido no sistema inteiro, então quase todos os influencers devem mostrar **R$ 0,00 a pagar** — e isso está certo, não é bug. O @caiiuxo tem 6 cupons usados, mas nenhum conferido ainda.

Conferir com:

```sql
select i.instagram_handle, i.commission_per_sale, i.commission_starts_at,
       count(c.id) filter (where c.verified) as vendas_conferidas,
       count(c.id) filter (where c.verified and c.paid) as ja_pagas
from public.influencers i
left join public.coupons c on c.influencer_id = i.id
group by i.id, i.instagram_handle, i.commission_per_sale, i.commission_starts_at
having count(c.id) filter (where c.verified) > 0;
```

Os números da tela têm que bater com a regra: `vendas_conferidas - (commission_starts_at - 1)`, nunca negativo, vezes `commission_per_sale`.

- [ ] **Step 5: Commit**

```bash
git add "app/admin/(protected)/influencers/page.tsx" components/admin/InfluencersList.tsx
git commit -m "feat: comissao gerada e a pagar na tela de influencers"
```

---

## Critérios de aceite

- [ ] `npx tsc --noEmit` limpo
- [ ] `npx eslint .` sem warnings novos (os 5 pré-existentes continuam)
- [ ] `npx next build` passa
- [ ] `npm test` com 21 passando e 19 pulados
- [ ] Nenhum arquivo acima de 500 linhas
- [ ] A lista de influencers mostra Ativo / Campanha encerrada / Influencer inativo
- [ ] Abrir `/admin/cupons` reduz os `pending` vencidos a zero, sem tocar em `used`
- [ ] O "a pagar" de cada influencer bate com a conferência SQL da Task 4
- [ ] Nenhum cupom teve `verified`, `paid`, `invoice_number` ou `seller_id` alterado por este plano

## Pendências que este plano deixa registradas

- **Pagamento do fixo (`fee_amount`) não é controlado.** Não há campo dizendo se saiu. Um `fee_paid_at` no influencer resolveria — decisão do César.
- **Confirmar que venda = cupom conferido.** Está na constante `VENDA_CONTA_QUANDO` de `lib/commission.ts`, isolada de propósito para trocar em uma linha.
- **Marcar comissão como paga ainda é cupom a cupom.** Com volume maior, vai pedir um "pagar tudo deste influenciador" — não faz sentido construir agora.

## Fora de escopo — próximos planos

- **Dados bancários dos influenciadores** (item 2), visível só para Financeiro e admin.
- **Prazo de parceria e aviso de encerramento** (item 3). Atenção: `validity_days` é a validade do CUPOM para o cliente, não o prazo do link do influenciador. O prazo de parceria não existe e precisa de campo novo.
- **Portal do influenciador** (item 5), com login por e-mail e senha, papel novo, e apoiado em `calcularComissao` desta rodada.
