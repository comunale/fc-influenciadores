import { createClient, getUserRole } from '@/lib/supabase/server'
import { InfluencersList } from '@/components/admin/InfluencersList'
import { calcularComissao } from '@/lib/commission'

export const dynamic = 'force-dynamic'

export default async function InfluencersPage() {
  const [role, supabase] = await Promise.all([getUserRole(), createClient()])

  const [{ data: influencers }, { data: campaigns }] = await Promise.all([
    supabase
      .from('influencers')
      .select('*, campaigns(name), coupons(id, status, verified, paid, created_at, commission_per_sale)')
      .order('name'),
    supabase.from('campaigns').select('id, name, discount_type, discount_value, validity_days, coupon_title, coupon_description').eq('active', true),
  ])

  const enriched = (influencers || []).map((inf) => {
    const couponsArr = (inf.coupons as { status: string }[]) || []
    const comissao = calcularComissao(
      {
        commission_per_sale: inf.commission_per_sale,
        commission_starts_at: inf.commission_starts_at,
        fee_amount: inf.fee_amount,
        commission_count_since: inf.commission_count_since,
      },
      (inf.coupons as { id: string; verified: boolean; paid: boolean; created_at: string; commission_per_sale: number | null }[]) || []
    )

    return {
      ...inf,
      comissao,
      campaign_name: (inf.campaigns as { name: string } | null)?.name ?? '',
      total_coupons: couponsArr.length,
      used_coupons: couponsArr.filter((c) => c.status === 'used').length,
      pending_coupons: couponsArr.filter((c) => c.status === 'pending').length,
    }
  })

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <InfluencersList influencers={enriched} campaigns={campaigns || []} canEdit={role === 'admin'} />
    </div>
  )
}
