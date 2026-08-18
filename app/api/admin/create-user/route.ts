import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { isRole } from '@/lib/auth/roles'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    // Verifica que o chamador é admin
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })

    const { data: profile } = await supabase
      .from('admin_profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Apenas admins podem criar usuários.' }, { status: 403 })
    }

    const body = await request.json()
    const { email, password, name, role, store_name } = body

    if (!email || !password || !name || !role) {
      return NextResponse.json({ error: 'Todos os campos são obrigatórios.' }, { status: 400 })
    }
    if (!isRole(role)) {
      return NextResponse.json({ error: 'Perfil inválido.' }, { status: 400 })
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'Senha deve ter ao menos 8 caracteres.' }, { status: 400 })
    }
    if (role === 'moderator' && !store_name?.trim()) {
      return NextResponse.json({ error: 'Nome da loja é obrigatório para moderadores.' }, { status: 400 })
    }

    // Tenta usar service role key (solução correta: não troca sessão, bypassa RLS)
    const hasServiceKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY

    let newUserId: string

    if (hasServiceKey) {
      const adminClient = createAdminClient()
      const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      })
      if (createError || !newUser.user) {
        return NextResponse.json({ error: createError?.message || 'Erro ao criar usuário.' }, { status: 400 })
      }
      newUserId = newUser.user.id

      const { error: profileError } = await adminClient.from('admin_profiles').insert({
        id: newUserId,
        name: name.trim(),
        email: email.toLowerCase().trim(),
        role,
        store_name: role === 'moderator' ? (store_name?.trim() || null) : null,
        active: true,
      })
      if (profileError) {
        // Limpa o auth user se o perfil falhou
        await adminClient.auth.admin.deleteUser(newUserId)
        return NextResponse.json({ error: 'Erro ao criar perfil: ' + profileError.message }, { status: 500 })
      }
    } else {
      // Fallback: signUp (troca a sessão, mas a RLS foi ajustada para permitir auto-insert)
      const { data: newUser, error: signUpError } = await supabase.auth.signUp({ email, password })
      if (signUpError || !newUser.user) {
        return NextResponse.json({ error: signUpError?.message || 'Erro ao criar usuário.' }, { status: 400 })
      }
      newUserId = newUser.user.id

      // Cria um novo client após o signUp (sessão pode ter mudado)
      const supabaseAfter = await createClient()
      const { error: profileError } = await supabaseAfter.from('admin_profiles').insert({
        id: newUserId,
        name: name.trim(),
        email: email.toLowerCase().trim(),
        role,
        store_name: role === 'moderator' ? (store_name?.trim() || null) : null,
        active: true,
      })
      if (profileError) {
        return NextResponse.json({ error: 'Usuário criado mas erro no perfil: ' + profileError.message }, { status: 500 })
      }
    }

    return NextResponse.json({ success: true, user: { email, name, role } }, { status: 201 })
  } catch (err) {
    console.error('create-user error:', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
