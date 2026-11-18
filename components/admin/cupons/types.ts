// Tipos da tela unificada de Cupons.
// Esta tela substituiu Participantes e Cupons, que consultavam a MESMA tabela
// com a MESMA query e existiam em duplicidade.

export type CouponRow = {
  id: string
  coupon_number: string
  customer_name: string
  customer_cpf: string
  customer_phone: string
  customer_email: string | null
  status: string
  created_at: string
  // Nulo no cupom do Programa de Indicacao: ele nao vence (migration 036).
  expires_at: string | null
  used_at: string | null
  used_by_admin: string | null
  // Conferência financeira
  verified: boolean
  verified_at: string | null
  verified_by: string | null
  paid: boolean
  paid_at: string | null
  paid_by: string | null
  invoice_number: string | null
  // Vendedor reivindicado no balcão. É um fato DIFERENTE de used_by_admin,
  // que é o login que operou o sistema. O par é o que revela padrão.
  seller_id: string | null
  // Retrato gravado no cupom (migration 008): o que valia quando ele nasceu.
  discount_type: string | null
  discount_value: number | null
  commission_per_sale: number | null
  sellers: { id: string; name: string; store_name: string } | null
  // UM dono por cupom (migration 036): influenciador OU indicador.
  influencers: { id: string; name: string; instagram_handle: string } | null
  indicadores: { id: string; nome: string } | null
  campaigns: { name: string } | null
  // Lancamento do Financeiro a que o cupom pertence (PostgREST devolve objeto
  // ou lista, conforme a cardinalidade inferida). Ausente/nulo = em nenhum.
  settlement_items?: { settlements: { status: string } | null } | { settlements: { status: string } | null }[] | null
}

export type InfluencerOption = { id: string; name: string; instagram_handle: string }

export const STATUS = {
  pending:   { label: 'Pendente',  color: 'text-gray-300 bg-[#1e1e1e]' },
  used:      { label: 'Usado',     color: 'text-[#00ff87] bg-[#00ff87]/10' },
  expired:   { label: 'Expirado',  color: 'text-red-400 bg-red-950' },
  cancelled: { label: 'Cancelado', color: 'text-red-400 bg-red-950' },
}

export function formatCpf(cpf: string) {
  return cpf?.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') ?? ''
}

/**
 * O desconto vem do RETRATO gravado no cupom (migration 008). Antes era lido da
 * campanha, o que faria os cupons antigos mudarem de valor a cada renovacao do
 * influenciador.
 */
export function discountLabel(c: CouponRow) {
  if (c.discount_type == null || c.discount_value == null) return '—'
  return c.discount_type === 'fixed' ? `R$ ${c.discount_value}` : `${c.discount_value}%`
}

/**
 * De qual programa o cupom veio.
 *
 * Existe porque, desde a migration 036, "Influencer: —" na lista deixou de
 * significar "dado faltando" e passou a significar "é de outro programa". Sem
 * nomear a origem, quem lê a tela não tem como saber qual dos dois é.
 */
export function origemDoCupom(c: CouponRow): 'parceria' | 'indicacao' | 'desconhecida' {
  if (c.influencers) return 'parceria'
  if (c.indicadores) return 'indicacao'
  return 'desconhecida'
}

export const ORIGEM_LABEL: Record<ReturnType<typeof origemDoCupom>, string> = {
  parceria: 'Parceria',
  indicacao: 'Indicação',
  desconhecida: '—',
}

/** Quem indicou, qualquer que seja o programa. */
export function quemIndicou(c: CouponRow): string {
  if (c.influencers) return c.influencers.instagram_handle
  if (c.indicadores) return c.indicadores.nome
  return '—'
}
