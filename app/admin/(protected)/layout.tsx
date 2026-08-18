import { getUsuarioAtual } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AdminNav } from '@/components/admin/AdminNav'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Uma consulta por requisição: o `cache` do React faz o layout e a página
  // dividirem o mesmo resultado. Antes cada um fazia o seu, e o getUser()
  // valida o token pela rede toda vez.
  //
  // Quem desloga conta inativa é o proxy — ele roda antes e já limpa o cookie.
  const usuario = await getUsuarioAtual()
  if (!usuario) redirect('/admin/login')

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <AdminNav userEmail={usuario.email || usuario.name} userRole={usuario.role} />
      <main className="min-h-[calc(100vh-3.5rem)]">{children}</main>
    </div>
  )
}
