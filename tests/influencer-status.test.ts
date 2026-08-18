import { describe, it, expect } from 'vitest'
import { linkAtivo, motivoLinkInativo, venceEmAte } from '@/lib/influencer-status'
import type { Parceria } from '@/lib/partnership'

const base: Parceria = {
  id: 'p1', status: 'ativa', starts_at: '2026-06-01', ends_at: null,
  fee_amount: 0, fee_timing: 'inicio',
  commission_per_sale: 500, commission_starts_at: 1, commission_counts_from: 'parceria',
  payment_schedule: 'fim',
  discount_type: 'fixed', discount_value: 300, validity_days: 60,
  coupon_title: null, coupon_description: null,
}
const p = (ends_at: string | null, status = 'ativa'): Parceria => ({ ...base, ends_at, status })

const ontem = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
const amanha = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
const daquiA20 = new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10)
const daquiA60 = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10)

describe('linkAtivo', () => {
  it('abre com influencer ativo e parceria vigente', () => {
    expect(linkAtivo({ active: true }, p(null))).toBe(true)
  })

  it('abre com prazo no futuro', () => {
    expect(linkAtivo({ active: true }, p(amanha))).toBe(true)
  })

  it('fecha quando a parceria venceu', () => {
    expect(linkAtivo({ active: true }, p(ontem))).toBe(false)
  })

  it('fecha quando a parceria foi encerrada', () => {
    expect(linkAtivo({ active: true }, p(amanha, 'encerrada'))).toBe(false)
  })

  it('fecha com influencer inativo, mesmo com parceria vigente', () => {
    expect(linkAtivo({ active: false }, p(amanha))).toBe(false)
  })

  it('fecha quando nao ha parceria nenhuma', () => {
    expect(linkAtivo({ active: true }, null)).toBe(false)
  })

  it('nao depende da campanha', () => {
    // A regressao de 18/08: campanha desativada matou 17 de 18 links. A funcao
    // nem recebe campanha -- nao ha como voltar a acontecer.
    expect(linkAtivo({ active: true }, p(null))).toBe(true)
  })
})

describe('motivoLinkInativo', () => {
  it('nao da motivo quando esta no ar', () => {
    expect(motivoLinkInativo({ active: true }, p(null))).toBeNull()
  })

  it('inativo tem precedencia sobre prazo vencido', () => {
    expect(motivoLinkInativo({ active: false }, p(ontem))).toBe('Influencer inativo')
  })

  it('explica a falta de parceria', () => {
    expect(motivoLinkInativo({ active: true }, null)).toBe('Sem parceria')
  })

  it('explica a parceria encerrada', () => {
    expect(motivoLinkInativo({ active: true }, p(amanha, 'encerrada'))).toBe('Parceria encerrada')
  })

  it('explica o prazo vencido', () => {
    expect(motivoLinkInativo({ active: true }, p(ontem))).toBe('Parceria vencida')
  })
})

describe('venceEmAte', () => {
  it('sem prazo nunca vence', () => {
    expect(venceEmAte(p(null), 30)).toBe(false)
  })

  it('vencendo dentro da janela', () => {
    expect(venceEmAte(p(daquiA20), 30)).toBe(true)
  })

  it('vencendo depois da janela nao conta', () => {
    expect(venceEmAte(p(daquiA60), 30)).toBe(false)
  })

  it('ja vencido nao conta como vencendo', () => {
    expect(venceEmAte(p(ontem), 30)).toBe(false)
  })

  it('parceria encerrada nao conta', () => {
    expect(venceEmAte(p(daquiA20, 'encerrada'), 30)).toBe(false)
  })
})
