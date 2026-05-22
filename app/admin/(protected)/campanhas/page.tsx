import { createClient, getUserRole } from '@/lib/supabase/server'
import { CampanhasList } from '@/components/admin/CampanhasList'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function CampanhasPage() {
  const role = await getUserRole()
  if (role !== 'admin') redirect('/admin/validar')

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
