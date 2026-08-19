import { sincronizarContrato } from '@/lib/contracts/gerar'
import { requireRole, createClient } from '@/lib/supabase/server'
import { mensagemDeErro } from '@/lib/db-errors'
import { NextResponse } from 'next/server'

/**
 * Prorrogar e Renovar uma parceria.
 *
 * PRORROGAR: mesma negociação, prazo novo. Só mexe na data da parceria ativa.
 * RENOVAR: encerra a ativa e abre outra, com os termos novos.
 *
 * O LINK NUNCA MUDA em nenhuma das duas. O `coupon_code` mora no influenciador,
 * não na parceria — está na bio e no story dele. Renovar troca para onde o link
 * OLHA, não o link.
 *
 * Os cupons já gerados também não mudam: cada um guarda o retrato do que valia
 * quando nasceu, e aponta para a parceria em que nasceu.
 */
export async function POST(request: Request) {
  const auth = await requireRole(['admin'])
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await request.json().catch(() => ({}))
  const { influencer_id, acao, ends_at, termos, zerar_contagem } = body

  if (!influencer_id) return NextResponse.json({ error: 'influencer_id obrigatório' }, { status: 400 })
  if (!['prorrogar', 'renovar'].includes(acao)) {
    return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 })
  }

  const supabase = await createClient()

  const { data: atual } = await supabase
    .from('partnerships')
    .select('*')
    .eq('influencer_id', influencer_id)
    .eq('status', 'ativa')
    .maybeSingle()

  if (!atual) {
    return NextResponse.json({ error: 'Este influencer não tem parceria ativa.' }, { status: 400 })
  }

  if (acao === 'prorrogar') {
    const { error } = await supabase
      .from('partnerships')
      .update({ ends_at: ends_at || null })
      .eq('id', atual.id)
    if (error) return NextResponse.json({ error: mensagemDeErro(error.message) }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  // Encerrar ANTES de criar: o índice único recusa duas ativas.
  const { error: erroEncerrar } = await supabase
    .from('partnerships')
    .update({ status: 'encerrada' })
    .eq('id', atual.id)

  if (erroEncerrar) {
    return NextResponse.json({ error: mensagemDeErro(erroEncerrar.message) }, { status: 400 })
  }

  const { data: nova, error: erroCriar } = await supabase.from('partnerships').insert({
    influencer_id,
    campaign_id: atual.campaign_id,
    status: 'ativa',
    starts_at: new Date().toISOString().slice(0, 10),
    ends_at: ends_at || null,
    fee_amount: Number(termos?.fee_amount ?? atual.fee_amount),
    fee_timing: termos?.fee_timing ?? atual.fee_timing,
    commission_per_sale: Number(termos?.commission_per_sale ?? atual.commission_per_sale),
    commission_starts_at: Number(termos?.commission_starts_at ?? atual.commission_starts_at),
    // Zerar ou não a contagem depende do que foi combinado, caso a caso.
    commission_counts_from: zerar_contagem ? 'parceria' : 'historico',
    payment_schedule: termos?.payment_schedule ?? atual.payment_schedule,
    discount_type: termos?.discount_type ?? atual.discount_type,
    discount_value: Number(termos?.discount_value ?? atual.discount_value),
    validity_days: Number(termos?.validity_days ?? atual.validity_days),
    coupon_title: atual.coupon_title,
    coupon_description: atual.coupon_description,
  }).select('id').single()

  if (erroCriar) {
    // A antiga já foi encerrada e a nova falhou: o influencer ficou sem parceria
    // ativa, e o link dele está fora do ar. Dizer isso, não falhar em silêncio.
    return NextResponse.json(
      {
        error:
          'A parceria anterior foi encerrada mas a nova não pôde ser criada — o link está fora do ar. ' +
          'Crie a parceria nova agora. Detalhe: ' + mensagemDeErro(erroCriar.message),
      },
      { status: 500 }
    )
  }

  // Renovar gera contrato novo, e o link fica desligado até o influenciador
  // aceitar. É a borda mais afiada desta entrega: quem renova numa sexta pode
  // passar o fim de semana sem link se não avisar a pessoa.
  if (nova?.id) await sincronizarContrato(nova.id)

  return NextResponse.json({ ok: true })
}
