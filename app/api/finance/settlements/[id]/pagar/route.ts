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
 * E o unico lugar do sistema que escreve coupons.paid / paid_at / paid_by.
 *
 * Cliente da SESSAO (ver app/api/finance/settlements/route.ts): o trigger de
 * imutabilidade enxerga o papel de quem chama.
 *
 * Sem transacao: o PostgREST nao tem. Reivindicamos o lancamento primeiro, com
 * update condicionado a status 'aberto', porque isso e atomico e barra dois
 * cliques simultaneos; so quem ganhou marca os cupons.
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

    const { data: atual, error: erroLeitura } = await supabase
      .from('settlements').select('id, status').eq('id', id).maybeSingle()
    if (erroLeitura) {
      console.error('settlements pagar: leitura', erroLeitura)
      return NextResponse.json({ error: 'Não foi possível ler o lançamento.' }, { status: 500 })
    }
    if (!atual) return NextResponse.json({ error: 'Lançamento não encontrado.' }, { status: 404 })
    const recusa = recusaDePagar(atual.status)
    if (recusa) return NextResponse.json({ error: recusa.error }, { status: recusa.status })

    const { data: reivindicado, error: erroPago } = await supabase
      .from('settlements')
      .update({
        status: 'pago',
        paid_at: paidAt,
        forma: campos.forma!.trim(),
        identificador: campos.identificador ?? null,
      })
      .eq('id', id)
      .eq('status', 'aberto')
      .select('id')
    if (erroPago) {
      const r = traduzErroDoLivro(erroPago)
      console.error('settlements pagar: update', erroPago)
      return NextResponse.json({ error: r.error }, { status: r.status })
    }
    if (!reivindicado || reivindicado.length === 0) {
      return NextResponse.json({ error: 'Este lançamento já foi pago ou cancelado.' }, { status: 409 })
    }

    const { data: itens, error: erroItens } = await supabase
      .from('settlement_items').select('coupon_id').eq('settlement_id', id)
    if (erroItens) {
      console.error('settlements pagar: itens', erroItens)
      return NextResponse.json(
        { error: 'Lançamento gravado como pago, mas não foi possível marcar os cupons. Avise o administrador.' },
        { status: 500 }
      )
    }

    const couponIds = (itens ?? []).map((i) => i.coupon_id)
    if (couponIds.length > 0) {
      const { error: erroCupons } = await supabase
        .from('coupons')
        .update({ paid: true, paid_at: paidAt, paid_by: auth.name })
        .in('id', couponIds)
      if (erroCupons) {
        console.error('settlements pagar: cupons', erroCupons)
        return NextResponse.json(
          { error: 'Lançamento gravado como pago, mas os cupons não foram marcados. Avise o administrador.' },
          { status: 500 }
        )
      }
    }

    return NextResponse.json({ success: true, cupons: couponIds.length })
  } catch (err) {
    console.error('settlements pagar error:', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
