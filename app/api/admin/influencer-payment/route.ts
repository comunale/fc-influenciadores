import { requireRole, createClient } from '@/lib/supabase/server'
import { mensagemDeErro } from '@/lib/db-errors'
import { NextResponse } from 'next/server'

/**
 * Dados bancários do influenciador — quem paga escreve, mais ninguém lê.
 *
 * Vive em tabela própria (`influencer_payment_info`) porque `influencers` é
 * lida SEM login pela landing pública. Chave PIX na mesma tabela ficaria
 * alcançável por qualquer visitante via API.
 *
 * A rota usa a sessão do usuário, não service role: assim a RLS da tabela
 * continua valendo e uma divergência entre as duas camadas vira erro visível
 * em vez de furo silencioso.
 */

const CAMPOS = [
  'payment_method',
  'pix_key',
  'bank_name',
  'bank_agency',
  'bank_account',
  'payment_document',
  'payment_notes',
] as const

export async function GET(request: Request) {
  const auth = await requireRole(['admin', 'finance'])
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const influencerId = new URL(request.url).searchParams.get('influencer_id')
  if (!influencerId) {
    return NextResponse.json({ error: 'influencer_id obrigatório' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('influencer_payment_info')
    .select('*')
    .eq('influencer_id', influencerId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: mensagemDeErro(error.message) }, { status: 400 })
  return NextResponse.json({ dados: data })
}

export async function PUT(request: Request) {
  const auth = await requireRole(['admin', 'finance'])
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await request.json().catch(() => ({}))
  const influencerId = typeof body.influencer_id === 'string' ? body.influencer_id : ''
  if (!influencerId) {
    return NextResponse.json({ error: 'influencer_id obrigatório' }, { status: 400 })
  }

  const metodo = body.payment_method
  if (metodo && !['pix', 'conta'].includes(metodo)) {
    return NextResponse.json({ error: 'Forma de pagamento inválida.' }, { status: 400 })
  }

  // Allowlist explícita: o corpo da requisição não escolhe o que grava.
  const dados: Record<string, string | null> = {}
  for (const campo of CAMPOS) {
    if (campo in body) {
      const valor = typeof body[campo] === 'string' ? body[campo].trim() : ''
      dados[campo] = valor || null
    }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('influencer_payment_info').upsert(
    {
      influencer_id: influencerId,
      ...dados,
      updated_at: new Date().toISOString(),
      // Quem mexeu vem do servidor, nunca do cliente.
      updated_by: auth.name,
    },
    { onConflict: 'influencer_id' }
  )

  if (error) return NextResponse.json({ error: mensagemDeErro(error.message) }, { status: 400 })
  return NextResponse.json({ ok: true })
}
