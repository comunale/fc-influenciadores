import { describe, it, expect } from 'vitest'
import { parceriaAtiva, parceriaVigente, rotuloDesconto, type Parceria } from '@/lib/partnership'

const base: Parceria = {
  id: 'p1', status: 'ativa', starts_at: '2026-06-01', ends_at: null,
  fee_amount: 500, fee_timing: 'inicio',
  commission_per_sale: 500, commission_starts_at: 1, commission_counts_from: 'parceria',
  payment_schedule: 'fim',
  discount_type: 'fixed', discount_value: 300, validity_days: 60,
  coupon_title: null, coupon_description: null,
}

const ontem = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
const amanha = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
const hoje = new Date().toISOString().slice(0, 10)

describe('parceriaAtiva', () => {
  it('sem parcerias, devolve null', () => {
    expect(parceriaAtiva([])).toBeNull()
  })

  it('escolhe a ativa, ignorando as encerradas', () => {
    const encerrada = { ...base, id: 'p0', status: 'encerrada' }
    expect(parceriaAtiva([encerrada, base])?.id).toBe('p1')
  })

  it('so encerradas devolve null', () => {
    expect(parceriaAtiva([{ ...base, status: 'encerrada' }])).toBeNull()
  })
})

describe('parceriaVigente', () => {
  it('null nao esta vigente', () => {
    expect(parceriaVigente(null)).toBe(false)
  })

  it('ativa sem prazo esta vigente', () => {
    expect(parceriaVigente(base)).toBe(true)
  })

  it('ativa com prazo no futuro esta vigente', () => {
    expect(parceriaVigente({ ...base, ends_at: amanha })).toBe(true)
  })

  it('vale ate o ultimo dia, inclusive', () => {
    // Fechar no proprio dia tiraria um dia de quem negociou.
    expect(parceriaVigente({ ...base, ends_at: hoje })).toBe(true)
  })

  it('prazo vencido nao esta vigente', () => {
    expect(parceriaVigente({ ...base, ends_at: ontem })).toBe(false)
  })

  it('encerrada nao esta vigente, mesmo dentro do prazo', () => {
    // Encerrar e ato deliberado: vence o prazo.
    expect(parceriaVigente({ ...base, status: 'encerrada', ends_at: amanha })).toBe(false)
  })
})

describe('rotuloDesconto', () => {
  it('valor fixo sai em reais', () => {
    expect(rotuloDesconto({ discount_type: 'fixed', discount_value: 300 })).toBe('R$ 300')
  })

  it('percentual sai com o simbolo', () => {
    expect(rotuloDesconto({ discount_type: 'percentage', discount_value: 15 })).toBe('15%')
  })
})
