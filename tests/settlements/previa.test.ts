import { describe, test, expect } from 'vitest'
import {
  intersecar,
  previaDoFechamento,
  previaParaTela,
  MOTIVO_JA_EM_LANCAMENTO,
  MOTIVO_PAGO_FORA,
} from '@/lib/settlements/previa'
import { camposDeFechamento } from '@/lib/settlements/rotas'

const contrato = {
  commission_per_sale: 500,
  commission_starts_at: 1,
  fee_amount: 0,
  commission_counts_from: 'historico' as const,
  partnership_id: 'P1',
}
const outubro = { de: '2026-10-01', ate: '2026-10-31' }
const cupom = (id: string, data: string, extra = {}) => ({
  id,
  status: 'used',
  verified: true,
  paid: false,
  created_at: data,
  used_at: data + 'T15:00:00Z',
  commission_per_sale: 500,
  partnership_id: 'P1',
  ...extra,
})
const base = { contrato, periodo: outubro, fimDaParceria: null, emLancamento: new Set<string>() }
const ids = (l: { coupon_id: string }[]) => l.map((c) => c.coupon_id)

describe('previaDoFechamento', () => {
  test('regulares: so o periodo, nao pago, conferido e da parceria', () => {
    const p = previaDoFechamento({
      ...base,
      cupons: [cupom('a', '2026-10-05'), cupom('b', '2026-10-20'), cupom('c', '2026-11-02')],
    })
    expect(ids(p.regulares)).toEqual(['a', 'b'])
    expect(p.posFim).toEqual([])
    expect(p.excluidos).toEqual([])
  })

  test('cupom ja em outro lancamento fica de fora e e contado', () => {
    const p = previaDoFechamento({
      ...base,
      cupons: [cupom('a', '2026-10-05'), cupom('b', '2026-10-20')],
      emLancamento: new Set(['b']),
    })
    expect(ids(p.regulares)).toEqual(['a'])
    expect(p.excluidos.map((e) => [e.coupon_id, e.motivo])).toEqual([['b', MOTIVO_JA_EM_LANCAMENTO]])
  })

  test('pago fora de lancamento e contado com o motivo proprio', () => {
    const p = previaDoFechamento({
      ...base,
      cupons: [cupom('a', '2026-10-05'), cupom('velho', '2026-10-06', { paid: true })],
    })
    expect(ids(p.regulares)).toEqual(['a'])
    expect(p.excluidos.map((e) => [e.coupon_id, e.motivo])).toEqual([['velho', MOTIVO_PAGO_FORA]])
  })

  test('pago que ESTA em lancamento e pagamento normal: nao e exclusao', () => {
    const p = previaDoFechamento({
      ...base,
      cupons: [cupom('a', '2026-10-05'), cupom('ja', '2026-10-06', { paid: true })],
      emLancamento: new Set(['ja']),
    })
    expect(p.excluidos).toEqual([])
  })

  test('pago de OUTRA parceria nao e acusado como deixado de fora desta (e nao soma o valor)', () => {
    const p = previaDoFechamento({
      ...base,
      cupons: [cupom('a', '2026-10-05'), cupom('alheio', '2026-10-06', { paid: true, partnership_id: 'P0' })],
    })
    expect(p.excluidos.map((e) => e.motivo)).toEqual(['cupom de outra parceria'])
    expect(p.excluidos.some((e) => e.motivo === MOTIVO_PAGO_FORA)).toBe(false)
  })

  test('usado depois do fim da parceria vai para posFim, nunca para regulares', () => {
    const p = previaDoFechamento({
      ...base,
      periodo: { de: '2026-10-01', ate: '2026-10-31' },
      fimDaParceria: '2026-10-15',
      cupons: [cupom('dentro', '2026-10-10'), cupom('depois', '2026-10-20'), cupom('muito-depois', '2026-12-03')],
    })
    expect(ids(p.regulares)).toEqual(['dentro'])
    expect(ids(p.posFim)).toEqual(['depois', 'muito-depois'])
  })

  test('posFim ignora cupom de outra parceria e cupom ja lancado, sem ruido', () => {
    const p = previaDoFechamento({
      ...base,
      fimDaParceria: '2026-10-15',
      cupons: [
        cupom('depois', '2026-10-20'),
        cupom('de-outra', '2026-10-21', { partnership_id: 'P0' }),
        cupom('lancado', '2026-10-22'),
      ],
      emLancamento: new Set(['lancado']),
    })
    expect(ids(p.posFim)).toEqual(['depois'])
    expect(p.excluidos).toEqual([])
  })

  test('sem periodo, so a escolha de posFim continua valendo', () => {
    const p = previaDoFechamento({
      ...base,
      periodo: null,
      fimDaParceria: '2026-03-31',
      cupons: [cupom('a', '2026-03-10'), cupom('depois', '2026-04-10')],
    })
    expect(p.regulares).toEqual([])
    expect(ids(p.posFim)).toEqual(['depois'])
  })
})

