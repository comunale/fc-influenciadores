import { requireRole, createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * O aceite do contrato.
 *
 * O IP é lido AQUI, do cabeçalho da requisição, e nunca recebido do navegador:
 * campo que o próprio interessado poderia preencher não serve como prova.
 *
 * O resto acontece dentro de `portal_aceitar_contrato`, que descobre o contrato
 * pela sessão -- ele não envia id, não envia texto, e não consegue aceitar o
 * contrato de outra pessoa.
 */
export async function POST(request: Request) {
  try {
    const auth = await requireRole(['influencer'])
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    // x-forwarded-for pode trazer uma cadeia de proxies; o primeiro é o cliente.
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      'desconhecido'
    const agent = request.headers.get('user-agent') ?? 'desconhecido'

    const supabase = await createClient()
    const { error } = await supabase.rpc('portal_aceitar_contrato', {
      p_ip: ip, p_agent: agent.slice(0, 500),
    })

    if (error) {
      const msg = error.message.includes('aguardando')
        ? 'Não há contrato aguardando aceite.'
        : 'Não foi possível registrar o aceite.'
      return NextResponse.json({ error: msg }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('portal/aceitar error:', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
