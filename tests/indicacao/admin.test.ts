import { describe, test, expect } from 'vitest'
import { can, isRole, ROLES, ROLE_LABELS } from '@/lib/auth/roles'

describe('permissão da tela de indicadores', () => {
  test('teto e encerramento: admin e financeiro editam; lojista e influenciador não', () => {
    expect(can('admin', 'indicadores.edit')).toBe(true)
    expect(can('finance', 'indicadores.edit')).toBe(true)
    expect(can('moderator', 'indicadores.edit')).toBe(false)
    expect(can('influencer', 'indicadores.edit')).toBe(false)
    expect(can('indicador', 'indicadores.edit')).toBe(false)
  })

  test('indicador não pode nada no sistema interno', () => {
    const acoes = [
      'coupons.read',
      'coupons.edit',
      'coupons.verify',
      'coupons.pay',
      'validate',
      'dashboard',
      'settings',
      'indicadores.edit',
    ] as const
    for (const a of acoes) expect(can('indicador', a)).toBe(false)
  })

  test('indicador NÃO é papel interno: não aparece no seletor nem em create-user', () => {
    expect(ROLES).not.toContain('indicador')
    expect(isRole('indicador')).toBe(false)
  })

  test('o rótulo de tela existe, e lojista continua sendo Lojista', () => {
    expect(ROLE_LABELS.indicador).toBeTruthy()
    expect(ROLE_LABELS.moderator).toBe('Lojista')
  })
})
