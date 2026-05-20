import { createClient } from '@/lib/supabase/server'
import { formatCurrency, formatDate } from '@/lib/utils'

export default async function CampanhasPage() {
  const supabase = await createClient()

  const { data: campaigns } = await supabase
    .from('campaigns')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-white">Campanhas</h1>
      </div>

      <div className="flex flex-col gap-4">
        {(campaigns || []).map((c) => (
          <div
            key={c.id}
            className="bg-[#141414] border border-[#1e1e1e] rounded-xl p-6 flex flex-col md:flex-row md:items-center gap-4"
          >
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h2 className="text-white font-semibold text-lg">{c.name}</h2>
                <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                  c.active ? 'bg-[#00ff87]/10 text-[#00ff87]' : 'bg-gray-800 text-gray-400'
                }`}>
                  {c.active ? 'Ativa' : 'Inativa'}
                </span>
              </div>
              <p className="text-gray-400 text-sm mb-3">{c.coupon_description}</p>
              <div className="flex gap-4 text-xs text-gray-500">
                <span>Desconto: <strong className="text-[#00ff87]">
                  {c.discount_type === 'fixed' ? formatCurrency(c.discount_value) : `${c.discount_value}%`}
                </strong></span>
                <span>Validade: <strong className="text-white">{c.validity_days} dias</strong></span>
                <span>Criada em: <strong className="text-white">{formatDate(c.created_at)}</strong></span>
              </div>
            </div>
          </div>
        ))}

        {!campaigns?.length && (
          <div className="text-center py-12 text-gray-500">Nenhuma campanha encontrada.</div>
        )}
      </div>
    </div>
  )
}
