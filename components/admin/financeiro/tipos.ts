/** Tipos e formatadores da tela do Financeiro. Sem React. */

export type ItemDoLancamento = {
  id: string
  valor: number
  coupons: { coupon_number: string; customer_name: string | null; used_at: string | null } | null
}

export type Lancamento = {
  id: string
  tipo: string
  status: 'aberto' | 'pago' | 'cancelado' | string
  periodo_de: string | null
  periodo_ate: string | null
  valor: number
  paid_at: string | null
  forma: string | null
  identificador: string | null
  created_at: string
  created_by: string | null
  settlement_items: ItemDoLancamento[]
}

export type ParceriaDoFinanceiro = {
  id: string
  status: string
  starts_at: string
  ends_at: string | null
  payment_schedule: string
  commission_per_sale: number
}

export type GrupoDoInfluenciador = {
  influencer: { id: string; name: string; instagram_handle: string | null }
  parcerias: (ParceriaDoFinanceiro & {
    sugerido: { de: string; ate: string } | null
    lancamentos: Lancamento[]
  })[]
}

export const brl = (n: number) =>
  Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/** `YYYY-MM-DD` -> `DD/MM/AAAA` sem passar por Date (nao desliza de dia por fuso). */
export function dia(iso: string | null): string {
  if (!iso) return '-'
  const [a, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

export const diaHora = (iso: string) => new Date(iso).toLocaleDateString('pt-BR')

export const SITUACAO: Record<string, { texto: string; classe: string }> = {
  aberto:    { texto: 'Aberto',    classe: 'bg-yellow-950 text-yellow-400' },
  pago:      { texto: 'Pago',      classe: 'bg-[#00ff87]/10 text-[#00ff87]' },
  cancelado: { texto: 'Cancelado', classe: 'bg-[#2a2a2a] text-gray-500' },
}

export const INPUT =
  'w-full h-10 px-3 rounded-lg border border-[#2a2a2a] bg-[#1e1e1e] text-white text-sm focus:border-[#00ff87] focus:outline-none'

/** Mensagem de erro de uma rota: o texto vem escrito para ser lido, entao passa como esta. */
export async function lerResposta(
  res: Response
): Promise<{ ok: boolean; data: Record<string, unknown>; erro: string }> {
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  const erro = typeof data.error === 'string' ? data.error : 'Não foi possível concluir a operação.'
  return { ok: res.ok, data, erro }
}
