import { createClient, getUserRole } from '@/lib/supabase/server'
import { CampanhasList } from '@/components/admin/CampanhasList'

export const dynamic = 'force-dynamic'

export default async function CampanhasPage() {
  const [role, supabase] = await Promise.all([getUserRole(), createClient()])

  const { data: campaigns } = await supabase
    .from('campaigns')
    .select('*, influencers(id)')
    .order('created_at', { ascending: false })

  // Apagar campanha CASCATEIA nos influencers dela (influencers_campaign_id_fkey).
  // A tela precisa avisar quantos sumiriam junto.
  const comContagem = (campaigns || []).map((c) => ({
    ...c,
    influencer_count: (c.influencers as { id: string }[] | null)?.length ?? 0,
  }))

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <CampanhasList campaigns={comContagem} canEdit={role === 'admin'} />
    </div>
  )
}
