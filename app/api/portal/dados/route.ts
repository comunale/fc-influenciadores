import { requireRole, createClient, createAdminClient } from '@/lib/supabase/server'
import { sincronizarContrato } from '@/lib/contracts/gerar'
import { NextResponse } from 'next/server'

/**
 * O influenciador salva os próprios dados de qualificação.
 *
 * A escrita acontece dentro de `portal_salvar_meus_dados`, que descobre o dono
 * pela sessão -- ele não consegue nomear a linha que quer alterar. Aqui só
 * chamamos a função e, depois, regeramos o texto do contrato com os dados novos.
 *
 * A regeração roda com service role de propósito: o corpo do contrato nunca
 * pode vir do navegador dele. Ele preenche campos; quem escreve o documento é o
 * servidor.
 */
export async function POST(request: Request) {
  try {
    const auth = await requireRole(['influencer'])
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const { cpf, estado_civil, endereco, cep } = await request.json()

    if (!cpf?.trim() || !estado_civil?.trim() || !endereco?.trim()) {
      return NextResponse.json(
        { error: 'CPF, estado civil e endereço são obrigatórios.' },
        { status: 400 }
      )
    }

    const supabase = await createClient()
    const { error } = await supabase.rpc('portal_salvar_meus_dados', {
      p_cpf: cpf, p_estado_civil: estado_civil, p_endereco: endereco, p_cep: cep ?? '',
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    // Com os dados novos, o texto do contrato deixa de ter buraco.
    const admin = createAdminClient()
    const { data: perfil } = await admin
      .from('admin_profiles').select('influencer_id').eq('id', auth.userId).single()

    if (perfil?.influencer_id) {
      const { data: p } = await admin
        .from('partnerships').select('id')
        .eq('influencer_id', perfil.influencer_id).eq('status', 'ativa').maybeSingle()
      if (p) await sincronizarContrato(p.id)
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('portal/dados error:', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
