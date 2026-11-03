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

    // A chave de serviço é obrigatória. `auth.admin.createUser` não troca a
    // sessão e grava o perfil por fora da RLS -- é o caminho certo, e é o que
    // roda em produção desde 22/05/2026.
    //
    // Existia aqui um caminho reserva com `signUp`, para quando a chave não
    // estivesse configurada. Ele dependia de uma RLS frouxa que, em 03/11/2026,
    // se revelou escalada de privilégio: qualquer conta logada sem perfil se
    // inseria como admin e alcançava CPF de cliente e dados bancários. A
    // migration 030 fechou a RLS, e o reserva sai junto -- sem a chave, a rota
    // falha com erro claro em vez de criar conta por fora.
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('create-user: SUPABASE_SERVICE_ROLE_KEY não configurada')
      return NextResponse.json(
        { error: 'Criação de usuários indisponível: a chave de serviço não está configurada no servidor. Avise o administrador.' },
        { status: 503 }
      )
    }

    const adminClient = createAdminClient()

    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (createError || !newUser.user) {
      return NextResponse.json({ error: createError?.message || 'Erro ao criar usuário.' }, { status: 400 })
    }

    const { error: profileError } = await adminClient.from('admin_profiles').insert({
      id: newUser.user.id,
      name: name.trim(),
      email: email.toLowerCase().trim(),
      role,
      store_name: role === 'moderator' ? (store_name?.trim() || null) : null,
      active: true,
    })
    if (profileError) {
      // Limpa o auth user se o perfil falhou: conta no Auth sem perfil é
      // exatamente o estado que a brecha de 03/11/2026 soube explorar.
      await adminClient.auth.admin.deleteUser(newUser.user.id)
      return NextResponse.json({ error: 'Erro ao criar perfil: ' + profileError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, user: { email, name, role } }, { status: 201 })
  } catch (err) {
    console.error('create-user error:', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
