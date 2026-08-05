export type Role = 'admin' | 'finance' | 'moderator'

export const ROLES: Role[] = ['admin', 'finance', 'moderator']

// Rótulo de tela. "moderator" é o lojista — o valor de banco ficou por
// compatibilidade, mas a interface nunca deve dizer "moderador".
export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrador',
  finance: 'Financeiro',
  moderator: 'Lojista',
}

export type Action =
  | 'coupons.read'
  | 'coupons.edit'
  | 'coupons.delete'
  | 'coupons.verify'
  | 'coupons.pay'
  | 'coupons.invoice'
  | 'validate'
  | 'dashboard'
  | 'influencers.edit'
  | 'campaigns.edit'
  | 'settings'

const MATRIX: Record<Action, Role[]> = {
  'coupons.read':     ['admin', 'finance', 'moderator'],
  'coupons.edit':     ['admin'],
  'coupons.delete':   ['admin'],
  'coupons.verify':   ['admin', 'finance'],
  'coupons.pay':      ['admin', 'finance'],
  'coupons.invoice':  ['admin', 'finance'],
  'validate':         ['admin', 'moderator'],
  'dashboard':        ['admin', 'finance'],
  'influencers.edit': ['admin'],
  'campaigns.edit':   ['admin'],
  'settings':         ['admin'],
}

export function can(role: string | null | undefined, action: Action): boolean {
  if (!role) return false
  return MATRIX[action].includes(role as Role)
}

export function isRole(value: string): value is Role {
  return (ROLES as string[]).includes(value)
}
