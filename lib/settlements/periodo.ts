/**
 * Qual periodo fechar e quais cupons entram nele. Modulo puro: sem banco, sem
 * React e sem data do sistema.
 *
 * `hoje` entra por parametro, nunca `new Date()` aqui dentro, pelo mesmo motivo
 * de lib/coupons/vencimento.ts: data do sistema no corpo de uma funcao de
 * logica a torna impura e impossivel de testar sem relogio falso.
 */
import { calcularComissao, type ContratoInfluencer } from '@/lib/commission'
import type { CupomElegivel, Periodo, VendaComUso } from './types'

type ParceriaParaPeriodo = {
  starts_at: string
  ends_at: string | null
  status: 'ativa' | 'encerrada'
}

/** Data ISO `YYYY-MM-DD` em UTC, para nao deslizar de dia por fuso. */
const iso = (d: Date) => d.toISOString().slice(0, 10)

/**
 * O periodo que o Financeiro deveria fechar agora, ou null se ainda nao ha.
 *
 * 'mensal': o mes civil anterior a `hoje`. Mes corrente nunca e proposto, pois
 * ainda recebe vendas. Se a parceria comecou no meio desse mes, `de` recua para
 * `starts_at`; se so comecou depois dele, nao ha o que fechar.
 *
 * 'fim': so existe periodo quando a parceria encerrou, e e a vida inteira dela.
 */
export function periodoSugerido(
  schedule: 'fim' | 'mensal',
  parceria: ParceriaParaPeriodo,
  hoje: Date
): Periodo | null {
  if (schedule === 'fim') {
    if (parceria.status !== 'encerrada' || !parceria.ends_at) return null
    return { de: parceria.starts_at, ate: parceria.ends_at }
  }

  const ano = hoje.getUTCFullYear()
  const mes = hoje.getUTCMonth()
  const primeiro = iso(new Date(Date.UTC(ano, mes - 1, 1)))
  // Dia 0 do mes corrente e o ultimo dia do anterior.
  const ultimo = iso(new Date(Date.UTC(ano, mes, 0)))

  if (parceria.starts_at > ultimo) return null
  return { de: parceria.starts_at > primeiro ? parceria.starts_at : primeiro, ate: ultimo }
}

/**
 * Cupons que entram no fechamento do periodo, com o valor de cada um.
 *
 * Recorta por `used_at` (quando o cliente usou o cupom na loja), nunca por
 * `verified_at`: a conferencia do Financeiro pode acontecer semanas depois, e
 * recortar por ela faria uma venda de junho cair no fechamento de julho.
 *
 * A regra de `commission_starts_at` NAO e reimplementada: a posicao da venda e
 * decidida por calcularComissao. Como ela so devolve totais, descobrimos o que
 * cada cupom acrescenta olhando a diferenca entre o resumo com ele e sem ele.
 * A posicao e contada sobre todas as vendas conferidas do contrato, inclusive
 * as ja pagas e as de fora do periodo, igual ao calculo que o sistema ja usa;
 * so depois se recorta o que e deste fechamento.
 */
export function cuponsElegiveis(
  cupons: VendaComUso[],
  contrato: ContratoInfluencer,
  periodo: Periodo
): CupomElegivel[] {
  const conferidas = cupons
    .filter((c) => c.verified)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))

  const resultado: CupomElegivel[] = []
  let anterior = calcularComissao(contrato, [])

  for (let i = 0; i < conferidas.length; i++) {
    const atual = calcularComissao(contrato, conferidas.slice(0, i + 1))
    const c = conferidas[i]
    const entra = atual.vendasQueContam > anterior.vendasQueContam
    const dia = c.used_at?.slice(0, 10)

    if (entra && !c.paid && dia && dia >= periodo.de && dia <= periodo.ate) {
      resultado.push({ coupon_id: c.id, valor: atual.comissaoGerada - anterior.comissaoGerada })
    }
    anterior = atual
  }
  return resultado
}
