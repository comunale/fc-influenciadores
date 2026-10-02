import { requireRole, createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * A ficha do influenciador: contato, qualificação e notas de negociação.
 *
 * Usa a sessão do usuário, não service role: é a RLS de `influencer_ficha` que
 * decide, e divergência entre a camada da tela e a do banco vira erro visível em
 * vez de silêncio.
 *
 * O Lojista não entra aqui nem pela rota nem pelo banco -- `observacoes` guarda
 * o que foi negociado, e isso não é assunto de quem atende o balcão.
 */
const CAMPOS = [
  'cpf', 'estado_civil', 'endereco', 'cep',
  'telefone', 'cidade', 'nicho', 'seguidores', 'observacoes',
] as const

export async function POST(request: Request) {
  try {
    const auth = await requireRole(['admin'])
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const body = await request.json()
    const { influencer_id } = body
    if (!influencer_id) {
      return NextResponse.json({ error: 'Influenciador é obrigatório.' }, { status: 400 })
    }

    // Lista fechada: o que não está aqui não é gravado, venha o que vier no corpo.
    const dados: Record<string, string | number | null> = {}
    for (const campo of CAMPOS) {
      if (!(campo in body)) continue
      const v = body[campo]
      if (campo === 'seguidores') {
        dados[campo] = v === '' || v == null ? null : Number(v)
        if (Number.isNaN(dados[campo])) {
          return NextResponse.json({ error: 'Seguidores precisa ser um número.' }, { status: 400 })
        }
      } else {
        dados[campo] = typeof v === 'string' ? v.trim() || null : null
      }
    }

    const supabase = await createClient()
    const { error } = await supabase
      .from('influencer_ficha')
      .upsert({ influencer_id, ...dados, updated_at: new Date().toISOString() },
              { onConflict: 'influencer_id' })

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('influencer-ficha error:', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
