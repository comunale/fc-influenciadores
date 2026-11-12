/**
 * Guardas puras das rotas de fechar, pagar e cancelar lancamento.
 *
 * Mesmo padrao de app/api/admin/influencer-save: a rota so orquestra, e tudo o
 * que decide (quem passa, o que entra, o que e recusado) mora aqui, testavel
 * sem HTTP e sem banco.
 *
 * As rotas usam o cliente da SESSAO do usuario, nunca o service_role: com a
 * chave de servico auth.uid() e nulo e os tres triggers de imutabilidade da
 * migration 031 deixam tudo passar, o que daria ao Financeiro o poder de
 * editar e apagar lancamento PAGO. Estas guardas sao a primeira camada; RLS e
 * triggers sao a segunda.
 */
import type { CupomElegivel, Periodo, VendaComUso } from './types'

/**
 * Quem mexe no livro. Lojista e influenciador nao tem nem politica de RLS.
 * As rotas fazem requireRole([...PAPEIS_DO_LIVRO]); o banco repete a regra.
 */
export const PAPEIS_DO_LIVRO = ['admin', 'finance'] as const

export type Recusa = { status: number; error: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/

function objeto(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function dataValida(s: string): boolean {
  if (!DATA_ISO.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

// --- fechar -----------------------------------------------------------------

export type CamposDeFechamento =
  | { ok: true; partnership_id: string; periodo: Periodo }
  | { ok: false; error: string }

/** Allowlist fechada: o valor, o tipo e o status NUNCA vem do corpo. */
export function camposDeFechamento(body: unknown): CamposDeFechamento {
  const b = objeto(body)
  if (!b) return { ok: false, error: 'Corpo da requisição inválido.' }
  const partnership_id = b.partnership_id
  if (typeof partnership_id !== 'string' || !UUID.test(partnership_id)) {
    return { ok: false, error: 'Parceria inválida.' }
  }
  const p = objeto(b.periodo)
  const de = p?.de
  const ate = p?.ate
  if (typeof de !== 'string' || typeof ate !== 'string' || !dataValida(de) || !dataValida(ate)) {
    return { ok: false, error: 'Período inválido: informe as datas no formato AAAA-MM-DD.' }
  }
  if (de > ate) return { ok: false, error: 'Período inválido: a data inicial vem depois da final.' }
  return { ok: true, partnership_id, periodo: { de, ate } }
}

/** Arredonda para centavos. 0.1 + 0.2 nao pode virar 0.30000000000000004 no livro. */
export function centavos(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Total do lancamento = soma dos itens JA arredondados. Assim settlements.valor
 * e sum(settlement_items.valor) batem ao centavo (arredondar so o total deixaria
 * 3 x 0.333 dar 1.00 contra itens que somam 0.99).
 */
export function somaDoLancamento(elegiveis: CupomElegivel[]): number {
  return centavos(elegiveis.reduce((soma, c) => soma + centavos(c.valor), 0))
}

export type CupomExcluido = { coupon_id: string; valor: number; motivo: string }

/**
 * Espelha as condicoes de DADO de settlement_motivo_recusa (migration 031) para
 * que um cupom fora da regra seja PULADO, e contado, em vez de o trigger
 * derrubar o fechamento inteiro. cuponsElegiveis conta posicao no historico
 * todo do influenciador (correto); aqui a INCLUSAO passa a ser da parceria do
 * lancamento. O trigger continua sendo a rede de seguranca.
 */
export function filtrarInclusao(
  elegiveis: CupomElegivel[],
  cupons: VendaComUso[],
  partnershipId: string
): { incluidos: CupomElegivel[]; excluidos: CupomExcluido[] } {
  const porId = new Map(cupons.map((c) => [c.id, c]))
  const incluidos: CupomElegivel[] = []
  const excluidos: CupomExcluido[] = []
  for (const e of elegiveis) {
    const c = porId.get(e.coupon_id)
    let motivo: string | null = null
    if (!c) motivo = 'cupom inexistente'
    else if (c.status !== 'used') motivo = 'cupom nao foi usado no balcao'
    else if (!c.used_at) motivo = 'cupom sem data de uso'
    else if (!c.verified) motivo = 'cupom nao conferido'
    else if (c.partnership_id !== partnershipId) motivo = 'cupom de outra parceria'
    if (motivo) excluidos.push({ coupon_id: e.coupon_id, valor: e.valor, motivo })
    else incluidos.push(e)
  }
  return { incluidos, excluidos }
}

/** O que a tela precisa para dizer por que o total e menor do que o prometido. */
export function resumoDeExcluidos(excluidos: CupomExcluido[]): {
  quantidade: number
  valor: number
  por_motivo: Record<string, number>
} {
  const por_motivo: Record<string, number> = {}
  for (const e of excluidos) por_motivo[e.motivo] = (por_motivo[e.motivo] ?? 0) + 1
  return {
    quantidade: excluidos.length,
    valor: centavos(excluidos.reduce((soma, e) => soma + centavos(e.valor), 0)),
    por_motivo,
  }
}

export function recusaDeFechar(elegiveis: CupomElegivel[]): Recusa | null {
  if (elegiveis.length === 0) {
    return { status: 422, error: 'Nenhum cupom elegível neste período: confira se há vendas conferidas e ainda sem lançamento.' }
  }
  return null
}

// --- pagar ------------------------------------------------------------------

export type CamposDePagamento = { paid_at?: string; forma?: string; identificador?: string }

/** Allowlist fechada: so paid_at, forma e identificador. Nada de status ou valor. */
export function camposDePagamento(body: unknown): CamposDePagamento {
  const b = objeto(body)
  const saida: CamposDePagamento = {}
  if (!b) return saida
  if (typeof b.paid_at === 'string') saida.paid_at = b.paid_at
  if (typeof b.forma === 'string') saida.forma = b.forma
  if (typeof b.identificador === 'string' && b.identificador.trim()) {
    saida.identificador = b.identificador.trim()
  }
  return saida
}

/** Texto de erro, ou null se o pagamento esta em condicoes de ser gravado. */
export function validarPagamento(c: CamposDePagamento): string | null {
  if (!c.paid_at || Number.isNaN(new Date(c.paid_at).getTime()) ||
      !/^\d{4}-\d{2}-\d{2}/.test(c.paid_at)) {
    return 'Informe a data do pagamento.'
  }
  if (!c.forma || !c.forma.trim()) return 'Informe a forma de pagamento (PIX, TED...).'
  if (c.forma.trim().length > 60) return 'Forma de pagamento longa demais.'
  if (c.identificador && c.identificador.length > 200) return 'Identificador longo demais.'
  return null
}

// --- estado -----------------------------------------------------------------

export function recusaDePagar(status: string, tipo?: string, itens?: number): Recusa | null {
  if (status === 'aberto') {
    // Zero itens e legitimo para fixo e restituicao; comissao sem itens
    // gravaria dinheiro pago contra comissoes que a tela segue mostrando devidas.
    if (tipo === 'comissao' && itens === 0) {
      return { status: 409, error: 'Lançamento de comissão sem cupons não pode ser pago.' }
    }
    return null
  }
  return { status: 409, error: status === 'pago' ? 'Este lançamento já foi pago.' : 'Este lançamento foi cancelado e não pode ser pago.' }
}

export function recusaDeCancelar(status: string): Recusa | null {
  if (status === 'aberto') return null
  return {
    status: 409,
    error: status === 'pago'
      ? 'Lançamento pago não pode ser cancelado: a correção se faz com um lançamento novo.'
      : 'Este lançamento já está cancelado.',
  }
}

// --- erros do banco ---------------------------------------------------------

/**
 * Erro do Postgres -> resposta para a tela. A mensagem do trigger de itens
 * ("Cupom nao entra no lancamento: <motivo>") e feita para ser lida, entao
 * passa; o resto do SQL nunca vaza.
 */
export function traduzErroDoLivro(err: { code?: string; message: string }): Recusa {
  const msg = err.message ?? ''
  if (/apenas admin ou financeiro/i.test(msg)) {
    return { status: 403, error: 'Sem permissão para esta ação.' }
  }
  if (/lancamento inexistente ou nao esta aberto/i.test(msg)) {
    return { status: 409, error: 'Este lançamento já foi pago ou cancelado.' }
  }
  if (/comissao sem itens/i.test(msg)) {
    return { status: 409, error: 'Lançamento de comissão sem cupons não pode ser pago.' }
  }
  if (/cupom nao conferido:/i.test(msg)) {
    return { status: 422, error: `Há cupom do lançamento que deixou de estar conferido: ${msg.split(':').slice(1).join(':').trim()}. Reconfira o cupom e tente de novo.` }
  }
  if (err.code === '23505' || /settlement_items_coupon_unico|duplicate key/i.test(msg)) {
    return { status: 409, error: 'Algum cupom deste período já pertence a outro lançamento. Atualize a tela e tente de novo.' }
  }
  if (/Cupom nao entra no lancamento/i.test(msg)) {
    return { status: 422, error: msg }
  }
  if (/imutavel/i.test(msg)) {
    return { status: 409, error: 'Lançamento pago é imutável.' }
  }
  return { status: 500, error: 'Não foi possível concluir a operação.' }
}
