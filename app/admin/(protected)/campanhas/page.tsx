import { createClient, getUserRole } from '@/lib/supabase/server'
import { CampanhasList } from '@/components/admin/CampanhasList'

export const dynamic = 'force-dynamic'

export default async function CampanhasPage() {
  const [role, supabase] = await Promise.all([getUserRole(), createClient()])

  const { data: campaigns } = await supabase
    .from('campaigns')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <CampanhasList campaigns={campaigns || []} canEdit={role === 'admin'} />
    </div>
  )
}
