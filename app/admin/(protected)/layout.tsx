import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AdminNav } from '@/components/admin/AdminNav'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/admin/login')

  const { data: profile } = await supabase
    .from('admin_profiles')
    .select('role, name, active')
    .eq('id', user.id)
    .single()

  if (profile && profile.active === false) {
    await supabase.auth.signOut()
    redirect('/admin/login')
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <AdminNav
        userEmail={user.email || profile?.name || ''}
        userRole={profile?.role || 'moderator'}
      />
      <main className="min-h-[calc(100vh-3.5rem)]">
        {children}
      </main>
    </div>
  )
}
