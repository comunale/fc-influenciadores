import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import type { Database } from './types'
import type { Role } from '@/lib/auth/roles'

// Retorna o role do usuário logado ou null se não autenticado/sem perfil
export async function getUserRole(): Promise<string | null> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    const { data: profile } = await supabase
      .from('admin_profiles')
      .select('role, active')
      .eq('id', user.id)
      .single()
    if (!profile?.active) return null
    return profile.role
  } catch {
    return null
  }
}

// Garante que quem chamou a rota é um admin ativo.
// Retorna { userId } em caso de sucesso ou { error, status } para devolver na resposta.
export async function requireAdmin(): Promise<
  { userId: string; error?: never } | { userId?: never; error: string; status: number }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autorizado.', status: 401 }

  const { data: profile } = await supabase
    .from('admin_profiles')
    .select('role, active')
    .eq('id', user.id)
    .single()

  if (!profile?.active) return { error: 'Conta inativa.', status: 403 }
  if (profile.role !== 'admin') return { error: 'Apenas admins podem executar esta ação.', status: 403 }

  return { userId: user.id }
}

// Igual ao requireAdmin, mas aceita uma lista de papéis e devolve qual deles é.
export async function requireRole(allowed: Role[]): Promise<
  | { userId: string; role: Role; name: string; error?: never }
  | { userId?: never; role?: never; name?: never; error: string; status: number }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autorizado.', status: 401 }

  const { data: profile } = await supabase
    .from('admin_profiles')
    .select('role, active, name')
    .eq('id', user.id)
    .single()

  if (!profile?.active) return { error: 'Conta inativa.', status: 403 }
  if (!allowed.includes(profile.role as Role)) {
    return { error: 'Sem permissão para esta ação.', status: 403 }
  }

  return { userId: user.id, role: profile.role as Role, name: profile.name }
}

// Cliente admin com service role — bypassa RLS completamente.
// Requer SUPABASE_SERVICE_ROLE_KEY nas env vars.
export function createAdminClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY não configurada')
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // ignorado em Server Components
          }
        },
      },
    }
  )
}
