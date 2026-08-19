import { createClient, getUserRole } from '@/lib/supabase/server'
import { InfluencersList } from '@/components/admin/InfluencersList'
import { InfluencersFilters } from '@/components/admin/InfluencersFilters'
import { calcularComissao } from '@/lib/commission'
import { linkAtivo, venceEmAte } from '@/lib/influencer-status'
import { parceriaAtiva, type Parceria } from '@/lib/partnership'
import { type Role } from '@/lib/auth/roles'

export const dynamic = 'force-dynamic'

interface SearchParams {
  q?: string
  estado?: string
  campaign_id?: string
  a_pagar?: string
  vencendo?: string
  [key: string]: string | undefined
}

export default async function InfluencersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const [role, supabase] = await Promise.all([getUserRole(), createClient()])

  const [{ data: influencers }, { data: campaigns }, { data: todasCampanhas }] = await Promise.all([
    supabase
      .from('influencers')
      .select('*, partnerships(*), campaigns(name), coupons(id, status, verified, paid, created_at, commission_per_sale, partnership_id)')
      .order('name'),
    // Só as ativas servem de modelo no cadastro...
    supabase
      .from('campaigns')
      .select('id, name, discount_type, discount_value, validity_days, coupon_title, coupon_description')
      .eq('active', true),
    // ...mas o filtro precisa de todas, senão some quem está em campanha encerrada.
    supabase.from('campaigns').select('id, name').order('name'),
  ])

  // Quem ja tem acesso ao portal. Consulta separada porque admin_profiles nao
  // e filha de influencers -- o vinculo aponta para o outro lado.
  const { data: perfisPortal } = await supabase
    .from('admin_profiles')
    .select('id, influencer_id, email')
    .eq('role', 'influencer')

  const acessos = Object.fromEntries(
    (perfisPortal ?? [])
      .filter((p) => p.influencer_id)
      .map((p) => [p.influencer_id as string, { email: p.email ?? '', userId: p.id }])
  )

  const enriched = (influencers || []).map((inf) => {
    const couponsArr = (inf.coupons as { status: string }[]) || []
    const parceria = parceriaAtiva(inf.partnerships as Parceria[] | null)
    const comissao = calcularComissao(
      {
        // O contrato vem da PARCERIA ativa desde 18/08/2026.
        commission_per_sale: parceria?.commission_per_sale ?? 0,
        commission_starts_at: parceria?.commission_starts_at ?? 1,
        fee_amount: parceria?.fee_amount ?? 0,
        commission_counts_from: (parceria?.commission_counts_from ?? 'parceria') as 'parceria' | 'historico',
        partnership_id: parceria?.id ?? '',
      },
      (inf.coupons as { id: string; verified: boolean; paid: boolean; created_at: string; commission_per_sale: number | null; partnership_id: string | null }[]) || []
    )

    return {
      ...inf,
      parceria,
      comissao,
      campaign_name: (inf.campaigns as { name: string } | null)?.name ?? '',
      total_coupons: couponsArr.length,
      used_coupons: couponsArr.filter((c) => c.status === 'used').length,
      pending_coupons: couponsArr.filter((c) => c.status === 'pending').length,
    }
  })

  let lista = enriched

  if (params.q) {
    const q = params.q.toLowerCase()
    lista = lista.filter((i) =>
      i.name.toLowerCase().includes(q) ||
      i.instagram_handle.toLowerCase().includes(q) ||
      i.coupon_code.toLowerCase().includes(q)
    )
  }

  // "ativo" aqui significa o mesmo que na landing: o link abre.
  if (params.estado === 'ativo') lista = lista.filter((i) => linkAtivo(i, i.parceria))
  if (params.estado === 'inativo') lista = lista.filter((i) => !i.active)
  if (params.estado === 'encerrada') {
    lista = lista.filter((i) => i.active && !linkAtivo(i, i.parceria))
  }

  if (params.campaign_id) lista = lista.filter((i) => i.campaign_id === params.campaign_id)

  if (params.a_pagar === '1') lista = lista.filter((i) => i.comissao.comissaoAPagar > 0)

  if (params.vencendo === '1') lista = lista.filter((i) => venceEmAte(i.parceria, 30))

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <InfluencersList
        influencers={lista}
        campaigns={campaigns || []}
        canEdit={role === 'admin'}
        acessos={acessos}
        role={role as Role}
        filtros={
          <InfluencersFilters
            campaigns={todasCampanhas || []}
            filters={params}
            total={enriched.length}
            mostrando={lista.length}
          />
        }
      />
    </div>
  )
}
