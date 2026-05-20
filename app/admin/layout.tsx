import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AdminNav } from '@/components/admin/AdminNav'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/admin/login')

  const { data: profile } = await supabase
    .from('admin_profiles')
    .select('role, name')
    .eq('id', user.id)
    .single()

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <AdminNav
        userEmail={user.email || ''}
        userName={profile?.name || ''}
        userRole={profile?.role || 'store'}
      />
      {/* Conteúdo: deslocado pela sidebar no desktop, padding-bottom no mobile p/ bottom nav */}
      <main className="md:ml-56 pb-20 md:pb-0 min-h-screen">
        {children}
      </main>
    </div>
  )
}
