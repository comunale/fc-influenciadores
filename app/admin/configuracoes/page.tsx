import { createClient } from '@/lib/supabase/server'
import { UserManagement } from '@/components/admin/UserManagement'
import { AppSettings } from '@/components/admin/AppSettings'

export default async function ConfiguracoesPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase
    .from('admin_profiles')
    .select('role')
    .eq('id', user!.id)
    .single()

  const isAdmin = profile?.role === 'admin'

  if (!isAdmin) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-white mb-6">Configurações</h1>
        <div className="bg-[#141414] border border-[#1e1e1e] rounded-xl p-6">
          <p className="text-gray-400 text-sm">Apenas admins podem acessar as configurações.</p>
        </div>
      </div>
    )
  }

  const [usersRes, settingsRes] = await Promise.all([
    supabase
      .from('admin_profiles')
      .select('id, name, email, role, active, created_at')
      .order('created_at'),
    supabase
      .from('app_settings')
      .select('company_name, sender_email, whatsapp_text, email_subject, email_body')
      .eq('id', 1)
      .single(),
  ])

  const defaultSettings = {
    company_name: 'FoxCycles',
    sender_email: 'noreply@foxcycles.com.br',
    whatsapp_text: 'Olá! Acabei de gerar meu cupom de desconto FoxCycles! 🏍️',
    email_subject: 'Seu cupom de desconto FoxCycles chegou!',
    email_body: 'Olá {{nome}}!\n\nSeu cupom está pronto:\nCódigo: {{codigo}}\nDesconto: {{valor}}\nVálido até: {{validade}}\n\nFoxCycles Campinas 🏍️',
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 flex flex-col gap-10">
      <h1 className="text-2xl font-bold text-white">Configurações</h1>

      {/* Seção 1: Usuários */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-4">Usuários do Sistema</h2>
        <UserManagement
          users={usersRes.data || []}
          currentUserId={user!.id}
        />
      </section>

      {/* Seção 2 e 3: Configurações Gerais + Email Template */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-4">Configurações e Email</h2>
        <AppSettings initial={settingsRes.data ?? defaultSettings} />
      </section>
    </div>
  )
}
