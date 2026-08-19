import { requireAdmin, createAdminClient } from '@/lib/supabase/server'
import { camposDoModelo } from '@/lib/contracts/preencher'
import { NextResponse } from 'next/server'

/** Tudo que o sistema sabe preencher. O modelo não pode pedir mais que isto. */
export const CAMPOS_CONHECIDOS = [
  'influenciador.nome', 'influenciador.cpf', 'influenciador.estado_civil',
  'influenciador.endereco', 'influenciador.cep', 'influenciador.link',
  'parceria.vigencia', 'parceria.duracao',
  'parceria.comissao', 'parceria.comissao_extenso',
  'parceria.fee', 'parceria.fee_extenso',
  'contrato.data', 'contrato.imagem_meses', 'contrato.imagem_meses_extenso',
]

/**
 * Salva uma versão nova do modelo.
 *
 * Nunca edita a versão anterior: contrato já aceito aponta para o texto de
 * quando nasceu, e reescrever aquilo apagaria a prova.
 *
 * Recusa modelo que cite campo que o sistema não sabe preencher. Sem esta
 * checagem, um `{{influenciador.nome_completo}}` digitado por engano só
 * apareceria como buraco no contrato de alguém, na hora de assinar.
 */
export async function POST(request: Request) {
  try {
    const auth = await requireAdmin()
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const { titulo, corpo } = await request.json()
    if (!titulo?.trim() || !corpo?.trim()) {
      return NextResponse.json({ error: 'Título e texto são obrigatórios.' }, { status: 400 })
    }

    const desconhecidos = camposDoModelo(corpo).filter((c) => !CAMPOS_CONHECIDOS.includes(c))
    if (desconhecidos.length) {
      return NextResponse.json(
        { error: `O modelo pede campos que o sistema não sabe preencher: ${desconhecidos.join(', ')}` },
        { status: 400 }
      )
    }

    const admin = createAdminClient()
    const { data: ultima } = await admin
      .from('contract_templates').select('versao')
      .order('versao', { ascending: false }).limit(1).maybeSingle()

    const versao = (ultima?.versao ?? 0) + 1

    await admin.from('contract_templates').update({ ativo: false }).eq('ativo', true)

    const { error } = await admin.from('contract_templates').insert({
      versao, titulo: titulo.trim(), corpo, ativo: true, created_by: auth.userId,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ success: true, versao }, { status: 201 })
  } catch (err) {
    console.error('contract-template error:', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
