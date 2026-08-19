import { requireAdmin, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * Cria o acesso de um influenciador ao portal dele.
 *
 * Rota separada de /api/admin/create-user de propósito: uma conta de portal só
 * existe amarrada a um registro de influenciador (constraint
 * admin_profiles_vinculo_coerente, migration 014). Deixar o papel entrar no
 * fluxo de usuários internos produziria uma conta sem dono, que o banco recusa.
 *
 * Só admin. O Financeiro não cria acesso de terceiro.
 */
export async function POST(request: Request) {
  try {
    const auth = await requireAdmin()
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const { influencer_id, email, password } = await request.json()

    if (!influencer_id || !email?.trim() || !password) {
      return NextResponse.json(
        { error: 'Influenciador, e-mail e senha são obrigatórios.' },
        { status: 400 }
      )
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'Senha deve ter ao menos 8 caracteres.' }, { status: 400 })
    }

    const admin = createAdminClient()

    const { data: influencer } = await admin
      .from('influencers')
      .select('id, name')
      .eq('id', influencer_id)
      .single()

    if (!influencer) {
      return NextResponse.json({ error: 'Influenciador não encontrado.' }, { status: 404 })
    }

    // Um influenciador tem um acesso só (índice único admin_profiles_influencer_unico).
    const { data: jaTem } = await admin
      .from('admin_profiles')
      .select('email')
      .eq('influencer_id', influencer_id)
      .maybeSingle()

    if (jaTem) {
      return NextResponse.json(
        { error: `Este influenciador já tem acesso (${jaTem.email}).` },
        { status: 409 }
      )
    }

    const { data: novo, error: erroAuth } = await admin.auth.admin.createUser({
      email: email.toLowerCase().trim(),
      password,
      email_confirm: true,
    })
    if (erroAuth || !novo.user) {
      return NextResponse.json(
        { error: erroAuth?.message || 'Erro ao criar o acesso.' },
        { status: 400 }
      )
    }

    const { error: erroPerfil } = await admin.from('admin_profiles').insert({
      id: novo.user.id,
      name: influencer.name,
      email: email.toLowerCase().trim(),
      role: 'influencer',
      influencer_id,
      active: true,
    })

    if (erroPerfil) {
      // Sem perfil o usuário fica órfão no auth, ocupando o e-mail sem servir
      // para nada. Mesmo cuidado que /api/admin/create-user já toma.
      await admin.auth.admin.deleteUser(novo.user.id)
      return NextResponse.json(
        { error: 'Erro ao criar o perfil: ' + erroPerfil.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, email }, { status: 201 })
  } catch (err) {
    console.error('portal-access error:', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

/** Remove o acesso ao portal. O influenciador continua existindo. */
export async function DELETE(request: Request) {
  try {
    const auth = await requireAdmin()
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const { influencer_id } = await request.json()
    if (!influencer_id) {
      return NextResponse.json({ error: 'Influenciador é obrigatório.' }, { status: 400 })
    }

    const admin = createAdminClient()

    const { data: perfil } = await admin
      .from('admin_profiles')
      .select('id')
      .eq('influencer_id', influencer_id)
      .maybeSingle()

    if (!perfil) {
      return NextResponse.json({ error: 'Este influenciador não tem acesso.' }, { status: 404 })
    }

    // Apagar o usuário do auth leva o perfil junto (FK admin_profiles.id →
    // auth.users.id ON DELETE CASCADE). Fazer o contrário deixaria o e-mail
    // preso no auth, impedindo recriar o acesso depois.
    const { error } = await admin.auth.admin.deleteUser(perfil.id)
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    // Garantia: se a cascade não pegou, o perfil não pode ficar apontando para
    // um usuário que não existe mais.
    await admin.from('admin_profiles').delete().eq('id', perfil.id)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('portal-access delete error:', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
