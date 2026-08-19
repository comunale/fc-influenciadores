import { getInfluencerDaSessao } from '@/lib/portal/sessao'
import { carregarPortal } from '@/lib/portal/dados'
import { redirect } from 'next/navigation'

const dia = (d: string) => new Date(d).toLocaleDateString('pt-BR')

export default async function VendasPage() {
  const influencer = await getInfluencerDaSessao()
  if (!influencer) redirect('/portal/login')

  const parcerias = await carregarPortal(influencer.influencerId)
  const comVendas = parcerias.filter((p) => p.visivel)

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 flex flex-col gap-6">
      <div>
        <h1 className="text-white font-bold text-2xl">Vendas</h1>
        <p className="text-gray-500 text-sm mt-1">
          Cada cupom que o seu link gerou, e em que pé está.
        </p>
      </div>

      {comVendas.length === 0 && (
        <p className="text-gray-500 text-sm">Nenhuma venda para mostrar ainda.</p>
      )}

      {comVendas.map((p) => (
        <div key={p.id} className="flex flex-col gap-2">
          <div className="text-gray-400 text-sm font-medium">
            Parceria desde {dia(p.starts_at + 'T12:00:00')}
            {p.encerrada && ' · encerrada'}
          </div>

          {p.vendas.length === 0 ? (
            <p className="text-gray-600 text-sm">Nenhum cupom gerado nesta parceria.</p>
          ) : (
            <div className="bg-[#141414] border border-[#1e1e1e] rounded-2xl overflow-hidden">
              {p.vendas.map((v, i) => (
                <div
                  key={v.id}
                  className={`flex items-center justify-between gap-3 px-4 py-3 ${
                    i > 0 ? 'border-t border-[#1e1e1e]' : ''
                  }`}
                >
                  <div className="min-w-0">
                    <div className="text-white text-sm font-medium truncate">{v.primeiro_nome}</div>
                    <div className="text-gray-500 text-xs">{dia(v.data)}</div>
                  </div>
                  <span
                    className={`shrink-0 text-xs font-medium rounded-full px-3 py-1 ${
                      v.aprovada
                        ? 'bg-[#00ff87]/10 text-[#00ff87]'
                        : 'bg-[#2a2a2a] text-gray-400'
                    }`}
                  >
                    {v.aprovada ? 'aprovada' : 'em conferência'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      <p className="text-gray-600 text-xs leading-relaxed">
        Mostramos só o primeiro nome de quem usou o cupom — o resto do cadastro é
        do cliente e fica com a FoxCycles.
      </p>
    </div>
  )
}