describe('intersecar', () => {
  const previa = {
    regulares: [{ coupon_id: 'r1', valor: 500 }, { coupon_id: 'r2', valor: 500 }],
    posFim: [{ coupon_id: 'p1', valor: 500 }, { coupon_id: 'p2', valor: 500 }],
  }

  test('sem lista: so os regulares, como sempre', () => {
    expect(intersecar(previa, undefined)).toEqual({ escolhidos: previa.regulares, ignorados: 0 })
  })

  test('lista VAZIA nao cai no periodo: fecha nada', () => {
    expect(intersecar(previa, [])).toEqual({ escolhidos: [], ignorados: 0 })
  })

  test('posFim so entra se pedido; o que nao foi pedido fica de fora', () => {
    const r = intersecar(previa, ['r1', 'p2'])
    expect(ids(r.escolhidos)).toEqual(['r1', 'p2'])
    expect(r.ignorados).toBe(0)
  })

  test('id de outro influenciador, ja lancado ou forjado: ignorado e contado, nunca inserido', () => {
    const r = intersecar(previa, ['r1', 'de-outro-influenciador', 'ja-em-outro-lancamento', 'forjado'])
    expect(ids(r.escolhidos)).toEqual(['r1'])
    expect(r.ignorados).toBe(3)
  })

  test('so ids estranhos: nada escolhido', () => {
    expect(intersecar(previa, ['x'])).toEqual({ escolhidos: [], ignorados: 1 })
  })
})

describe('previaParaTela', () => {
  test('total arredondado a centavos e itens com dados de exibicao', () => {
    const cupons = [
      { ...cupom('a', '2026-10-05'), coupon_number: 'FOX-1', customer_name: 'Ana' },
      { ...cupom('b', '2026-10-06'), coupon_number: 'FOX-2', customer_name: null },
    ]
    const previa = {
      regulares: [{ coupon_id: 'a', valor: 0.1 }, { coupon_id: 'b', valor: 0.2 }],
      posFim: [],
      excluidos: [],
    }
    const t = previaParaTela(previa, cupons, outubro, null)
    expect(t.total).toBe(0.3)
    expect(t.regulares[0]).toMatchObject({ numero: 'FOX-1', cliente: 'Ana', valor: 0.1 })
    expect(t.excluidos).toEqual({ quantidade: 0, valor: 0, por_motivo: {} })
  })
})

describe('camposDeFechamento: cupom_ids', () => {
  const corpo = { partnership_id: '11111111-1111-1111-1111-111111111111', periodo: { de: '2026-10-01', ate: '2026-10-31' } }
  const id = '22222222-2222-2222-2222-222222222222'

  test('ausente fica ausente; vazia e preservada como vazia', () => {
    expect(camposDeFechamento(corpo)).not.toHaveProperty('cupom_ids')
    expect(camposDeFechamento({ ...corpo, cupom_ids: [] })).toMatchObject({ ok: true, cupom_ids: [] })
  })

  test('deduplica e valida', () => {
    expect(camposDeFechamento({ ...corpo, cupom_ids: [id, id] })).toMatchObject({ ok: true, cupom_ids: [id] })
    expect(camposDeFechamento({ ...corpo, cupom_ids: ['x'] })).toMatchObject({ ok: false })
    expect(camposDeFechamento({ ...corpo, cupom_ids: 'nao-e-lista' })).toMatchObject({ ok: false })
  })
})
