import { requireRole, createClient } from '@/lib/supabase/server'
import { validateCPF } from '@/lib/validators/cpf'
import { addDays } from '@/lib/utils'
import { insertCouponWithRetry } from '@/lib/coupons/insert'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { influencer_id, campaign_id, customer_name, customer_cpf, customer_phone, customer_email, seller_id } = body

    // Autenticar antes de validar o corpo: quem não tem sessão recebe 401,
    // não uma pista sobre quais campos a rota espera.
    const auth = await requireRole(['admin', 'moderator'])
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    if (!influencer_id || !campaign_id || !customer_name || !customer_cpf || !customer_phone || !customer_email) {
      return NextResponse.json({ error: 'Todos os campos são obrigatórios.' }, { status: 400 })
    }
    if (!seller_id) {
      return NextResponse.json({ error: 'Escolha o vendedor antes de validar.' }, { status: 400 })
    }

    const supabase = await createClient()

    // Mesma checagem da rota de validação: o vendedor precisa existir, estar
    // ativo e ser da loja de quem chamou. O trigger de INSERT repete no banco.
    const { data: seller } = await supabase
      .from('sellers')
      .select('id, store_name, active')
      .eq('id', seller_id)
      .single()

    if (!seller?.active) {
      return NextResponse.json({ error: 'Vendedor inválido ou inativo.' }, { status: 400 })
    }

    if (auth.role === 'moderator') {
      const { data: profile } = await supabase
        .from('admin_profiles')
        .select('store_name')
        .eq('id', auth.userId)
        .single()

      if (!profile?.store_name || profile.store_name !== seller.store_name) {
        return NextResponse.json({ error: 'Vendedor não pertence à sua loja.' }, { status: 403 })
      }
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
      used_by_admin: auth.name,
      seller_id,
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
