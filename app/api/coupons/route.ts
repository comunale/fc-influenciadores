import { createClient } from '@/lib/supabase/server'
import { validateCPF } from '@/lib/validators/cpf'
import { generateCouponNumber, addDays } from '@/lib/utils'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { influencer_code, customer_name, customer_cpf, customer_phone, customer_email } = body

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

    const phoneClean = customer_phone.replace(/\D/g, '')
    if (phoneClean.length < 10) {
      return NextResponse.json({ error: 'Telefone inválido. Informe com DDD.' }, { status: 400 })
    }

    const supabase = await createClient()

    // Buscar influencer pelo código
    const { data: influencer, error: inflError } = await supabase
      .from('influencers')
      .select('*, campaigns(*)')
      .eq('coupon_code', influencer_code.toUpperCase())
      .eq('active', true)
      .single()

    if (inflError || !influencer) {
      return NextResponse.json({ error: 'Link de influencer inválido ou inativo.' }, { status: 404 })
    }

    const campaign = (influencer as { campaigns: { id: string; active: boolean; validity_days: number } }).campaigns
    if (!campaign?.active) {
      return NextResponse.json({ error: 'Esta campanha não está mais ativa.' }, { status: 400 })
    }

    // Verificar se CPF já tem cupom nesta campanha
    const { data: existing } = await supabase
      .from('coupons')
      .select('id, coupon_number')
      .eq('customer_cpf', cpfClean)
      .eq('campaign_id', influencer.campaign_id)
      .single()

    if (existing) {
      return NextResponse.json(
        { error: 'Este CPF já possui um cupom para esta campanha.', coupon_number: existing.coupon_number },
        { status: 409 }
      )
    }

    // Gerar número único do cupom (retry em caso de colisão)
    let couponNumber = ''
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = generateCouponNumber()
      const { data: dup } = await supabase.from('coupons').select('id').eq('coupon_number', candidate).single()
      if (!dup) { couponNumber = candidate; break }
    }

    if (!couponNumber) {
      return NextResponse.json({ error: 'Erro ao gerar cupom. Tente novamente.' }, { status: 500 })
    }

    const expiresAt = addDays(new Date(), campaign.validity_days)

    // Inserir cupom
    const { data: coupon, error: insertError } = await supabase
      .from('coupons')
      .insert({
        coupon_number: couponNumber,
        influencer_id: influencer.id,
        campaign_id: influencer.campaign_id,
        customer_name: customer_name.trim(),
        customer_cpf: cpfClean,
        customer_phone: phoneClean,
        customer_email: customer_email.trim().toLowerCase(),
        status: 'pending',
        expires_at: expiresAt.toISOString(),
      })
      .select()
      .single()

    if (insertError || !coupon) {
      console.error('Insert error:', insertError)
      return NextResponse.json({ error: 'Erro ao salvar cupom. Tente novamente.' }, { status: 500 })
    }

    return NextResponse.json({ coupon_number: coupon.coupon_number }, { status: 201 })
  } catch (err) {
    console.error('Unhandled error:', err)
    return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 })
  }
}
