import { createClient, getUserRole } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { calcularComissao } from '@/lib/commission'
import { parceriaAtiva, type Parceria } from '@/lib/partnership'
import { motivoLinkInativo } from '@/lib/influencer-status'
import { FichaInfluencer } from '@/components/admin/ficha/FichaInfluencer'

export const dynamic = 'force-dynamic'

/**
 * A ficha do influenciador — a pessoa inteira numa tela.
 *
 * Existe porque o César leu a tela de cadastro e disse o que ela era: "muito
 * voltado para os cupons e pouco para um cadastro mesmo". Estava certo: a pessoa
 * vivia espalhada em cinco lugares que não se olhavam -- o cadastro, a ficha
 * privada, os dados bancários, o acesso ao portal e o contrato -- e três deles
 * só apareciam atrás de botões numa fileira.
 *
 * Com dois influenciadores isso não doía. Com trinta, doeria todo dia.
 */
export default async function FichaPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [role, supabase] = await Promise.all([getUserRole(), createClient()])
  if (role !== 'admin' && role !== 'finance') redirect('/admin')

  const { data: influencer } = await supabase
    .from('influencers')
    .select('*, partnerships(*), campaigns(name), coupons(id, status, verified, paid, created_at, commission_per_sale, partnership_id)')
    .eq('id', id)
    .maybeSingle()

  if (!influencer) notFound()

  // As outras quatro fontes da mesma pessoa.
  const [{ data: ficha }, { data: acesso }, { data: contrato }] = await Promise.all([
    supabase.from('influencer_ficha').select('*').eq('influencer_id', id).maybeSingle(),
    supabase.from('admin_profiles').select('id, email').eq('influencer_id', id).maybeSingle(),
    supabase.from('contracts')
      .select('id, status, accepted_at, partnership_id')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const parcerias = (influencer.partnerships ?? []) as unknown as Parceria[]
  const parceria = parceriaAtiva(parcerias)
  const cupons = (influencer.coupons ?? []) as unknown as {
    id: string; verified: boolean; paid: boolean; created_at: string
    commission_per_sale: number | null; partnership_id: string | null
  }[]

  const comissao = calcularComissao(
    {
      commission_per_sale: parceria?.commission_per_sale ?? 0,
      commission_starts_at: parceria?.commission_starts_at ?? 1,
      fee_amount: parceria?.fee_amount ?? 0,
      commission_counts_from: (parceria?.commission_counts_from ?? 'parceria') as 'parceria' | 'historico',
      partnership_id: parceria?.id ?? '',
    },
    cupons
  )

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 flex flex-col gap-6">
      <Link href="/admin/influencers" className="text-gray-500 hover:text-white text-sm">
        ← Influencers
      </Link>

      <FichaInfluencer
        influencer={{
          id: influencer.id,
          name: influencer.name,
          instagram_handle: influencer.instagram_handle,
          coupon_code: influencer.coupon_code,
          active: influencer.active,
          campanha: (influencer.campaigns as { name: string } | null)?.name ?? '',
        }}
        ficha={ficha ?? null}
        parceria={parceria}
        motivoLinkInativo={motivoLinkInativo(influencer, parceria)}
        comissao={comissao}
        totalCupons={cupons.length}
        acesso={acesso ?? null}
        contrato={contrato && contrato.partnership_id === parceria?.id ? contrato : null}
        podeEditar={role === 'admin'}
      />
    </div>
  )
}
