import { createClient } from '@/lib/supabase/server'
import { formatCurrency } from '@/lib/utils'
import { AddInfluencerForm } from '@/components/admin/AddInfluencerForm'

export default async function InfluencersPage() {
  const supabase = await createClient()

  const [{ data: influencers }, { data: campaigns }] = await Promise.all([
    supabase
      .from('influencers')
      .select('*, campaigns(name), coupons(status)')
      .order('created_at', { ascending: false }),
    supabase.from('campaigns').select('id, name').eq('active', true),
  ])

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://fc-influenciadores.vercel.app'

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Influencers</h1>
      </div>

      {/* Formulário novo influencer */}
      <div className="bg-[#141414] border border-[#1e1e1e] rounded-xl p-6">
        <h2 className="text-white font-semibold mb-4">Adicionar Influencer</h2>
        <AddInfluencerForm campaigns={campaigns || []} />
      </div>

      {/* Lista */}
      <div className="flex flex-col gap-3">
        {(influencers || []).map((inf) => {
          const couponsArr = (inf.coupons as { status: string }[]) || []
          const total = couponsArr.length
          const used = couponsArr.filter((c) => c.status === 'used').length
          const pending = couponsArr.filter((c) => c.status === 'pending').length
          const link = `${siteUrl}/c/${inf.coupon_code}`

          return (
            <div
              key={inf.id}
              className="bg-[#141414] border border-[#1e1e1e] rounded-xl p-5 flex flex-col md:flex-row md:items-center gap-4"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-white font-semibold">{inf.name}</span>
                  <span className="text-[#00ff87] text-sm">{inf.instagram_handle}</span>
                  {!inf.active && (
                    <span className="text-xs text-red-400 bg-red-950 px-2 py-0.5 rounded-full">Inativo</span>
                  )}
                </div>
                <div className="text-gray-500 text-xs mb-2">
                  Campanha: {(inf.campaigns as { name: string })?.name}
                </div>
                <div className="flex gap-4 text-xs">
                  <span className="text-gray-400">{total} cupons</span>
                  <span className="text-[#00ff87]">{used} vendas</span>
                  <span className="text-gray-500">{pending} pendentes</span>
                </div>
                <div className="text-xs text-gray-600 mt-2 font-mono">{link}</div>
              </div>

              <div className="flex gap-2 flex-wrap">
                <div className="text-center bg-[#1e1e1e] rounded-lg px-4 py-2">
                  <div className="text-xs text-gray-500">Fee</div>
                  <div className="text-white font-bold text-sm">{formatCurrency(inf.fee_amount)}</div>
                </div>
                <div className="text-center bg-[#1e1e1e] rounded-lg px-4 py-2">
                  <div className="text-xs text-gray-500">Comissão</div>
                  <div className="text-[#00ff87] font-bold text-sm">{formatCurrency(inf.commission_per_sale)}</div>
                </div>
                <button
                  onClick={() => {}}
                  className="h-10 px-4 rounded-lg border border-[#2a2a2a] text-gray-400 text-xs hover:text-white hover:border-[#00ff87] transition-colors"
                  title="Copiar link"
                >
                  Copiar link
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
