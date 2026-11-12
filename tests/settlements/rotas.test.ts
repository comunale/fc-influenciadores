import { describe, test, expect } from 'vitest'
import {
  PAPEIS_DO_LIVRO,
  papelPodeLancar,
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
  test('so admin e finance passam', () => {
    expect(papelPodeLancar('admin')).toBe(true)
    expect(papelPodeLancar('finance')).toBe(true)
    expect(papelPodeLancar('moderator')).toBe(false)
    expect(papelPodeLancar('influencer')).toBe(false)
    expect(papelPodeLancar('')).toBe(false)
    expect(papelPodeLancar(null)).toBe(false)
    expect([...PAPEIS_DO_LIVRO]).toEqual(['admin', 'finance'])
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
