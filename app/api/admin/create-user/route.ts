import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()

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
    if (!['admin', 'moderator'].includes(role)) {
      return NextResponse.json({ error: 'Perfil inválido.' }, { status: 400 })
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'Senha deve ter ao menos 8 caracteres.' }, { status: 400 })
    }
    if (role === 'moderator' && !store_name?.trim()) {
      return NextResponse.json({ error: 'Nome da loja é obrigatório para moderadores.' }, { status: 400 })
    }

    const { data: newUser, error: signUpError } = await supabase.auth.signUp({ email, password })

    if (signUpError || !newUser.user) {
      return NextResponse.json({ error: signUpError?.message || 'Erro ao criar usuário.' }, { status: 400 })
    }

    const { error: profileError } = await supabase.from('admin_profiles').insert({
      id: newUser.user.id,
      name: name.trim(),
      email: email.toLowerCase().trim(),
      role,
      store_name: role === 'moderator' ? (store_name?.trim() || null) : null,
    })

    if (profileError) {
      return NextResponse.json({ error: 'Usuário criado mas erro no perfil: ' + profileError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, user: { email, name, role } }, { status: 201 })
  } catch (err) {
    console.error('create-user error:', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
