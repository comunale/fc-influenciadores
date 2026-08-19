import { requireAdmin, createAdminClient } from '@/lib/supabase/server'
import { sincronizarContrato } from '@/lib/contracts/gerar'
import { NextResponse } from 'next/server'

/** Gera o contrato de uma parceria, ou atualiza o texto enquanto não aceito. */
export async function POST(request: Request) {
  try {
    const auth = await requireAdmin()
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const { partnership_id } = await request.json()
    if (!partnership_id) {
      return NextResponse.json({ error: 'Parceria é obrigatória.' }, { status: 400 })
    }

    await sincronizarContrato(partnership_id)
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('contracts POST error:', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

/**
 * Registrar descumprimento.
 *
 * O sistema NÃO percebe post apagado -- o Instagram não avisa ninguém, e não
 * vamos varrer perfil de terceiro. Quem percebe, registra aqui; a cascata é
 * automática só a partir deste ponto.
 */
export async function PATCH(request: Request) {
  try {
    const auth = await requireAdmin()
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const { contract_id, acao } = await request.json()
    if (acao !== 'descumprimento') {
      return NextResponse.json({ error: 'Ação desconhecida.' }, { status: 400 })
    }
    if (!contract_id) {
      return NextResponse.json({ error: 'Contrato é obrigatório.' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { error } = await admin.rpc('registrar_descumprimento', { p_contrato: contract_id })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('contracts PATCH error:', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
