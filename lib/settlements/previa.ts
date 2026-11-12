/**
 * A previa do fechamento: o que entraria, o que ficaria de fora e o que depende
 * de escolha. Modulo puro (sem banco, sem React, sem data do sistema).
 *
 * A MESMA funcao alimenta a tela (antes de fechar) e a rota (ao fechar), para o
 * valor mostrado ser o valor gravado.
 */
import type { ContratoInfluencer } from '@/lib/commission'
import { vendasQueContam } from './periodo'
import {
  centavos,
  filtrarInclusao,
  resumoDeExcluidos,
  somaDoLancamento,
  type CupomExcluido,
} from './rotas'
import type { CupomElegivel, Periodo, VendaComUso } from './types'

export const MOTIVO_JA_EM_LANCAMENTO = 'cupom ja esta em outro lancamento'
export const MOTIVO_PAGO_FORA = 'ja consta como pago fora de um lancamento'

export type Previa = {
  /** Cupons do periodo (ate o fim da parceria): entram por padrao. */
  regulares: CupomElegivel[]
  /** Usados DEPOIS do fim da parceria: pagaveis, mas o Financeiro escolhe um a um. */
  posFim: CupomElegivel[]
  excluidos: CupomExcluido[]
}

export type EntradaDaPrevia = {
  cupons: VendaComUso[]
  contrato: ContratoInfluencer
  /** null = nao ha periodo a fechar; so a escolha de pos-fim continua valendo. */
  periodo: Periodo | null
  /** `YYYY-MM-DD` do fim da parceria, ou null se ainda vigora. */
  fimDaParceria: string | null
  /** Cupons que ja constam em ALGUM item de lancamento (qualquer status). */
  emLancamento: Set<string>
}

export function previaDoFechamento(e: EntradaDaPrevia): Previa {
  const { cupons, contrato, periodo, fimDaParceria, emLancamento } = e
  const partnershipId = contrato.partnership_id as string
  const todas = vendasQueContam(cupons, contrato)
  // Cupom de OUTRA parceria nao e candidato deste fechamento: a posicao dele
  // conta (historico), mas o dinheiro e pago no fechamento da parceria dele.
  // Acusa-lo aqui como "deixado de fora" seria contar como perda o que sera
  // pago la. Cupom sem parceria (nulo) segue para o portao e aparece.
  const donos = new Map(cupons.map((c) => [c.id, c.partnership_id]))
  const daOutra = (id: string) => {
    const dono = donos.get(id)
    return dono != null && dono !== partnershipId
  }
  const noPeriodo = (dia: string) =>
    periodo !== null && dia >= periodo.de && dia <= periodo.ate && (!fimDaParceria || dia <= fimDaParceria)

  const excluidos: CupomExcluido[] = []

  // Regulares: nao pagos, no periodo, ate o fim da parceria.
  const candidatos = todas
    .filter((v) => !v.paid && noPeriodo(v.dia) && !daOutra(v.coupon_id))
    .map((v) => ({ coupon_id: v.coupon_id, valor: v.valor }))
  const { incluidos, excluidos: foraDaRegra } = filtrarInclusao(candidatos, cupons, partnershipId)
  excluidos.push(...foraDaRegra)
  const regulares: CupomElegivel[] = []
  for (const c of incluidos) {
    if (emLancamento.has(c.coupon_id)) excluidos.push({ ...c, motivo: MOTIVO_JA_EM_LANCAMENTO })
    else regulares.push(c)
  }

  // Ja pagos fora de lancamento: o mesmo portao dos demais antes de serem
  // contados, para nao acusar como "deixado de fora" o que nunca foi candidato.
  const pagos = todas
    .filter((v) => v.paid && noPeriodo(v.dia) && !emLancamento.has(v.coupon_id) && !daOutra(v.coupon_id))
    .map((v) => ({ coupon_id: v.coupon_id, valor: v.valor }))
  if (pagos.length > 0) {
    const gate = filtrarInclusao(pagos, cupons, partnershipId)
    excluidos.push(...gate.excluidos)
    for (const c of gate.incluidos) excluidos.push({ ...c, motivo: MOTIVO_PAGO_FORA })
  }

  // Pos-fim: so cupom DESTA parceria (os de outra nao sao candidatos aqui) e
  // ainda sem lancamento (os ja lancados sao pagamentos normais, nao ruido).
  const posFim: CupomElegivel[] = []
  if (fimDaParceria) {
    const depois = todas
      .filter(
        (v) =>
          !v.paid &&
          v.dia > fimDaParceria &&
          !emLancamento.has(v.coupon_id) &&
          donos.get(v.coupon_id) === partnershipId
      )
      .map((v) => ({ coupon_id: v.coupon_id, valor: v.valor }))
    const gate = filtrarInclusao(depois, cupons, partnershipId)
    excluidos.push(...gate.excluidos)
    posFim.push(...gate.incluidos)
  }

  return { regulares, posFim, excluidos }
}

/**
 * O que a rota realmente fecha. Sem lista (`ids` indefinido): so os regulares,
 * como sempre. Com lista (inclusive VAZIA): a INTERSECAO da lista com o conjunto
 * que o servidor calculou (regulares + pos-fim). Id fora desse conjunto — de
 * outro influenciador, ja em outro lancamento, inexistente, forjado — nunca e
 * inserido: e ignorado e contado. Lista vazia fecha nada (nao cai no periodo).
 */
export function intersecar(
  previa: Pick<Previa, 'regulares' | 'posFim'>,
  ids: string[] | undefined
): { escolhidos: CupomElegivel[]; ignorados: number } {
  if (ids === undefined) return { escolhidos: previa.regulares, ignorados: 0 }
  const pedidos = new Set(ids)
  const nosso = [...previa.regulares, ...previa.posFim]
  const escolhidos = nosso.filter((c) => pedidos.has(c.coupon_id))
  const conhecidos = new Set(nosso.map((c) => c.coupon_id))
  let ignorados = 0
  for (const id of pedidos) if (!conhecidos.has(id)) ignorados++
  return { escolhidos, ignorados }
}

// --- forma que a tela consome ----------------------------------------------

export type ItemDaPrevia = {
  coupon_id: string
  valor: number
  numero: string
  cliente: string | null
  usado_em: string | null
}

export type PreviaDaTela = {
  periodo: Periodo | null
  fimDaParceria: string | null
  regulares: ItemDaPrevia[]
  /** Soma dos regulares, calculada aqui (centavos), nao no navegador. */
  total: number
  posFim: ItemDaPrevia[]
  excluidos: { quantidade: number; valor: number; por_motivo: Record<string, number> }
}

export type CupomDeExibicao = VendaComUso & { coupon_number?: string; customer_name?: string | null }

export function previaParaTela(
  previa: Previa,
  cupons: CupomDeExibicao[],
  periodo: Periodo | null,
  fimDaParceria: string | null
): PreviaDaTela {
  const porId = new Map(cupons.map((c) => [c.id, c]))
  const item = (c: CupomElegivel): ItemDaPrevia => {
    const x = porId.get(c.coupon_id)
    return {
      coupon_id: c.coupon_id,
      valor: centavos(c.valor),
      numero: x?.coupon_number ?? '-',
      cliente: x?.customer_name ?? null,
      usado_em: x?.used_at ?? null,
    }
  }
  return {
    periodo,
    fimDaParceria,
    regulares: previa.regulares.map(item),
    total: somaDoLancamento(previa.regulares),
    posFim: previa.posFim.map(item),
    excluidos: resumoDeExcluidos(previa.excluidos),
  }
}
