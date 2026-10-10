import { createClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/utils'
import { venceEmAte } from '@/lib/influencer-status'
import { janelaDeVencimento, diasAteVencer } from '@/lib/coupons/vencimento'
import { parceriaAtiva, type Parceria } from '@/lib/partnership'
import Link from 'next/link'

export default async function AdminDashboard() {
  const supabase = await createClient()

  // Buscar métricas em paralelo
  const [
    { count: totalCoupons },
    { count: usedCoupons },
    { count: expiredCoupons },
    { data: recentCoupons },
    { data: influencers },
    { data: vencendoCupons },
  ] = await Promise.all([
    supabase.from('coupons').select('*', { count: 'exact', head: true }),
    supabase.from('coupons').select('*', { count: 'exact', head: true }).eq('status', 'used'),
    supabase.from('coupons').select('*', { count: 'exact', head: true }).eq('status', 'expired'),
    supabase.from('coupons')
      .select('*, influencers(name, instagram_handle)')
      .order('created_at', { ascending: false })
      .limit(10),
    supabase.from('influencers')
      .select('id, name, instagram_handle, active, partnerships(*), coupons(status)')
      .eq('active', true),
    // Cupom pendente com data chegando. O cliente pegou e não usou -- é onde
    // mora a venda que ainda dá para salvar.
    supabase.from('coupons')
      .select('id, coupon_number, expires_at, customer_name, influencers(instagram_handle)')
      .eq('status', 'pending')
      .gte('expires_at', janelaDeVencimento(15).de)
      .lte('expires_at', janelaDeVencimento(15).ate)
      .order('expires_at'),
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

  // Parcerias que vencem nos proximos 30 dias. Depois da data o link para de
  // funcionar sozinho -- este bloco existe para o Cesar fechar as vendas e
  // pagar a comissao antes disso acontecer.
  // O prazo vive na parceria desde 18/08/2026, nao mais no influenciador.
  const vencendo = (influencers || [])
    .map((i) => ({ ...i, parceria: parceriaAtiva(i.partnerships as Parceria[] | null) }))
    .filter((i) => venceEmAte(i.parceria, 30))
    .sort((a, b) => (a.parceria?.ends_at ?? '').localeCompare(b.parceria?.ends_at ?? ''))

  const cuponsVencendo = (vencendoCupons ?? []) as unknown as {
    id: string; coupon_number: string; expires_at: string; customer_name: string
    influencers: { instagram_handle: string } | null
  }[]
  const em7 = cuponsVencendo.filter((c) => diasAteVencer(c.expires_at) <= 7)

  const metrics = [
    { label: 'Cupons Gerados', value: total, color: 'text-white' },
    { label: 'Vendas Realizadas', value: used, color: 'text-[#00ff87]' },
    { label: 'Expirados', value: expired, color: 'text-red-400' },
    { label: 'Taxa de Conversão', value: `${conversionRate}%`, color: 'text-yellow-400' },
  ]

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 flex flex-col gap-8">
      <h1 className="text-2xl font-bold text-white">Dashboard</h1>

      {vencendo.length > 0 && (
        <div className="bg-yellow-950/30 border border-yellow-900 rounded-xl p-5">
          <h2 className="text-yellow-400 font-bold">
            {vencendo.length} parceria{vencendo.length !== 1 ? 's' : ''} vencendo em 30 dias
          </h2>
          <p className="text-gray-400 text-xs mt-1 mb-3">
            Depois da data o link para de funcionar. Prorrogue ou renove antes, e feche
            as comissões do período.
          </p>
          <div className="flex flex-col gap-1">
            {vencendo.map((i) => (
              <div key={i.id} className="flex items-center justify-between text-sm">
                <span className="text-white">{i.instagram_handle}</span>
                <span className="text-yellow-400">até {formatDate(i.parceria!.ends_at!)}</span>
              </div>
            ))}
          </div>
          <Link href="/admin/influencers?vencendo=1"
            className="inline-block mt-3 text-xs text-yellow-400 hover:text-yellow-300 underline">
            Ver na lista de influencers
          </Link>
        </div>
      )}

      {cuponsVencendo.length > 0 && (
        <div className="bg-[#141414] border border-[#2a2a2a] rounded-xl p-5">
          <h2 className="text-white font-bold">
            {cuponsVencendo.length} cupom{cuponsVencendo.length !== 1 ? 's' : ''} vencendo
            {em7.length > 0 && (
              <span className="text-yellow-400 font-normal text-sm">
                {' '}— {em7.length} em 7 dias ou menos
              </span>
            )}
          </h2>
          <p className="text-gray-500 text-xs mt-1 mb-3">
            Pessoas que pegaram o cupom e ainda não usaram. Depois da data o
            desconto some e a venda vai junto.
          </p>
          <div className="flex flex-col gap-1">
            {cuponsVencendo.slice(0, 8).map((c) => {
              const dias = diasAteVencer(c.expires_at)
              return (
                <div key={c.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-gray-300 truncate">
                    {c.customer_name.split(/s+/)[0]}
                    {c.influencers && (
                      <span className="text-gray-600"> · {c.influencers.instagram_handle}</span>
                    )}
                  </span>
                  <span className={dias <= 7 ? 'text-yellow-400 whitespace-nowrap' : 'text-gray-500 whitespace-nowrap'}>
                    {dias <= 0 ? 'vence hoje' : `em ${dias} dia${dias !== 1 ? 's' : ''}`}
                  </span>
                </div>
              )
            })}
          </div>
          {cuponsVencendo.length > 8 && (
            <p className="text-gray-600 text-xs mt-2">e mais {cuponsVencendo.length - 8}.</p>
          )}
          <Link href="/admin/cupons?vence_em=15"
            className="inline-block mt-3 text-xs text-[#00ff87] hover:underline">
            Ver todos na lista de cupons
          </Link>
        </div>
      )}

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
