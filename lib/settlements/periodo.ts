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
 * Dia civil do balcao em que o cupom foi usado.
 *
 * `used_at` e gravado com toISOString(), sempre em UTC. Uma venda no balcao em
 * 30/06 as 21h30 de Brasilia vira `2026-07-01T00:30Z`; fatiar os 10 primeiros
 * caracteres jogaria essa venda no fechamento do mes errado (decisao de
 * 11/11/2026). A loja e presencial, em Campinas: vale a data de Sao Paulo.
 * Data pura (`YYYY-MM-DD`) ja e dia civil e passa direto.
 */
function diaDoBalcao(usedAt: string): string {
  if (usedAt.length === 10) return usedAt
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(usedAt))
}

/**
 * "Hoje" no balcao: o dia civil de Sao Paulo, devolvido como um Date cujos
 * campos UTC sao esse dia (meio-dia, longe de qualquer virada). periodoSugerido
 * le getUTC*; entre 21h e meia-noite em Brasilia o UTC ja virou o mes e a tela
 * ofereceria fechar um mes que ainda nao acabou aqui.
 */
export function hojeNoBalcao(agora: Date): Date {
  return new Date(diaDoBalcao(agora.toISOString()) + 'T12:00:00Z')
}

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
/**
 * @deprecated Nao use em codigo de producao: nao passa pelo portao de inclusao
 * (status, conferencia, parceria), nao olha lancamentos existentes e nao conhece
 * a regra de pos-fim. Use previaDoFechamento (lib/settlements/previa.ts). Fica
 * so porque os testes de periodo.test.ts a usam como especificacao do recorte.
 */
export function cuponsElegiveis(
  cupons: VendaComUso[],
  contrato: ContratoInfluencer,
  periodo: Periodo
): CupomElegivel[] {
  return percorrer(cupons, contrato, periodo, false)
}

/**
 * O espelho de cuponsElegiveis: os cupons do periodo que ja constam como
 * `paid = true`. Quem fecha precisa contá-los, porque cuponsElegiveis os
 * descarta em silêncio e o total sairia completo na aparência. A rota separa
 * os que estão em lançamento (normais) dos pagos fora de lançamento (anteriores
 * a esta funcionalidade), e só estes viram exclusão contada.
 */
/** @deprecated Ver cuponsElegiveis: use previaDoFechamento. */
export function cuponsJaPagos(
  cupons: VendaComUso[],
  contrato: ContratoInfluencer,
  periodo: Periodo
): CupomElegivel[] {
  return percorrer(cupons, contrato, periodo, true)
}

/** Uma venda que conta para comissao, com o valor que acrescenta e o dia do balcao. */
export type VendaQueConta = { coupon_id: string; valor: number; dia: string; paid: boolean }

/**
 * Todas as vendas conferidas que CONTAM para comissao (a posicao decidida por
 * calcularComissao), pagas ou nao, sem recorte de periodo. Base comum de
 * cuponsElegiveis, cuponsJaPagos e da previa do fechamento.
 */
export function vendasQueContam(cupons: VendaComUso[], contrato: ContratoInfluencer): VendaQueConta[] {
  const conferidas = cupons
    .filter((c) => c.verified)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))

  const resultado: VendaQueConta[] = []
  let anterior = calcularComissao(contrato, [])

  for (let i = 0; i < conferidas.length; i++) {
    const atual = calcularComissao(contrato, conferidas.slice(0, i + 1))
    const c = conferidas[i]
    const entra = atual.vendasQueContam > anterior.vendasQueContam
    const dia = c.used_at ? diaDoBalcao(c.used_at) : null

    if (entra && dia) {
      resultado.push({
        coupon_id: c.id,
        valor: atual.comissaoGerada - anterior.comissaoGerada,
        dia,
        paid: Boolean(c.paid),
      })
    }
    anterior = atual
  }
  return resultado
}

function percorrer(
  cupons: VendaComUso[],
  contrato: ContratoInfluencer,
  periodo: Periodo,
  pagos: boolean
): CupomElegivel[] {
  return vendasQueContam(cupons, contrato)
    .filter((v) => v.paid === pagos && v.dia >= periodo.de && v.dia <= periodo.ate)
    .map((v) => ({ coupon_id: v.coupon_id, valor: v.valor }))
}
