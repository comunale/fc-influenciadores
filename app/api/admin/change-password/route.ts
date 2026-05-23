import { createClient, createAdminClient } from '@/lib/supabase/server'
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
      return NextResponse.json({ error: 'Apenas admins podem alterar senhas.' }, { status: 403 })
    }

    const { userId, password } = await request.json()

    if (!userId || !password) {
      return NextResponse.json({ error: 'userId e password são obrigatórios.' }, { status: 400 })
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'Senha deve ter ao menos 8 caracteres.' }, { status: 400 })
    }

    const adminClient = createAdminClient()
    const { error } = await adminClient.auth.admin.updateUserById(userId, { password })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('change-password error:', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
