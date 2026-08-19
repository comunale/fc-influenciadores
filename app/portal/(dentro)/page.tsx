import { getInfluencerDaSessao } from '@/lib/portal/sessao'
import { carregarPortal } from '@/lib/portal/dados'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ParceriaCard } from '@/components/portal/ParceriaCard'
import { LinkDoInfluencer } from '@/components/portal/LinkDoInfluencer'

export default async function PortalPage() {
  const influencer = await getInfluencerDaSessao()
  if (!influencer) redirect('/portal/login')

  const supabase = await createClient()
  const [parcerias, { data: contratos }] = await Promise.all([
    carregarPortal(influencer.influencerId),
    supabase.rpc('portal_meu_contrato'),
  ])

  const contrato = contratos?.[0] ?? null
  const contratoPendente = !!contrato && contrato.status === 'aguardando'
  const emAndamento = parcerias.find((p) => p.visivel && !p.encerrada)

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 flex flex-col gap-6">
      <div>
        <h1 className="text-white font-bold text-2xl">Olá, {influencer.nome.split(/\s+/)[0]}</h1>
        <p className="text-gray-500 text-sm mt-1">
          Acompanhe aqui o que o seu link trouxe.
        </p>
      </div>

      {/* Sem aceite não há link. Mostrar o resumo sem explicar isso faria a
          pessoa achar que o sistema está quebrado. */}
      {contratoPendente && (
        <Link
          href="/portal/contrato"
          className="bg-[#141414] border border-yellow-900/50 rounded-2xl p-5 block hover:border-yellow-700 transition-colors"
        >
          <div className="text-yellow-500 font-semibold">Contrato aguardando você</div>
          <p className="text-gray-400 text-sm mt-1 leading-relaxed">
            Seu link começa a funcionar assim que você ler e aceitar o contrato.
            Leva um minuto.
          </p>
          <span className="text-yellow-500 text-sm mt-3 inline-block">Ver contrato →</span>
        </Link>
      )}

      {contratoPendente ? null : emAndamento ? (
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
