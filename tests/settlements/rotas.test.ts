import { describe, test, expect } from 'vitest'
import {
  PAPEIS_DO_LIVRO,
  somaDoLancamento,
  centavos,
  filtrarInclusao,
  resumoDeExcluidos,
  camposDeFechamento,
  camposDePagamento,
  validarPagamento,
  recusaDeFechar,
  recusaDeCancelar,
  recusaDePagar,
  traduzErroDoLivro,
} from '@/lib/settlements/rotas'

const UUID = '3f2b8c1e-5d4a-4e6b-9c7d-1a2b3c4d5e6f'

describe('guarda de papel', () => {
  test('as rotas aceitam so admin e finance', () => {
    expect([...PAPEIS_DO_LIVRO]).toEqual(['admin', 'finance'])
    for (const fora of ['moderator', 'influencer', '']) {
      expect((PAPEIS_DO_LIVRO as readonly string[]).includes(fora)).toBe(false)
    }
  })
})

describe('allowlist de fechar', () => {
  test('aceita so partnership_id e periodo, ignora o resto', () => {
    const r = camposDeFechamento({
      partnership_id: UUID, periodo: { de: '2026-10-01', ate: '2026-10-31' },
      valor: 9999, status: 'pago', tipo: 'fixo',
    })
    expect(r).toEqual({
      ok: true, partnership_id: UUID, periodo: { de: '2026-10-01', ate: '2026-10-31' },
    })
  })
  test('recusa parceria que nao e uuid e periodo invertido ou malformado', () => {
    expect(camposDeFechamento({ partnership_id: 'x', periodo: { de: '2026-10-01', ate: '2026-10-31' } }).ok).toBe(false)
    expect(camposDeFechamento({ partnership_id: UUID, periodo: { de: '2026-10-31', ate: '2026-10-01' } }).ok).toBe(false)
    expect(camposDeFechamento({ partnership_id: UUID, periodo: { de: '31/10/2026', ate: '2026-10-31' } }).ok).toBe(false)
    expect(camposDeFechamento({ partnership_id: UUID }).ok).toBe(false)
    expect(camposDeFechamento(null).ok).toBe(false)
  })
})

describe('allowlist de pagar', () => {
  test('aceita so paid_at, forma e identificador', () => {
    expect(camposDePagamento({ paid_at: 'x', forma: 'PIX', status: 'cancelado', valor: 1 }))
      .toEqual({ paid_at: 'x', forma: 'PIX' })
    expect(camposDePagamento({ paid_at: 'x', forma: 'PIX', identificador: ' E123 ' }))
      .toEqual({ paid_at: 'x', forma: 'PIX', identificador: 'E123' })
  })
  test('campo do tipo errado some em vez de passar', () => {
    expect(camposDePagamento({ paid_at: 5, forma: { a: 1 } })).toEqual({})
    expect(camposDePagamento(null)).toEqual({})
  })
  test('validacao exige data real e forma preenchida', () => {
    expect(validarPagamento({ paid_at: '2026-11-10', forma: 'PIX' })).toBeNull()
    expect(validarPagamento({ paid_at: '2026-11-10T14:00:00Z', forma: 'PIX' })).toBeNull()
    expect(validarPagamento({ paid_at: 'x', forma: 'PIX' })).toMatch(/data/i)
    expect(validarPagamento({ forma: 'PIX' })).toMatch(/data/i)
    expect(validarPagamento({ paid_at: '2026-11-10', forma: '   ' })).toMatch(/forma/i)
    expect(validarPagamento({ paid_at: '2026-11-10' })).toMatch(/forma/i)
  })
})

describe('recusas por estado', () => {
  test('fechar recusa periodo sem cupom elegivel com 422', () => {
    const r = recusaDeFechar([])
    expect(r?.status).toBe(422)
    expect(r?.error).toMatch(/nenhum cupom/i)
    expect(recusaDeFechar([{ coupon_id: 'a', valor: 10 }])).toBeNull()
  })
  test('cancelar recusa lancamento pago com 409', () => {
    expect(recusaDeCancelar('pago')?.status).toBe(409)
    expect(recusaDeCancelar('cancelado')?.status).toBe(409)
    expect(recusaDeCancelar('aberto')).toBeNull()
  })
  test('pagar recusa comissao sem itens, mas aceita fixo e restituicao sem itens', () => {
    expect(recusaDePagar('aberto', 'comissao', 0)?.status).toBe(409)
    expect(recusaDePagar('aberto', 'comissao', 3)).toBeNull()
    expect(recusaDePagar('aberto', 'fixo', 0)).toBeNull()
    expect(recusaDePagar('aberto', 'restituicao', 0)).toBeNull()
  })
  test('pagar so aceita lancamento aberto', () => {
    expect(recusaDePagar('aberto')).toBeNull()
    expect(recusaDePagar('pago')?.status).toBe(409)
    expect(recusaDePagar('cancelado')?.status).toBe(409)
  })
})

