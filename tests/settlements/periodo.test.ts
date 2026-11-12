import { describe, test, expect } from 'vitest'
import { periodoSugerido, cuponsElegiveis, cuponsJaPagos, hojeNoBalcao } from '@/lib/settlements/periodo'

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

describe('hojeNoBalcao', () => {
  test('21h30 de 30/06 em Brasilia ainda e junho, mesmo ja sendo julho em UTC', () => {
    const hoje = hojeNoBalcao(new Date('2026-07-01T00:30:00Z'))
    expect(hoje.getUTCMonth()).toBe(5)
    expect(periodoSugerido('mensal', { starts_at: '2026-05-01', ends_at: null, status: 'ativa' }, hoje))
      .toEqual({ de: '2026-05-01', ate: '2026-05-31' })
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

  // Cada motivo de exclusao sozinho, com um cupom valido ao lado como controle
  // positivo: o resultado esperado e exatamente ele, nunca uma lista vazia.
  const valido = cupom('ok', '2026-06-15')
  const soOValido = [{ coupon_id: 'ok', valor: 500 }]

  test('exclui cupom nao conferido', () => {
    const r = cuponsElegiveis([cupom('x', '2026-06-05', { verified: false }), valido], contrato, junho)
    expect(r).toEqual(soOValido)
  })

  test('exclui cupom ja pago', () => {
    const r = cuponsElegiveis([cupom('x', '2026-06-05', { paid: true }), valido], contrato, junho)
    expect(r).toEqual(soOValido)
  })

  test('cuponsJaPagos devolve so o pago do periodo, para a rota contar a exclusao', () => {
    const cupons = [
      cupom('pago', '2026-06-05', { paid: true }),
      cupom('pago-julho', '2026-07-05', { paid: true }),
      valido,
    ]
    expect(cuponsJaPagos(cupons, contrato, junho)).toEqual([{ coupon_id: 'pago', valor: 500 }])
    expect(cuponsElegiveis(cupons, contrato, junho)).toEqual(soOValido)
  })

  test('exclui cupom com used_at nulo', () => {
    const r = cuponsElegiveis([cupom('x', null), valido], contrato, junho)
    expect(r).toEqual(soOValido)
  })

  test('venda do balcao em 30/06 as 21h30 de Brasilia fecha em junho, nao em julho', () => {
    // 2026-07-01T00:30Z == 30/06 21h30 em Sao Paulo (UTC-3)
    const noite = cupom('noite', '2026-07-01T00:30:00.000Z')
    const julho = { de: '2026-07-01', ate: '2026-07-31' }
    expect(cuponsElegiveis([noite], contrato, junho)).toEqual([{ coupon_id: 'noite', valor: 500 }])
    expect(cuponsElegiveis([noite], contrato, julho)).toEqual([])
  })

  test('retrato do cupom vale mais que o contrato de hoje', () => {
    const r = cuponsElegiveis([cupom('c1', '2026-06-05', { commission_per_sale: 300 })], contrato, junho)
    expect(r).toEqual([{ coupon_id: 'c1', valor: 300 }])
  })

  test('cupom sem retrato usa o valor do contrato no instante de fechar', () => {
    const c750 = { ...contrato, commission_per_sale: 750 }
    const r = cuponsElegiveis([cupom('c1', '2026-06-05', { commission_per_sale: null })], c750, junho)
    expect(r).toEqual([{ coupon_id: 'c1', valor: 750 }])
  })

  test('venda ja paga ou de fora do periodo continua ocupando posicao', () => {
    // starts_at 2: a venda de junho (paga) e a numero 1; a de julho e a numero 2 e entra.
    // Se a posicao reiniciasse por periodo, a de julho viraria a 1 e ficaria de fora.
    const c2 = { ...contrato, commission_starts_at: 2 }
    const cupons = [cupom('jun', '2026-06-10', { paid: true }), cupom('jul', '2026-07-10')]
    const r = cuponsElegiveis(cupons, c2, { de: '2026-07-01', ate: '2026-07-31' })
    expect(r).toEqual([{ coupon_id: 'jul', valor: 500 }])
  })

  test("modo 'parceria' ignora cupom de outra parceria", () => {
    const cupons = [cupom('outra', '2026-06-05', { partnership_id: 'P2' }), valido]
    expect(cuponsElegiveis(cupons, contrato, junho)).toEqual(soOValido)
  })

  test("modo 'historico' conta cupom de outra parceria", () => {
    const hist = { ...contrato, commission_counts_from: 'historico' as const }
    const cupons = [cupom('outra', '2026-06-05', { partnership_id: 'P2' }), valido]
    expect(cuponsElegiveis(cupons, hist, junho)).toEqual([
      { coupon_id: 'outra', valor: 500 }, { coupon_id: 'ok', valor: 500 },
    ])
  })

  test('respeita commission_starts_at contando a posicao da venda por created_at', () => {
    const c2 = { ...contrato, commission_starts_at: 2 }
    // Fora de ordem de proposito: a posicao vem de created_at, nao da lista.
    const cupons = [cupom('b', '2026-06-20'), cupom('a', '2026-06-10')]
    expect(cuponsElegiveis(cupons, c2, junho)).toEqual([{ coupon_id: 'b', valor: 500 }])
  })
})
