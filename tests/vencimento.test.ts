import { describe, it, expect } from 'vitest'
import { janelaDeVencimento, diasAteVencer } from '@/lib/coupons/vencimento'

const agora = new Date('2026-10-10T12:00:00Z')

describe('janelaDeVencimento', () => {
  it('vai de agora ate daqui a N dias', () => {
    const j = janelaDeVencimento(7, agora)
    expect(j.de).toBe('2026-10-10T12:00:00.000Z')
    expect(j.ate).toBe('2026-10-17T12:00:00.000Z')
  })

  it('comeca em agora, nao no inicio do dia', () => {
    // Cupom que ja venceu nao e "vencendo", e vencido.
    expect(janelaDeVencimento(15, agora).de).toContain('12:00:00')
  })
})

describe('diasAteVencer', () => {
  it('conta os dias inteiros que faltam', () => {
    expect(diasAteVencer('2026-10-17T12:00:00Z', agora)).toBe(7)
    expect(diasAteVencer('2026-10-11T12:00:00Z', agora)).toBe(1)
  })

  it('arredonda para cima', () => {
    // 30 horas vira "2 dias": dizer menos do que se tem faz ligar antes da
    // hora; dizer mais faz perder a venda.
    expect(diasAteVencer('2026-10-11T18:00:00Z', agora)).toBe(2)
  })

  it('devolve negativo para o que ja passou', () => {
    expect(diasAteVencer('2026-10-08T12:00:00Z', agora)).toBe(-2)
  })

  it('vence hoje conta como zero', () => {
    expect(diasAteVencer('2026-10-10T12:00:00Z', agora)).toBe(0)
  })
})
