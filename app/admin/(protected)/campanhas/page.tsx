import { createClient } from '@/lib/supabase/server'
import { CampanhasList } from '@/components/admin/CampanhasList'

export default async function CampanhasPage() {
  const supabase = await createClient()

  const { data: campaigns } = await supabase
    .from('campaigns')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <CampanhasList campaigns={campaigns || []} />
    </div>
  )
}
