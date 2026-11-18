import { describe, test, expect } from 'vitest'
import { podeGerar } from '@/lib/indicacao/link'

describe('podeGerar', () => {
  test('ativo e sem teto: gera', () => {
    expect(podeGerar({ ativo: true, teto_usos: null }, 999)).toEqual({ ok: true })
  })

  test('ativo, teto 10, 9 usos: gera', () => {
    expect(podeGerar({ ativo: true, teto_usos: 10 }, 9)).toEqual({ ok: true })
  })

  test('teto 10 com 10 usos: recusa nomeando o limite', () => {
    const r = podeGerar({ ativo: true, teto_usos: 10 }, 10)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.erro).toContain('10')
  })

  test('teto 10 com 11 usos: recusa', () => {
    expect(podeGerar({ ativo: true, teto_usos: 10 }, 11).ok).toBe(false)
  })

  test('encerrado: recusa dizendo que o beneficio foi encerrado', () => {
    const r = podeGerar({ ativo: false, teto_usos: null }, 0)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.erro).toMatch(/encerrad/i)
  })

  // Quem foi encerrado pela empresa nao deve ouvir falar de limite: a recusa do
  // encerramento vem ANTES da do teto, mesmo quando as duas valem.
  test('encerrado E com teto batido: fala do encerramento, nao do teto', () => {
    const r = podeGerar({ ativo: false, teto_usos: 10 }, 10)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.erro).toMatch(/encerrad/i)
    expect(r.erro).not.toContain('10')
  })
})
