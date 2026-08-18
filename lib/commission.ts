/**
 * Calculo de comissao do influenciador. Modulo puro: sem banco, sem React e sem
 * data do sistema, para ser testavel e reaproveitavel.
 *
 * Ate 18/08/2026 commission_per_sale e commission_starts_at eram gravados no
 * cadastro e NUNCA lidos para calcular nada -- o sistema nunca soube responder
 * quanto se devia a um influenciador. Este modulo e essa resposta, e e a base
 * do encerramento de parceria e do portal do influenciador.
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
  /** Vendas que contam como venda (aprovadas pelo Financeiro). */
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
 * `verified` = aprovado pelo Financeiro contra a NF. Confirmado pelo Cesar em
 * 18/08: "sim, o financeiro tem que aprovar". Coerente com a corrente
 * NF -> Conferido -> Pago, que existe justamente para autorizar pagamento.
 *
 * Isolado numa constante para a regra comercial poder mudar em um lugar so.
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
