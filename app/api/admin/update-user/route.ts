import { requireAdmin, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function PATCH(request: Request) {
  try {
    const auth = await requireAdmin()
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const { userId, name, email, role, store_name } = await request.json()

    if (!userId) {
      return NextResponse.json({ error: 'userId é obrigatório.' }, { status: 400 })
    }
    if (!name?.trim()) {
      return NextResponse.json({ error: 'Nome é obrigatório.' }, { status: 400 })
    }
    if (!['admin', 'moderator'].includes(role)) {
      return NextResponse.json({ error: 'Perfil inválido.' }, { status: 400 })
    }
    if (role === 'moderator' && !store_name?.trim()) {
      return NextResponse.json({ error: 'Nome da loja é obrigatório para moderadores.' }, { status: 400 })
    }

    const emailClean = email?.trim().toLowerCase() || ''
    if (!emailClean || !EMAIL_REGEX.test(emailClean)) {
      return NextResponse.json({ error: 'E-mail inválido.' }, { status: 400 })
    }

    // Um admin não pode rebaixar o próprio perfil (evita ficar sem acesso).
    if (userId === auth.userId && role !== 'admin') {
      return NextResponse.json({ error: 'Você não pode alterar seu próprio nível de acesso.' }, { status: 400 })
    }

    const adminClient = createAdminClient()

    const { data: target } = await adminClient
      .from('admin_profiles')
      .select('id, email, role')
      .eq('id', userId)
      .single()

    if (!target) {
      return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404 })
    }

    // Rebaixar outro admin só é permitido se sobrar ao menos um admin ativo.
    if (target.role === 'admin' && role !== 'admin') {
      const { count } = await adminClient
        .from('admin_profiles')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'admin')
        .eq('active', true)

      if ((count || 0) <= 1) {
        return NextResponse.json(
          { error: 'Não é possível rebaixar o único administrador ativo do sistema.' },
          { status: 400 }
        )
      }
    }

    // E-mail mudou → atualiza no auth (login) antes do perfil.
    // email_confirm: true evita mandar e-mail de confirmação e travar o acesso do usuário.
    if (emailClean !== target.email?.toLowerCase()) {
      const { error: authError } = await adminClient.auth.admin.updateUserById(userId, {
        email: emailClean,
        email_confirm: true,
      })
      if (authError) {
        const duplicate = /already|registered|exists/i.test(authError.message)
        return NextResponse.json(
          { error: duplicate ? 'Já existe um usuário com este e-mail.' : authError.message },
          { status: 400 }
        )
      }
    }

    const { error: profileError } = await adminClient
      .from('admin_profiles')
      .update({
        name: name.trim(),
        email: emailClean,
        role,
        store_name: role === 'moderator' ? store_name.trim() : null,
      })
      .eq('id', userId)

    if (profileError) {
      return NextResponse.json({ error: 'Erro ao salvar perfil: ' + profileError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('update-user error:', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
