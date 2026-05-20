import { createClient } from '@/lib/supabase/server'
import { formatDate, formatDateTime } from '@/lib/utils'

interface SearchParams {
  status?: string
  q?: string
}

export default async function CuponsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const supabase = await createClient()

  let query = supabase
    .from('coupons')
    .select('*, influencers(name, instagram_handle), campaigns(name, discount_value, discount_type)')
    .order('created_at', { ascending: false })
    .limit(100)

  if (params.status) {
    query = query.eq('status', params.status)
  }

  if (params.q) {
    query = query.or(
      `customer_name.ilike.%${params.q}%,customer_cpf.ilike.%${params.q}%,coupon_number.ilike.%${params.q}%`
    )
  }

  const { data: coupons } = await query

  const statusLabels: Record<string, { label: string; color: string }> = {
    pending: { label: 'Pendente', color: 'text-gray-400 bg-[#1e1e1e]' },
    used: { label: 'Usado', color: 'text-[#00ff87] bg-[#00ff87]/10' },
    expired: { label: 'Expirado', color: 'text-red-400 bg-red-950' },
    cancelled: { label: 'Cancelado', color: 'text-red-400 bg-red-950' },
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Cupons</h1>
        <span className="text-gray-500 text-sm">{coupons?.length || 0} resultados</span>
      </div>

      {/* Filtros */}
      <form className="flex flex-wrap gap-3 mb-6">
        <input
          name="q"
          defaultValue={params.q}
          placeholder="Buscar por nome, CPF, código..."
          className="flex-1 min-w-48 h-10 px-4 rounded-lg border border-[#2a2a2a] bg-[#1e1e1e] text-white text-sm placeholder:text-gray-500 focus:border-[#00ff87] focus:outline-none"
        />
        <select
          name="status"
          defaultValue={params.status}
          className="h-10 px-3 rounded-lg border border-[#2a2a2a] bg-[#1e1e1e] text-white text-sm focus:border-[#00ff87] focus:outline-none"
        >
          <option value="">Todos os status</option>
          <option value="pending">Pendente</option>
          <option value="used">Usado</option>
          <option value="expired">Expirado</option>
        </select>
        <button
          type="submit"
          className="h-10 px-4 bg-[#00ff87] text-black text-sm font-semibold rounded-lg hover:bg-[#00cc6a]"
        >
          Filtrar
        </button>
      </form>

      {/* Tabela */}
      <div className="bg-[#141414] border border-[#1e1e1e] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1e1e1e]">
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Código</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Cliente</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium hidden md:table-cell">Influencer</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium hidden md:table-cell">Gerado em</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium hidden md:table-cell">Validade</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {(coupons || []).map((c, i) => {
                const status = statusLabels[c.status] || statusLabels.pending
                return (
                  <tr
                    key={c.id}
                    className={`border-b border-[#1a1a1a] hover:bg-[#1a1a1a] transition-colors ${i % 2 === 0 ? '' : 'bg-[#111111]'}`}
                  >
                    <td className="px-4 py-3 font-mono text-[#00ff87] font-bold">{c.coupon_number}</td>
                    <td className="px-4 py-3">
                      <div className="text-white">{c.customer_name}</div>
                      <div className="text-gray-500 text-xs">{c.customer_email}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-300 hidden md:table-cell">
                      {(c.influencers as { instagram_handle: string })?.instagram_handle}
                    </td>
                    <td className="px-4 py-3 text-gray-400 hidden md:table-cell">{formatDateTime(c.created_at)}</td>
                    <td className="px-4 py-3 text-gray-400 hidden md:table-cell">{formatDate(c.expires_at)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${status.color}`}>
                        {status.label}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {!coupons?.length && (
            <div className="py-12 text-center text-gray-500">Nenhum cupom encontrado.</div>
          )}
        </div>
      </div>
    </div>
  )
}
