import { requireRole, createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import {
  PAPEIS_DO_LIVRO,
  recusaDeCancelar,
  traduzErroDoLivro,
} from '@/lib/settlements/rotas'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Cancela um lancamento ABERTO. Sem corpo: nada vem do cliente alem do id.
 *
 * Cliente da SESSAO (ver app/api/finance/settlements/route.ts).
 *
 * Ordem inegociavel: apaga os itens PRIMEIRO e so depois marca 'cancelado'.
 * settlement_items_congela so deixa o item mudar enquanto o pai esta 'aberto';
 * marcar cancelado antes tornaria os proprios itens inapagaveis.
 * Cancelar nao toca em coupons.paid: o lancamento aberto nao marcou cupom. Um
 * cupom dele pode estar pago a mao (o admin marca na tela de Cupons); isso e do
 * cupom, nao do lancamento, e cancelar nao o desfaz.
 */
export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireRole([...PAPEIS_DO_LIVRO])
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const { id } = await ctx.params
    if (!UUID.test(id)) return NextResponse.json({ error: 'Lançamento inválido.' }, { status: 400 })

    const supabase = await createClient()

    const { data: atual, error: erroLeitura } = await supabase
      .from('settlements').select('id, status').eq('id', id).maybeSingle()
    if (erroLeitura) {
      console.error('settlements cancelar: leitura', erroLeitura)
      return NextResponse.json({ error: 'Não foi possível ler o lançamento.' }, { status: 500 })
    }
    if (!atual) return NextResponse.json({ error: 'Lançamento não encontrado.' }, { status: 404 })
    const recusa = recusaDeCancelar(atual.status)
    if (recusa) return NextResponse.json({ error: recusa.error }, { status: recusa.status })

    const { error: erroItens } = await supabase
      .from('settlement_items').delete().eq('settlement_id', id)
    if (erroItens) {
      console.error('settlements cancelar: itens', erroItens)
      const r = traduzErroDoLivro(erroItens)
      return NextResponse.json({ error: r.error }, { status: r.status })
    }

    const { data: cancelado, error: erroCancel } = await supabase
      .from('settlements')
      .update({ status: 'cancelado' })
      .eq('id', id)
      .eq('status', 'aberto')
      .select('id')
    if (erroCancel) {
      console.error('settlements cancelar: update', erroCancel)
      const r = traduzErroDoLivro(erroCancel)
      return NextResponse.json({ error: r.error }, { status: r.status })
    }
    if (!cancelado || cancelado.length === 0) {
      return NextResponse.json({ error: 'Este lançamento mudou de estado enquanto era cancelado.' }, { status: 409 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('settlements cancelar error:', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
