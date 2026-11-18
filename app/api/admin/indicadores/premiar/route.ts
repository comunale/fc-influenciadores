import { NextResponse } from 'next/server'
import { createClient, requireRole } from '@/lib/supabase/server'

/**
 * Registra que o prêmio JÁ FOI PAGO, por fora.
 *
 * Esta rota não paga nada e não integra com banco nenhum. Ela existe por causa
 * de um defeito achado na revisão de 18/11/2026: sem marca de pagamento, a
 * exportação reimprimia toda venda conferida em cada rodada ("TOTAL A PAGAR"
 * crescendo para sempre) e a área da pessoa mostrava o valor cheio mesmo depois
 * de ela ter recebido — então ela cobrava de novo.
 *
 * Marca `indicacao_premiado_em`, que é coluna PRÓPRIA do programa. Nunca
 * `coupons.paid`: aquele campo pertence ao fechamento do influenciador e tem um
 * escritor só, por decisão da spec de 24/08.
 *
 * Passa pela SESSÃO do usuário, não pelo service role: é `coupons_update_interno`
 * que limita isso a admin e financeiro.
 */
export async function POST(request: Request) {
  const auth = await requireRole(['admin', 'finance'])
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Corpo inválido.' }, { status: 400 })
  }

  const indicadorId = (body as { indicador_id?: unknown })?.indicador_id
  if (typeof indicadorId !== 'string' || indicadorId.length === 0) {
    return NextResponse.json({ error: 'Informe o indicador.' }, { status: 400 })
  }

  const supabase = await createClient()

  // As três condições são as MESMAS que a exportação usa, e é o que faz o
  // arquivo e a marcação falarem do mesmo conjunto. Se divergirem, o César
  // marca como pago algo que não exportou.
  const { data, error } = await supabase
    .from('coupons')
    .update({
      indicacao_premiado_em: new Date().toISOString(),
      indicacao_premiado_por: auth.name,
    })
    .eq('indicador_id', indicadorId)
    .eq('status', 'used')
    .eq('verified', true)
    .is('indicacao_premiado_em', null)
    .select('id')

  if (error) {
    console.error('admin/indicadores/premiar:', error)
    return NextResponse.json({ error: 'Erro ao marcar como pago.' }, { status: 500 })
  }

  // Zero linhas não é erro do PostgREST: pode ser RLS, pode ser corrida com
  // outra aba. Dizer "marcado" sem ter marcado nada é pior que dizer nada.
  if (!data || data.length === 0) {
    return NextResponse.json(
      { error: 'Nada a marcar: ou já estava pago, ou seu perfil não pode alterar.' },
      { status: 409 }
    )
  }

  return NextResponse.json({ premiados: data.length })
}
