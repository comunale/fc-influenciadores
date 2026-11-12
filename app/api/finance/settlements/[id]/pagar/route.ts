import { requireRole, createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import {
  PAPEIS_DO_LIVRO,
  camposDePagamento,
  validarPagamento,
  recusaDePagar,
  traduzErroDoLivro,
} from '@/lib/settlements/rotas'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Paga um lancamento: 'aberto' -> 'pago' e marca os cupons dele como pagos.
 * E o unico lugar que DEVERIA escrever coupons.paid / paid_at / paid_by. A rota
 * legada app/api/admin/coupons/route.ts so deixa o ADMIN marcar/desmarcar
 * "Pago" cupom a cupom (decisao do dono); o financeiro perdeu esse campo ali e,
 * no banco, a migration 035 recusa que ele limpe "Pago" de cupom em lancamento
 * pago.
 *
 * As duas escritas acontecem DENTRO da funcao SQL settlement_pagar (migration
 * 034), numa transacao so: ou o lancamento e os cupons ficam pagos, ou nada
 * muda. Antes eram duas chamadas e um cupom desmarcado de "Conferido" fazia o
 * lancamento ficar pago com os cupons ainda devidos.
 *
 * A funcao e chamada com o cliente da SESSAO (.rpc): security definer nao zera
 * auth.uid(), entao ela sabe quem esta pagando e recusa quem nao e admin nem
 * financeiro. Nunca o service_role (ver app/api/finance/settlements/route.ts).
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireRole([...PAPEIS_DO_LIVRO])
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const { id } = await ctx.params
    if (!UUID.test(id)) return NextResponse.json({ error: 'Lançamento inválido.' }, { status: 400 })

    const campos = camposDePagamento(await request.json().catch(() => null))
    const invalido = validarPagamento(campos)
    if (invalido) return NextResponse.json({ error: invalido }, { status: 400 })
    const paidAt = new Date(campos.paid_at!).toISOString()

    const supabase = await createClient()

    // Leitura previa so para devolver 404/409 legiveis; a funcao repete todas
    // as conferencias e e quem decide de verdade.
    const { data: atual, error: erroLeitura } = await supabase
      .from('settlements').select('id, status, tipo').eq('id', id).maybeSingle()
    if (erroLeitura) {
      console.error('settlements pagar: leitura', erroLeitura)
      return NextResponse.json({ error: 'Não foi possível ler o lançamento.' }, { status: 500 })
    }
    if (!atual) return NextResponse.json({ error: 'Lançamento não encontrado.' }, { status: 404 })

    const { count: itens, error: erroItens } = await supabase
      .from('settlement_items')
      .select('id', { count: 'exact', head: true })
      .eq('settlement_id', id)
    if (erroItens) {
      console.error('settlements pagar: itens', erroItens)
      return NextResponse.json({ error: 'Não foi possível ler os itens do lançamento.' }, { status: 500 })
    }

    const recusa = recusaDePagar(atual.status, atual.tipo, itens ?? 0)
    if (recusa) return NextResponse.json({ error: recusa.error }, { status: recusa.status })

    const { data: marcados, error: erroPagar } = await supabase.rpc('settlement_pagar', {
      p_id: id,
      p_paid_at: paidAt,
      p_forma: campos.forma!,
      p_identificador: campos.identificador ?? null,
      p_quem: auth.name,
    })
    if (erroPagar) {
      console.error('settlements pagar: rpc (lancamento ' + id + ')', erroPagar)
      const r = traduzErroDoLivro(erroPagar)
      return NextResponse.json({ error: r.error }, { status: r.status })
    }

    return NextResponse.json({ success: true, cupons: marcados ?? 0 })
  } catch (err) {
    console.error('settlements pagar error:', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
