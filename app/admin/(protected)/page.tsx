import { createClient } from '@/lib/supabase/server'
import { formatCurrency, formatDateTime } from '@/lib/utils'

export default async function AdminDashboard() {
  const supabase = await createClient()

  // Buscar métricas em paralelo
  const [
    { count: totalCoupons },
    { count: usedCoupons },
    { count: expiredCoupons },
    { data: recentCoupons },
    { data: influencers },
  ] = await Promise.all([
    supabase.from('coupons').select('*', { count: 'exact', head: true }),
    supabase.from('coupons').select('*', { count: 'exact', head: true }).eq('status', 'used'),
    supabase.from('coupons').select('*', { count: 'exact', head: true }).eq('status', 'expired'),
    supabase.from('coupons')
      .select('*, influencers(name, instagram_handle)')
      .order('created_at', { ascending: false })
      .limit(10),
    supabase.from('influencers')
      .select('id, name, instagram_handle, coupons(status)')
      .eq('active', true),
  ])

  const total = totalCoupons || 0
  const used = usedCoupons || 0
  const expired = expiredCoupons || 0
  const conversionRate = total > 0 ? ((used / total) * 100).toFixed(1) : '0.0'

  // Ranking de influencers
  const ranking = (influencers || []).map((inf) => {
    const couponsArr = (inf.coupons as { status: string }[]) || []
    return {
      ...inf,
      total: couponsArr.length,
      used: couponsArr.filter((c) => c.status === 'used').length,
    }
  }).sort((a, b) => b.used - a.used)

  const metrics = [
    { label: 'Cupons Gerados', value: total, color: 'text-white' },
    { label: 'Vendas Realizadas', value: used, color: 'text-[#00ff87]' },
    { label: 'Expirados', value: expired, color: 'text-red-400' },
    { label: 'Taxa de Conversão', value: `${conversionRate}%`, color: 'text-yellow-400' },
  ]

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 flex flex-col gap-8">
      <h1 className="text-2xl font-bold text-white">Dashboard</h1>

      {/* Métricas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {metrics.map((m) => (
          <div key={m.label} className="bg-[#141414] border border-[#1e1e1e] rounded-xl p-5">
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">{m.label}</div>
            <div className={`text-3xl font-black ${m.color}`}>{m.value}</div>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Ranking influencers */}
        <div className="bg-[#141414] border border-[#1e1e1e] rounded-xl p-5">
          <h2 className="text-white font-bold mb-4">Ranking de Influencers</h2>
          <div className="flex flex-col gap-2">
            {ranking.map((inf, i) => (
              <div key={inf.id} className="flex items-center gap-3">
                <span className="text-gray-600 text-sm w-5">{i + 1}</span>
                <div className="flex-1">
                  <div className="text-white text-sm font-medium">{inf.instagram_handle}</div>
                  <div className="text-gray-500 text-xs">{inf.total} cupons · {inf.used} vendas</div>
                </div>
                <span className="text-[#00ff87] font-bold text-sm">{inf.used} ✓</span>
              </div>
            ))}
          </div>
        </div>

        {/* Últimos cupons */}
        <div className="bg-[#141414] border border-[#1e1e1e] rounded-xl p-5">
          <h2 className="text-white font-bold mb-4">Cupons Recentes</h2>
          <div className="flex flex-col gap-2">
            {(recentCoupons || []).map((c) => (
              <div key={c.id} className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-white text-sm font-mono truncate">{c.coupon_number}</div>
                  <div className="text-gray-500 text-xs truncate">{c.customer_name}</div>
                </div>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                  c.status === 'used' ? 'bg-[#00ff87]/10 text-[#00ff87]' :
                  c.status === 'expired' ? 'bg-red-950 text-red-400' :
                  'bg-[#1e1e1e] text-gray-400'
                }`}>
                  {c.status === 'used' ? 'Usado' : c.status === 'expired' ? 'Expirado' : 'Pendente'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
