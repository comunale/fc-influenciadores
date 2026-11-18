import { describe, test, expect } from 'vitest'
import { previaDoFechamento } from '@/lib/settlements/previa'
import type { VendaComUso } from '@/lib/settlements/types'
import type { ContratoInfluencer } from '@/lib/commission'

/**
 * O cupom do Programa de Indicação NÃO entra em fechamento de parceria.
 *
 * O prêmio dele não é comissão: não tem parceria, não tem influenciador, e quem
 * paga é o César por fora. A rota de fechar já filtra por `influencer_id`, e um
 * cupom de indicação tem `influencer_id` nulo — então ele nunca chega à lista.
 *
 * Estes testes são a SEGUNDA trava, e foram escritos depois de medir: a prévia
 * já recusava o cupom sem parceria nos dois modos de contagem, inclusive no
 * `historico`, que é o generoso. Eles existem para que isso continue verdade
 * quando alguém mexer em `vendasQueContam` — a regressão aqui pagaria R$ 200 de
 * indicação dentro do fechamento de um influenciador, em dinheiro de verdade.
 */

function contrato(counts: 'parceria' | 'historico'): ContratoInfluencer {
  return {
    partnership_id: 'p1',
    commission_per_sale: 500,
    commission_starts_at: 1,
    commission_counts_from: counts,
  } as ContratoInfluencer
}

function venda(over: Partial<VendaComUso> = {}): VendaComUso {
  return {
    id: 'c1',
    created_at: '2026-11-05T12:00:00Z',
    used_at: '2026-11-05T12:00:00Z',
    verified: true,
    paid: false,
    commission_per_sale: 500,
    partnership_id: 'p1',
    status: 'used',
    ...over,
  } as VendaComUso
}

/** Como um cupom de indicação chega aqui, se chegar: sem parceria. */
const cupomDeIndicacao = venda({
  id: 'ind1',
  created_at: '2026-11-06T12:00:00Z',
  used_at: '2026-11-06T12:00:00Z',
  commission_per_sale: 200,
  partnership_id: null,
})

const PERIODO = { de: '2026-11-01', ate: '2026-11-30' }

describe('cupom de indicação e fechamento de parceria', () => {
  test('cupom de parceria entra, com o valor da parceria', () => {
    const p = previaDoFechamento({
      cupons: [venda()],
      contrato: contrato('parceria'),
      periodo: PERIODO,
      fimDaParceria: null,
      emLancamento: new Set(),
    })
    expect(p.regulares).toEqual([{ coupon_id: 'c1', valor: 500 }])
  })

  test.each(['parceria', 'historico'] as const)(
    'cupom de indicação não entra nem como regular nem como pós-fim (modo %s)',
    (modo) => {
      const p = previaDoFechamento({
        cupons: [venda(), cupomDeIndicacao],
        contrato: contrato(modo),
        periodo: PERIODO,
        fimDaParceria: null,
        emLancamento: new Set(),
      })

      expect([...p.regulares, ...p.posFim].map((c) => c.coupon_id)).toEqual(['c1'])
      expect(p.regulares.reduce((s, c) => s + c.valor, 0)).toBe(500)
    }
  )

  test('o cupom de indicação é recusado por não ter parceria, e o motivo diz isso', () => {
    const p = previaDoFechamento({
      cupons: [venda(), cupomDeIndicacao],
      contrato: contrato('historico'),
      periodo: PERIODO,
      fimDaParceria: null,
      emLancamento: new Set(),
    })
    expect(p.excluidos).toEqual([
      { coupon_id: 'ind1', valor: 200, motivo: 'cupom sem parceria' },
    ])
  })
})
