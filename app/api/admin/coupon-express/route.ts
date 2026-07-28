import { createClient } from '@/lib/supabase/server'
import { validateCPF } from '@/lib/validators/cpf'
import { addDays } from '@/lib/utils'
import { insertCouponWithRetry } from '@/lib/coupons/insert'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { influencer_id, campaign_id, customer_name, customer_cpf, customer_phone, customer_email } = body

    if (!influencer_id || !campaign_id || !customer_name || !customer_cpf || !customer_phone || !customer_email) {
      return NextResponse.json({ error: 'Todos os campos são obrigatórios.' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })

    const { data: profile } = await supabase
      .from('admin_profiles')
      .select('name')
      .eq('id', user.id)
      .single()

    if (!profile) return NextResponse.json({ error: 'Perfil não encontrado.' }, { status: 403 })

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

    // Verificar CPF duplicado nesta campanha (mensagem amigável;
    // a corrida real é barrada pelo UNIQUE(customer_cpf, campaign_id) no insert)
    const { data: existing } = await supabase
      .from('coupons')
      .select('id, coupon_number, created_at')
      .eq('customer_cpf', cpfClean)
      .eq('campaign_id', campaign_id)
      .maybeSingle()

    if (existing) {
      const date = new Date(existing.created_at).toLocaleDateString('pt-BR')
      return NextResponse.json(
        { error: `Este CPF já possui o cupom ${existing.coupon_number} gerado em ${date}.` },
        { status: 409 }
      )
    }

    const { data: campaign } = await supabase
      .from('campaigns')
      .select('validity_days, active')
      .eq('id', campaign_id)
      .single()

    if (!campaign?.active) {
      return NextResponse.json({ error: 'Campanha inativa.' }, { status: 400 })
    }

    const now = new Date()
    const expiresAt = addDays(now, campaign.validity_days)

    const result = await insertCouponWithRetry(supabase, {
      influencer_id,
      campaign_id,
      customer_name: customer_name.trim(),
      customer_cpf: cpfClean,
      customer_phone: phoneClean,
      customer_email: customer_email.trim().toLowerCase(),
      status: 'used',
      expires_at: expiresAt.toISOString(),
      used_at: now.toISOString(),
      used_by_admin: profile.name,
    }, '*, influencers(name, instagram_handle), campaigns(name, discount_value, discount_type, coupon_title)')

    if (!result.ok) {
      if (result.reason === 'duplicate_cpf') {
        return NextResponse.json(
          { error: 'Este CPF já possui um cupom para esta campanha.' },
          { status: 409 }
        )
      }
      return NextResponse.json({ error: 'Erro ao salvar. Tente novamente.' }, { status: 500 })
    }

    return NextResponse.json({ coupon: result.coupon }, { status: 201 })
  } catch (err) {
    console.error('coupon-express error:', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
