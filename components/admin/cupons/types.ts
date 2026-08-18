// Tipos da tela unificada de Cupons.
// Esta tela substituiu Participantes e Cupons, que consultavam a MESMA tabela
// com a MESMA query e existiam em duplicidade.

export type CouponRow = {
  id: string
  coupon_number: string
  customer_name: string
  customer_cpf: string
  customer_phone: string
  customer_email: string
  status: string
  created_at: string
  expires_at: string
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
  influencers: { id: string; name: string; instagram_handle: string } | null
  campaigns: { name: string } | null
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