describe('traducao de erro do banco', () => {
  test('cupom duplicado em outro lancamento vira 409', () => {
    const r = traduzErroDoLivro({ code: '23505', message: 'duplicate key value violates unique constraint "settlement_items_coupon_unico"' })
    expect(r.status).toBe(409)
    expect(r.error).toMatch(/outro lan/i)
  })
  test('recusa do trigger de itens vira 422 com a mensagem do banco', () => {
    const r = traduzErroDoLivro({ message: 'Cupom nao entra no lancamento: cupom nao conferido' })
    expect(r.status).toBe(422)
    expect(r.error).toContain('cupom nao conferido')
  })
  test('imutabilidade vira 409; o resto vira 500 sem vazar SQL', () => {
    expect(traduzErroDoLivro({ message: 'Lancamento pago e imutavel: nao se apaga' }).status).toBe(409)
    const r = traduzErroDoLivro({ message: 'relation "x" does not exist' })
    expect(r.status).toBe(500)
    expect(r.error).not.toContain('relation')
  })
})

describe('somaDoLancamento', () => {
  test('ruido de ponto flutuante nao vai para o livro', () => {
    expect(somaDoLancamento([{ coupon_id: 'a', valor: 0.1 }, { coupon_id: 'b', valor: 0.2 }])).toBe(0.3)
  })
  test('lancamento vazio soma zero', () => {
    expect(somaDoLancamento([])).toBe(0)
  })
  test('soma dos itens arredondados, nao total arredondado (fecha ao centavo)', () => {
    const itens = [0.333, 0.333, 0.333].map((valor, i) => ({ coupon_id: String(i), valor }))
    expect(somaDoLancamento(itens)).toBe(0.99)
    expect(itens.reduce((s, c) => s + centavos(c.valor), 0)).toBeCloseTo(0.99, 10)
  })
  test('valores reais de comissao somam exato', () => {
    expect(somaDoLancamento([30, 30, 12.5].map((valor, i) => ({ coupon_id: String(i), valor })))).toBe(72.5)
  })
})

describe('filtrarInclusao', () => {
  const base = { verified: true, paid: false, created_at: '2026-10-01', commission_per_sale: 10, used_at: '2026-10-05T15:00:00Z' }
  const P = 'p1'
  const cupons = [
    { ...base, id: 'ok', status: 'used', partnership_id: P },
    { ...base, id: 'outra', status: 'used', partnership_id: 'p0' },
    { ...base, id: 'nulo', status: 'used', partnership_id: null },
    { ...base, id: 'pendente', status: 'pending', partnership_id: P },
    { ...base, id: 'semdata', status: 'used', partnership_id: P, used_at: null },
    { ...base, id: 'naoconf', status: 'used', partnership_id: P, verified: false },
  ]
  const elegiveis = cupons.map((c) => ({ coupon_id: c.id, valor: 10 }))

  test('so entra cupom da parceria do lancamento que passa nas condicoes do trigger', () => {
    const r = filtrarInclusao(elegiveis, cupons, P)
    expect(r.incluidos.map((c) => c.coupon_id)).toEqual(['ok'])
    expect(Object.fromEntries(r.excluidos.map((e) => [e.coupon_id, e.motivo]))).toEqual({
      outra: 'cupom de outra parceria',
      nulo: 'cupom sem parceria',
      pendente: 'cupom nao foi usado no balcao',
      semdata: 'cupom sem data de uso',
      naoconf: 'cupom nao conferido',
    })
  })
  test('resumo conta e soma o que ficou de fora', () => {
    const r = filtrarInclusao(elegiveis, cupons, P)
    expect(resumoDeExcluidos(r.excluidos)).toEqual({
      quantidade: 5,
      valor: 50,
      por_motivo: {
        'cupom de outra parceria': 1,
        'cupom sem parceria': 1,
        'cupom nao foi usado no balcao': 1,
        'cupom sem data de uso': 1,
        'cupom nao conferido': 1,
      },
    })
    expect(resumoDeExcluidos([])).toEqual({ quantidade: 0, valor: 0, por_motivo: {} })
  })
})

describe('erros da funcao settlement_pagar', () => {
  test('cada recusa da funcao vira um status legivel', () => {
    expect(traduzErroDoLivro({ message: 'apenas admin ou financeiro' }).status).toBe(403)
    expect(traduzErroDoLivro({ message: 'lancamento inexistente ou nao esta aberto' }).status).toBe(409)
    expect(traduzErroDoLivro({ message: 'lancamento de comissao sem itens' }).status).toBe(409)
    expect(traduzErroDoLivro({ message: 'pagamento sem data ou forma' }).status).toBe(400)
    const r = traduzErroDoLivro({ message: 'cupom nao conferido: FOX123, FOX456' })
    expect(r.status).toBe(422)
    expect(r.error).toContain('FOX123, FOX456')
  })

  test('cupom ja marcado como pago a mao: 409 que nomeia os cupons e a saida', () => {
    const r = traduzErroDoLivro({ message: 'cupom ja marcado como pago: FOX-1, FOX-2' })
    expect(r.status).toBe(409)
    expect(r.error).toContain('FOX-1, FOX-2')
    expect(r.error).toMatch(/administrador/i)
  })

  test('trava de pagamento de lancamento fechado vira 409 legivel, nao 500', () => {
    const r = traduzErroDoLivro({
      message: 'Cupom de lancamento fechado (pago ou cancelado) nao pode ter o pagamento desfeito ou alterado.',
    })
    expect(r.status).toBe(409)
  })
})
