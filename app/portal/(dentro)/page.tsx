import { getInfluencerDaSessao } from '@/lib/portal/sessao'
import { carregarPortal } from '@/lib/portal/dados'
import { redirect } from 'next/navigation'
import { ParceriaCard } from '@/components/portal/ParceriaCard'
import { LinkDoInfluencer } from '@/components/portal/LinkDoInfluencer'

export default async function PortalPage() {
  const influencer = await getInfluencerDaSessao()
  if (!influencer) redirect('/portal/login')

  const parcerias = await carregarPortal(influencer.influencerId)
  const emAndamento = parcerias.find((p) => p.visivel && !p.encerrada)

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 flex flex-col gap-6">
      <div>
        <h1 className="text-white font-bold text-2xl">Olá, {influencer.nome.split(/\s+/)[0]}</h1>
        <p className="text-gray-500 text-sm mt-1">
          Acompanhe aqui o que o seu link trouxe.
        </p>
      </div>

      {emAndamento ? (
        <LinkDoInfluencer couponCode={influencer.couponCode} />
      ) : (
        <div className="bg-[#141414] border border-[#1e1e1e] rounded-2xl p-5">
          <div className="text-white font-semibold">Sem parceria em andamento</div>
          <p className="text-gray-500 text-sm mt-1">
            Quando uma nova parceria começar, o seu link volta a funcionar e aparece aqui.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-4">
        {parcerias.length === 0 ? (
          <p className="text-gray-500 text-sm">Nenhuma parceria registrada ainda.</p>
        ) : (
          parcerias.map((p) => <ParceriaCard key={p.id} p={p} />)
        )}
      </div>
    </div>
  )
}
