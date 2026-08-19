import { getInfluencerDaSessao } from '@/lib/portal/sessao'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ContratoAceite } from '@/components/portal/ContratoAceite'

export const dynamic = 'force-dynamic'

export default async function ContratoPage() {
  const influencer = await getInfluencerDaSessao()
  if (!influencer) redirect('/portal/login')

  const supabase = await createClient()

  // Pelas funções, não pelas tabelas: ele não alcança `contracts` nem
  // `influencer_contract_data` de forma alguma. Ver migration 022.
  const [{ data: contratos }, { data: dados }] = await Promise.all([
    supabase.rpc('portal_meu_contrato'),
    supabase.rpc('portal_meus_dados'),
  ])

  const contrato = contratos?.[0] ?? null
  const meusDados = dados?.[0] ?? null

  if (!contrato) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-6">
        <h1 className="text-white font-bold text-2xl">Contrato</h1>
        <div className="bg-[#141414] border border-[#1e1e1e] rounded-2xl p-5 mt-4">
          <p className="text-gray-400 text-sm leading-relaxed">
            Não há contrato para a sua parceria atual. Se você acha que deveria
            haver, fale com quem cuida da sua parceria na FoxCycles.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <ContratoAceite
        corpo={contrato.corpo}
        status={contrato.status}
        aceitoEm={contrato.accepted_at}
        faltaDados={contrato.falta_dados}
        dados={meusDados}
      />
    </div>
  )
}
