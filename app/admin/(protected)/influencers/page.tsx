import { createClient, getUserRole } from '@/lib/supabase/server'
import { InfluencersList } from '@/components/admin/InfluencersList'
import { calcularComissao } from '@/lib/commission'

export const dynamic = 'force-dynamic'

export default async function InfluencersPage() {
  const [role, supabase] = await Promise.all([getUserRole(), createClient()])

  const [{ data: influencers }, { data: campaigns }] = await Promise.all([
    supabase
      .from('influencers')
      .select('*, campaigns(name, active), coupons(id, status, verified, paid, created_at)')
      .order('name'),
    supabase.from('campaigns').select('id, name').eq('active', true),
  ])

  const enriched = (influencers || []).map((inf) => {
    const couponsArr = (inf.coupons as { status: string }[]) || []
    const comissao = calcularComissao(
      {
        commission_per_sale: inf.commission_per_sale,
        commission_starts_at: inf.commission_starts_at,
        fee_amount: inf.fee_amount,
      },
      (inf.coupons as { id: string; verified: boolean; paid: boolean; created_at: string }[]) || []
    )

    return {
      ...inf,
      comissao,
      campaign_name: (inf.campaigns as { name: string } | null)?.name ?? '',
      campaign_active: (inf.campaigns as { active: boolean } | null)?.active ?? false,
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
