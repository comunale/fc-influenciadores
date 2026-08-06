import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ValidarClient } from './ValidarClient'

interface SearchParams {
  codigo?: string
  [key: string]: string | undefined
}

export default async function ValidarPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const initialCode = params.codigo?.toUpperCase() ?? ''

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/admin/login')

  const { data: profile } = await supabase
    .from('admin_profiles')
    .select('role, store_name')
    .eq('id', user.id)
    .single()

  // O admin não tem loja no perfil: vê todos os vendedores, com a loja ao lado do nome.
  let query = supabase
    .from('sellers')
    .select('id, name, store_name, active, created_at')
    .eq('active', true)
    .order('name')

  if (profile?.role !== 'admin') {
    query = query.eq('store_name', profile?.store_name ?? '')
  }

  const { data: sellers } = await query

  return (
    <ValidarClient
      initialCode={initialCode}
      sellers={sellers ?? []}
      showStore={profile?.role === 'admin'}
    />
  )
}
