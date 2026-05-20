import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ConfigTabs } from '@/components/admin/ConfigTabs'

export default async function ConfiguracoesPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/admin/login')

  const { data: profile } = await supabase
    .from('admin_profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') redirect('/admin/validar')

  const [usersRes, settingsRes] = await Promise.all([
    supabase
      .from('admin_profiles')
      .select('id, name, email, role, store_name, active, created_at')
      .order('created_at'),
    supabase
      .from('app_settings')
      .select('company_name, sender_email, whatsapp_text, email_subject, email_body, contact_phone')
      .eq('id', 1)
      .single(),
  ])

  const defaultSettings = {
    company_name: 'FoxCycles',
    sender_email: 'noreply@foxcycles.com.br',
    contact_phone: '',
    whatsapp_text: 'Olá! Acabei de gerar meu cupom de desconto FoxCycles! 🏍️',
    email_subject: 'Seu cupom de desconto FoxCycles chegou!',
    email_body: 'Olá {{nome}}!\n\nSeu cupom está pronto:\nCódigo: {{codigo}}\nDesconto: {{valor}}\nVálido até: {{validade}}\n\nInfluencer: {{influencer}}\n\nFoxCycles Campinas 🏍️',
  }

  const settings = settingsRes.data
    ? { ...settingsRes.data, contact_phone: settingsRes.data.contact_phone || '' }
    : defaultSettings

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-white mb-8">Configurações</h1>
      <ConfigTabs
        users={usersRes.data || []}
        currentUserId={user.id}
        settings={settings}
      />
    </div>
  )
}
