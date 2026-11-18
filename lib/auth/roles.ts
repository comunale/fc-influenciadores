export type Role = 'admin' | 'finance' | 'moderator' | 'influencer' | 'indicador'

/**
 * Os papeis INTERNOS -- os que aparecem no seletor de Configuracoes e os unicos
 * que /api/admin/create-user aceita.
 *
 * 'influencer' fica de fora de proposito. Ele so existe amarrado a um registro
 * de influenciador (constraint admin_profiles_vinculo_coerente, migration 014),
 * entao nasce apenas pela rota dedicada. Criar um pela tela de usuarios
 * produziria uma conta sem dono, que o banco recusa -- melhor nem oferecer.
 */
export const ROLES: Role[] = ['admin', 'finance', 'moderator']

// Rótulo de tela. "moderator" é o lojista — o valor de banco ficou por
// compatibilidade, mas a interface nunca deve dizer "moderador".
export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrador',
  finance: 'Financeiro',
  moderator: 'Lojista',
  influencer: 'Influenciador',
  // Programa de Indicacao (036). Nao e papel interno: nao entra em ROLES, e
  // can() responde false para ele em tudo -- a area dele e separada.
  indicador: 'Participante do Programa de Indicação',
}

export type Action =
  | 'coupons.read'
  | 'coupons.edit'
  | 'coupons.delete'
  | 'coupons.verify'
  | 'coupons.pay'
  | 'coupons.invoice'
  | 'validate'
  | 'coupons.express'
  | 'dashboard'
  | 'influencers.edit'
  | 'influencers.payment'
  | 'campaigns.edit'
  | 'settings'
  | 'indicadores.edit'

/**
 * O que cada papel pode no sistema interno.
 *
 * 'influencer' nao aparece em linha nenhuma, e isso e a regra: can() responde
 * false para tudo. O portal dele nao passa por esta matriz -- e uma area
 * separada, so de leitura, e o que ele ve la e decidido pela RLS.
 */
const MATRIX: Record<Action, Role[]> = {
  'coupons.read':     ['admin', 'finance', 'moderator'],
  'coupons.edit':     ['admin'],
  'coupons.delete':   ['admin'],
  'coupons.verify':   ['admin', 'finance'],
  // So admin marca "Pago" cupom a cupom. O Financeiro paga pela tela do
  // Financeiro (lancamento), que e atomica e respeita o livro.
  'coupons.pay':      ['admin'],
  'coupons.invoice':  ['admin', 'finance'],
  'validate':         ['admin', 'moderator'],
  // Cadastro express no balcao: so admin, como saida de emergencia. O Lojista
  // perdeu em 18/08 -- era o caminho que permitia inventar uma indicacao.
  'coupons.express':  ['admin'],
  'dashboard':        ['admin', 'finance'],
  'influencers.edit': ['admin'],
  // Dado bancario: so quem paga. O Lojista nao le nem pela API (RLS na tabela).
  'influencers.payment': ['admin', 'finance'],
  'campaigns.edit':   ['admin'],
  'settings':         ['admin'],
  // Teto de usos e encerramento do beneficio: o Financeiro e o gestor desse
  // programa, junto com o admin (decisao 9 da spec de 17/11).
  'indicadores.edit': ['admin', 'finance'],
}

export function can(role: string | null | undefined, action: Action): boolean {
  if (!role) return false
  return MATRIX[action].includes(role as Role)
}

export function isRole(value: string): value is Role {
  return (ROLES as string[]).includes(value)
}
