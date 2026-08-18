import { describe, it, expect } from 'vitest'
import { can, isRole, ROLES, ROLE_LABELS, type Role } from '@/lib/auth/roles'

// Testes puros da matriz de permissoes. Nao tocam banco nem rede.
// Se alguem mexer na matriz sem querer, quebra aqui em milissegundos.

describe('papeis do sistema', () => {
  it('tem exatamente tres papeis', () => {
    expect(ROLES).toEqual(['admin', 'finance', 'moderator'])
  })

  it('nunca chama o lojista de "moderador" na interface', () => {
    // O valor de banco e 'moderator' por compatibilidade, mas a tela diz Lojista.
    // Ja enganou gente antes.
    expect(ROLE_LABELS.moderator).toBe('Lojista')
    expect(Object.values(ROLE_LABELS).join(' ')).not.toMatch(/moderador/i)
  })

  it('reconhece papel valido e recusa invalido', () => {
    expect(isRole('finance')).toBe(true)
    expect(isRole('store')).toBe(false)
    expect(isRole('superadmin')).toBe(false)
  })
})

describe('admin e superusuario', () => {
  it('pode todas as acoes, sem excecao', () => {
    const acoes = [
      'coupons.read', 'coupons.edit', 'coupons.delete', 'coupons.verify',
      'coupons.pay', 'coupons.invoice', 'validate', 'dashboard',
      'influencers.edit', 'campaigns.edit', 'settings',
    ] as const

    for (const acao of acoes) {
      expect(can('admin', acao), `admin deveria poder ${acao}`).toBe(true)
    }
  })
})

describe('financeiro', () => {
  it('confere, paga e preenche NF', () => {
    expect(can('finance', 'coupons.verify')).toBe(true)
    expect(can('finance', 'coupons.pay')).toBe(true)
    expect(can('finance', 'coupons.invoice')).toBe(true)
  })

  it('le cupons e ve o dashboard', () => {
    expect(can('finance', 'coupons.read')).toBe(true)
    expect(can('finance', 'dashboard')).toBe(true)
  })

  it('nao edita nem exclui cupom', () => {
    expect(can('finance', 'coupons.edit')).toBe(false)
    expect(can('finance', 'coupons.delete')).toBe(false)
  })

  it('nao valida no balcao nem mexe em configuracao', () => {
    expect(can('finance', 'validate')).toBe(false)
    expect(can('finance', 'settings')).toBe(false)
    expect(can('finance', 'campaigns.edit')).toBe(false)
    expect(can('finance', 'influencers.edit')).toBe(false)
  })
})

describe('lojista', () => {
  it('valida cupom no balcao e le a lista', () => {
    expect(can('moderator', 'validate')).toBe(true)
    expect(can('moderator', 'coupons.read')).toBe(true)
  })

  it('nao encosta em nada financeiro', () => {
    // O motivo de existir do sistema: o balcao nao pode se auto-certificar.
    expect(can('moderator', 'coupons.verify')).toBe(false)
    expect(can('moderator', 'coupons.pay')).toBe(false)
    expect(can('moderator', 'coupons.invoice')).toBe(false)
  })

  it('nao edita, nao exclui e nao ve o dashboard', () => {
    expect(can('moderator', 'coupons.edit')).toBe(false)
    expect(can('moderator', 'coupons.delete')).toBe(false)
    expect(can('moderator', 'dashboard')).toBe(false)
    expect(can('moderator', 'settings')).toBe(false)
  })
})

describe('papel ausente ou desconhecido', () => {
  it('nao pode nada', () => {
    for (const valor of [null, undefined, '', 'store', 'superadmin']) {
      expect(can(valor as unknown as Role, 'coupons.read')).toBe(false)
      expect(can(valor as unknown as Role, 'coupons.pay')).toBe(false)
    }
  })
})
