import { requireRole, createAdminClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

/** Mínimo de 12. Era 8 -- subiu junto com a decisão de 02/10 sobre a assinatura. */
const MINIMO = 12

/**
 * O influenciador define a própria senha.
 *
 * Acontece no SERVIDOR inteiro, de propósito. A troca podia ser feita pelo
 * navegador com `auth.updateUser`, mas aí quem marcaria "ele já definiu a dele"
 * seria o próprio navegador -- e esse carimbo é o que sustenta o aceite do
 * contrato. Carimbo que o interessado pode emitir sozinho não vale nada.
 *
 * Aqui a ordem é: confere a senha atual, troca, e só então carimba. Se a troca
 * falhar, o carimbo não sai.
 */
export async function POST(request: Request) {
  try {
    const auth = await requireRole(['influencer'])
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const { senha_atual, senha_nova } = await request.json()

    if (!senha_atual || !senha_nova) {
      return NextResponse.json({ error: 'Informe a senha atual e a nova.' }, { status: 400 })
    }
    if (String(senha_nova).length < MINIMO) {
      return NextResponse.json(
        { error: `A senha nova precisa ter ao menos ${MINIMO} caracteres.` },
        { status: 400 }
      )
    }
    if (senha_atual === senha_nova) {
      return NextResponse.json(
        { error: 'A senha nova precisa ser diferente da atual.' },
        { status: 400 }
      )
    }

    const admin = createAdminClient()

    const { data: perfil } = await admin
      .from('admin_profiles').select('email').eq('id', auth.userId).single()

    if (!perfil?.email) {
      return NextResponse.json({ error: 'Conta sem e-mail.' }, { status: 400 })
    }

    // Confere a senha atual num cliente DESCARTÁVEL, sem sessão: verificar não
    // pode derrubar nem trocar a sessão de quem está logado.
    const conferidor = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const { error: erroSenha } = await conferidor.auth.signInWithPassword({
      email: perfil.email,
      password: senha_atual,
    })
    if (erroSenha) {
      return NextResponse.json({ error: 'A senha atual está errada.' }, { status: 400 })
    }

    const { error: erroTroca } = await admin.auth.admin.updateUserById(auth.userId, {
      password: senha_nova,
    })
    if (erroTroca) {
      return NextResponse.json({ error: 'Não foi possível trocar a senha.' }, { status: 400 })
    }

    // O carimbo vem DEPOIS da troca dar certo. É ele que libera o portal e que
    // sustenta "a senha era dele quando aceitou".
    await admin
      .from('admin_profiles')
      .update({ senha_definida_at: new Date().toISOString() })
      .eq('id', auth.userId)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('definir-senha error:', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
