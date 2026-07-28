import { requireAdmin, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Exclui o usuário do auth. O perfil em admin_profiles cai junto
// (FK admin_profiles.id → auth.users.id ON DELETE CASCADE).
// O histórico de validações é preservado: coupons.used_by_admin guarda o nome, não a FK.
export async function DELETE(request: Request) {
  try {
    const auth = await requireAdmin()
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const userId = new URL(request.url).searchParams.get('userId')
    if (!userId) {
      return NextResponse.json({ error: 'userId é obrigatório.' }, { status: 400 })
    }
    if (userId === auth.userId) {
      return NextResponse.json({ error: 'Você não pode excluir sua própria conta.' }, { status: 400 })
    }

    const adminClient = createAdminClient()

    const { data: target } = await adminClient
      .from('admin_profiles')
      .select('id, name, role, active')
      .eq('id', userId)
      .single()

    if (!target) {
      return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404 })
    }

    // Nunca deixar o sistema sem nenhum admin ativo.
    if (target.role === 'admin' && target.active) {
      const { count } = await adminClient
        .from('admin_profiles')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'admin')
        .eq('active', true)

      if ((count || 0) <= 1) {
        return NextResponse.json(
          { error: 'Não é possível excluir o único administrador ativo do sistema.' },
          { status: 400 }
        )
      }
    }

    const { error } = await adminClient.auth.admin.deleteUser(userId)
    if (error) {
      return NextResponse.json({ error: 'Erro ao excluir usuário: ' + error.message }, { status: 400 })
    }

    // Rede de segurança caso o cascade não tenha removido o perfil.
    await adminClient.from('admin_profiles').delete().eq('id', userId)

    return NextResponse.json({ success: true, name: target.name })
  } catch (err) {
    console.error('delete-user error:', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
