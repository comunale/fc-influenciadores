/**
 * A parceria: o acordo entre a FoxCycles e o influenciador.
 *
 * Existe como entidade desde 18/08/2026. Antes os termos eram campos soltos do
 * influenciador, e renovar sobrescrevia o passado -- o que obrigou a inventar um
 * commission_count_since so para lembrar quando a contagem tinha recomecado.
 *
 * O coupon_code NAO mora aqui, e sim no influenciador: o link esta na bio e no
 * story dele. Renovar troca para onde o link olha, nao o link.
 *
 * Modulo puro: sem banco e sem React.
 */
export type Parceria = {
  id: string
  status: string
  starts_at: string
  ends_at: string | null
  fee_amount: number
  fee_timing: string
  commission_per_sale: number
  commission_starts_at: number
  commission_counts_from: string
  payment_schedule: string
  discount_type: string
  discount_value: number
  validity_days: number
  coupon_title: string | null
  coupon_description: string | null
  /**
   * A parceria exige contrato aceito para o link ligar.
   *
   * Nasce true. As duas parcerias vigentes em 19/08 -- @caiiuxo e @mariananavi --
   * ficaram isentas: os links delas ja estavam em bio e story, e desliga-los
   * para cobrar assinatura retroativa quebraria divulgacao no ar por decisao
   * nossa. A trava protege link NOVO, que ninguem ainda usou.
   */
  contract_required?: boolean
  /**
   * Quando o influenciador aceitou. Copia do que esta em `contracts`, guardada
   * aqui para a regra do link nao precisar de uma consulta a mais nos sete
   * lugares que a chamam. A prova continua sendo o contrato.
   */
  contract_accepted_at?: string | null
}

/** A parceria ativa do influenciador. So existe uma (indice unico no banco). */
export function parceriaAtiva(parcerias: Parceria[] | null | undefined): Parceria | null {
  return (parcerias ?? []).find((p) => p.status === 'ativa') ?? null
}

/**
 * A parceria esta valendo agora?
 *
 * Ativa e dentro do prazo. Sem prazo definido significa sem fim.
 * Vale ATE o dia combinado, inclusive -- fechar no proprio dia tiraria um dia
 * de quem negociou.
 */
export function parceriaVigente(p: Parceria | null): boolean {
  if (!p || p.status !== 'ativa') return false
  if (!p.ends_at) return true
  return p.ends_at >= new Date().toISOString().slice(0, 10)
}

export function rotuloDesconto(p: { discount_type: string; discount_value: number }): string {
  return p.discount_type === 'fixed' ? `R$ ${p.discount_value}` : `${p.discount_value}%`
}
