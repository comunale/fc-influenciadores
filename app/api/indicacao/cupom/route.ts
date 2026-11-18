import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { checkRateLimit, getClientIp, COUPON_RULES } from '@/lib/rate-limit'
import { validateCPF } from '@/lib/validators/cpf'
import { validarCelular } from '@/lib/validators/telefone'
import { insertCouponWithRetry } from '@/lib/coupons/insert'
import {
  podeGerar,
  NOME_DA_CAMPANHA,
  VALOR_DO_DESCONTO,
  VALOR_DO_PREMIO,
} from '@/lib/indicacao/link'

/**
 * O cupom do comprador, nascido pelo link de uma indicação.
 *
 * Diferenças deliberadas em relação a /api/coupons (o link do influenciador):
 *
 *  - NÃO pede e-mail. O César decidiu em 17/11 que nome, CPF e telefone
 *    bastam para dar o desconto e amarrar a venda a quem indicou.
 *  - NÃO tem vencimento: `expires_at` fica nulo (decisão 11).
 *  - grava `indicador_cpf`, que é o que permite ao banco recusar
 *    autoindicação na própria linha, sem subconsulta.
 *
 * O cupom precisa nascer AQUI, pelo link, antes de a pessoa chegar na loja. A
 * rota de cupom express (/api/admin/coupon-express) não participa do programa:
 * se participasse, o vendedor poderia "indicar" no balcão todo cliente que já
 * ia comprar, e o prêmio sairia em venda que a loja faria sozinha.
 */
export async function POST(request: Request) {
  try {
    const allowed = await checkRateLimit('indicacao-cupom', getClientIp(request), COUPON_RULES)
    if (!allowed) {
      return NextResponse.json(
        { error: 'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.' },
        { status: 429 }
      )
    }

    const body = await request.json()
    const { codigo, customer_name, customer_cpf, customer_phone, accept_communications } = body

    if (!codigo || !customer_name || !customer_cpf || !customer_phone) {
      return NextResponse.json({ error: 'Nome, CPF e WhatsApp são obrigatórios.' }, { status: 400 })
    }

    const cpfLimpo = String(customer_cpf).replace(/\D/g, '')
    if (!validateCPF(cpfLimpo)) {
      return NextResponse.json({ error: 'CPF inválido.' }, { status: 400 })
    }

    const fone = validarCelular(String(customer_phone))
    if (!fone.ok) {
      return NextResponse.json({ error: fone.motivo }, { status: 400 })
    }

    const supabase = createAdminClient()

    const { data: indicador } = await supabase
      .from('indicadores')
      .select('id, nome, cpf, ativo, teto_usos')
      .eq('codigo', String(codigo).toUpperCase())
      .maybeSingle()

    if (!indicador) {
      return NextResponse.json({ error: 'Link de indicação inválido.' }, { status: 404 })
    }

    // O teto conta USOS: cupom que virou venda no balcão. Conta aqui, na hora
    // de gerar, porque batido o teto o link para de gerar (decisão 14).
    const { count: usos } = await supabase
      .from('coupons')
      .select('id', { count: 'exact', head: true })
      .eq('indicador_id', indicador.id)
      .eq('status', 'used')

    const liberado = podeGerar(indicador, usos ?? 0)
    if (!liberado.ok) {
      return NextResponse.json({ error: liberado.erro }, { status: 409 })
    }

    // O CHECK coupons_sem_autoindicacao é a rede. Esta é a frase.
    if (cpfLimpo === indicador.cpf) {
      return NextResponse.json(
        { error: 'Você não pode usar o seu próprio link. Indique outra pessoa.' },
        { status: 400 }
      )
    }

    const { data: campanha } = await supabase
      .from('campaigns')
      .select('id')
      .eq('name', NOME_DA_CAMPANHA)
      .maybeSingle()

    if (!campanha) {
      console.error('indicacao/cupom: campanha do programa não encontrada')
      return NextResponse.json(
        { error: 'Programa indisponível neste momento. Avise marketing@foxcycles.com.br.' },
        { status: 503 }
      )
    }

    const resultado = await insertCouponWithRetry(
      supabase,
      {
        campaign_id: campanha.id,
        influencer_id: null,
        partnership_id: null,
        indicador_id: indicador.id,
        indicador_cpf: indicador.cpf,
        discount_type: 'fixed',
        discount_value: VALOR_DO_DESCONTO,
        // O retrato do que o prêmio valia quando este cupom nasceu. Mudar o
        // valor do programa depois não reescreve o que já foi prometido.
        commission_per_sale: VALOR_DO_PREMIO,
        customer_name: String(customer_name).trim(),
        customer_cpf: cpfLimpo,
        customer_phone: fone.digitos,
        customer_email: null,
        accept_communications: accept_communications === true,
        status: 'pending',
        expires_at: null,
      },
      'coupon_number'
    )

    if (!resultado.ok) {
      if (resultado.reason === 'duplicate_cpf') {
        const { data: existente } = await supabase
          .from('coupons')
          .select('coupon_number')
          .eq('customer_cpf', cpfLimpo)
          .eq('campaign_id', campanha.id)
          .maybeSingle()

        return NextResponse.json(
          {
            error: 'Este CPF já tem um cupom do Programa de Indicação.',
            coupon_number: existente?.coupon_number,
          },
          { status: 409 }
        )
      }
      return NextResponse.json({ error: 'Erro ao gerar cupom. Tente novamente.' }, { status: 500 })
    }

    return NextResponse.json({ coupon_number: resultado.coupon.coupon_number }, { status: 201 })
  } catch (err) {
    console.error('indicacao/cupom erro não tratado:', err)
    return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 })
  }
}
