import { requireRole, createClient } from '@/lib/supabase/server'
import { mensagemDeErro } from '@/lib/db-errors'
import { NextResponse } from 'next/server'
import type { Database } from '@/lib/supabase/types'

type InfluencerUpdate = Database['public']['Tables']['influencers']['Update']

/**
 * Prorrogar e Renovar uma parceria.
 *
 * PRORROGAR: mesma negociação, prazo novo. Só mexe na data.
 * RENOVAR: negociação nova. Muda os termos e, opcionalmente, zera a contagem de
 *   vendas para a comissão.
 *
 * Zerar ou não a contagem depende do que foi combinado caso a caso — por isso é
 * escolha na tela e não regra fixa. Zerando, a próxima venda volta a ser a
 * número 1 do acordo; mantendo, a contagem segue da parceria inteira.
 *
 * O link NUNCA muda em nenhuma das duas: `coupon_code` não é tocado aqui. Era o
 * requisito que derrubou a alternativa de "criar campanha nova a cada
 * renovação" — o link está na bio e no story do influenciador.
 *
 * Os cupons já gerados também não mudam: cada um guarda o retrato do que valia
 * quando nasceu (migration 008).
 */
export async function POST(request: Request) {
  const auth = await requireRole(['admin'])
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await request.json().catch(() => ({}))
  const { id, acao, ends_at, termos, zerar_contagem } = body

  if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })
  if (!['prorrogar', 'renovar'].includes(acao)) {
    return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 })
  }

  const update: InfluencerUpdate = {
    // Data vazia significa "sem prazo", que é diferente de não mexer.
    partnership_ends_at: ends_at || null,
  }

  if (acao === 'renovar') {
    if (termos?.discount_type) update.discount_type = termos.discount_type
    if (termos?.discount_value != null) update.discount_value = Number(termos.discount_value)
    if (termos?.validity_days != null) update.validity_days = Number(termos.validity_days)
    if (termos?.commission_per_sale != null) {
      update.commission_per_sale = Number(termos.commission_per_sale)
    }
    if (termos?.commission_starts_at != null) {
      update.commission_starts_at = Number(termos.commission_starts_at)
    }
    if (zerar_contagem) {
      update.commission_count_since = new Date().toISOString().slice(0, 10)
    }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('influencers').update(update).eq('id', id)
  if (error) {
    return NextResponse.json({ error: mensagemDeErro(error.message, 'influencer') }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
