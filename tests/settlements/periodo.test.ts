import { describe, test, expect } from 'vitest'
import { periodoSugerido, cuponsElegiveis } from '@/lib/settlements/periodo'

describe('periodoSugerido', () => {
  test('mensal sugere o mes anterior fechado', () => {
    const p = periodoSugerido('mensal',
      { starts_at: '2026-06-01', ends_at: null, status: 'ativa' }, new Date('2026-07-15T12:00:00Z'))
    expect(p).toEqual({ de: '2026-06-01', ate: '2026-06-30' })
  })

  test('mensal nao sugere mes que ainda nao virou', () => {
    const p = periodoSugerido('mensal',
      { starts_at: '2026-07-01', ends_at: null, status: 'ativa' }, new Date('2026-07-15T12:00:00Z'))
    expect(p).toBeNull()
  })

  test('fim so sugere quando a parceria encerrou', () => {
    expect(periodoSugerido('fim',
      { starts_at: '2026-05-25', ends_at: null, status: 'ativa' }, new Date('2026-09-01T12:00:00Z'))).toBeNull()
    expect(periodoSugerido('fim',
      { starts_at: '2026-05-25', ends_at: '2026-08-18', status: 'encerrada' }, new Date('2026-09-01T12:00:00Z')))
      .toEqual({ de: '2026-05-25', ate: '2026-08-18' })
  })

  test('mensal nao propoe periodo anterior ao inicio da parceria', () => {
    const p = periodoSugerido('mensal',
      { starts_at: '2026-06-10', ends_at: null, status: 'ativa' }, new Date('2026-07-05T12:00:00Z'))
    expect(p).toEqual({ de: '2026-06-10', ate: '2026-06-30' })
  })
})

describe('cuponsElegiveis', () => {
  const contrato = { commission_per_sale: 500, commission_starts_at: 1, fee_amount: 0,
                     commission_counts_from: 'parceria' as const, partnership_id: 'P1' }
  const junho = { de: '2026-06-01', ate: '2026-06-30' }
  const cupom = (id: string, data: string | null, extra = {}) => ({
    id, verified: true, paid: false, created_at: data ?? '2026-06-01', used_at: data,
    commission_per_sale: 500, partnership_id: 'P1', ...extra,
  })

  test('recorta por used_at, nao por verified_at', () => {
    const cupons = [cupom('c1', '2026-06-05'), cupom('c2', '2026-07-02')]
    expect(cuponsElegiveis(cupons, contrato, junho)).toEqual([{ coupon_id: 'c1', valor: 500 }])
  })

  test('exclui nao conferido, ja pago e used_at nulo', () => {
    const cupons = [
      cupom('c1', '2026-06-05', { verified: false }),
      cupom('c2', '2026-06-06', { paid: true }),
      cupom('c3', null),
    ]
    expect(cuponsElegiveis(cupons, contrato, junho)).toEqual([])
  })

  test('cupom sem retrato usa o valor do contrato no instante de fechar', () => {
    const cupons = [cupom('c1', '2026-06-05', { commission_per_sale: null })]
    expect(cuponsElegiveis(cupons, contrato, junho)).toEqual([{ coupon_id: 'c1', valor: 500 }])
  })

  test('respeita commission_starts_at contando a posicao da venda por created_at', () => {
    const c2 = { ...contrato, commission_starts_at: 2 }
    // Fora de ordem de proposito: a posicao vem de created_at, nao da lista.
    const cupons = [cupom('b', '2026-06-20'), cupom('a', '2026-06-10')]
    expect(cuponsElegiveis(cupons, c2, junho)).toEqual([{ coupon_id: 'b', valor: 500 }])
  })
})
