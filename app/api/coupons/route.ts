import { validarCelular } from '@/lib/validators/telefone'
import { createAdminClient } from '@/lib/supabase/server'
import { validateCPF } from '@/lib/validators/cpf'
import { addDays } from '@/lib/utils'
import { insertCouponWithRetry } from '@/lib/coupons/insert'
import { checkRateLimit, getClientIp, COUPON_RULES } from '@/lib/rate-limit'
import { linkAtivo } from '@/lib/influencer-status'
import { parceriaAtiva, type Parceria } from '@/lib/partnership'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    // Rota pública: limita por IP antes de qualquer trabalho.
    const allowed = await checkRateLimit('coupons', getClientIp(request), COUPON_RULES)
    if (!allowed) {
      return NextResponse.json(
        { error: 'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.' },
        { status: 429 }
      )
    }

    const body = await request.json()
    const { influencer_code, customer_name, customer_cpf, customer_phone, customer_email,
            accept_communications } = body

    // Validações básicas
    if (!influencer_code || !customer_name || !customer_cpf || !customer_phone || !customer_email) {
      return NextResponse.json({ error: 'Todos os campos são obrigatórios.' }, { status: 400 })
    }

    const cpfClean = customer_cpf.replace(/\D/g, '')
    if (!validateCPF(cpfClean)) {
      return NextResponse.json({ error: 'CPF inválido.' }, { status: 400 })
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(customer_email)) {
      return NextResponse.json({ error: 'E-mail inválido.' }, { status: 400 })
    }

    // A tela nunca foi trava neste projeto. Em 08 e 09/10/2026 entraram três
    // números quebrados porque aqui só se exigia 10 dígitos: quem digitava com
    // o +55 tinha o número truncado pela máscara e passava direto.
    const fone = validarCelular(customer_phone)
    if (!fone.ok) {
      return NextResponse.json({ error: fone.motivo }, { status: 400 })
    }
    const phoneClean = fone.digitos

    // Rota pública: lê e grava pelo servidor. As tabelas deixaram de ser
    // públicas em 18/08/2026 — quem tivesse a chave anon lia a base inteira de
    // clientes e ainda conseguia inserir cupom direto, driblando o rate limit.
    const supabase = createAdminClient()

    // Buscar influencer pelo código
    const { data: influencer, error: inflError } = await supabase
      .from('influencers')
      .select('*, partnerships(*)')
      .eq('coupon_code', influencer_code.toUpperCase())
      .maybeSingle()

    if (inflError || !influencer) {
      return NextResponse.json({ error: 'Link de influencer inválido.' }, { status: 404 })
    }

    // O link depende da PARCERIA ativa. Ver lib/influencer-status.ts.
    const parceria = parceriaAtiva(influencer.partnerships as Parceria[] | null)
    if (!linkAtivo(influencer, parceria)) {
      return NextResponse.json({ error: 'Este link não está mais ativo.' }, { status: 400 })
    }

    // Verificar se CPF já tem cupom nesta campanha.
    // O banco tem UNIQUE(customer_cpf, campaign_id) — este check é só para a mensagem
    // amigável com o código; a corrida real é tratada no insert.
    const { data: existing } = await supabase
      .from('coupons')
      .select('id, coupon_number')
      .eq('customer_cpf', cpfClean)
      .eq('campaign_id', influencer.campaign_id)
      .maybeSingle()

    if (existing) {
      return NextResponse.json(
        { error: 'Este CPF já possui um cupom para esta campanha.', coupon_number: existing.coupon_number },
        { status: 409 }
      )
    }

    const expiresAt = addDays(new Date(), parceria!.validity_days)

    const result = await insertCouponWithRetry(supabase, {
      influencer_id: influencer.id,
      campaign_id: influencer.campaign_id,
      partnership_id: parceria!.id,
      // Retrato do que valia agora. Sem isso, renovar a parceria reescreveria o
      // desconto e a comissao deste cupom.
      discount_type: parceria!.discount_type,
      discount_value: parceria!.discount_value,
      commission_per_sale: parceria!.commission_per_sale,
      customer_name: customer_name.trim(),
      customer_cpf: cpfClean,
      customer_phone: phoneClean,
      // Autorização para falar com a pessoa depois. Até 10/10/2026 a caixa
      // existia no formulário e o valor se perdia no caminho -- ninguém
      // gravava. Sem isso não há base legítima para disparo por API.
      accept_communications: accept_communications === true,
      customer_email: customer_email.trim().toLowerCase(),
      status: 'pending',
      expires_at: expiresAt.toISOString(),
    }, 'coupon_number')

    if (!result.ok) {
      if (result.reason === 'duplicate_cpf') {
        return NextResponse.json(
          { error: 'Este CPF já possui um cupom para esta campanha.' },
          { status: 409 }
        )
      }
      return NextResponse.json({ error: 'Erro ao salvar cupom. Tente novamente.' }, { status: 500 })
    }

    return NextResponse.json({ coupon_number: result.coupon.coupon_number }, { status: 201 })
  } catch (err) {
    console.error('Unhandled error:', err)
    return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 })
  }
}
