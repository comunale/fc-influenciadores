import { createClient } from '@/lib/supabase/server'
import { UserManagement } from '@/components/admin/UserManagement'

export default async function ConfiguracoesPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase
    .from('admin_profiles')
    .select('role')
    .eq('id', user!.id)
    .single()

  const isAdmin = profile?.role === 'admin'

  const { data: users } = await supabase
    .from('admin_profiles')
    .select('id, name, role, created_at')
    .order('created_at')

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 flex flex-col gap-8">
      <h1 className="text-2xl font-bold text-white">Configurações</h1>

      {isAdmin && (
        <UserManagement users={users || []} currentUserId={user!.id} />
      )}

      {!isAdmin && (
        <div className="bg-[#141414] border border-[#1e1e1e] rounded-xl p-6">
          <p className="text-gray-400 text-sm">Apenas admins podem acessar as configurações.</p>
        </div>
      )}
    </div>
  )
}
