import { requireRole, createClient } from '@/lib/supabase/server'
import { validateCPF } from '@/lib/validators/cpf'
import { addDays } from '@/lib/utils'
import { insertCouponWithRetry } from '@/lib/coupons/insert'
import { NextResponse } from 'next/server'
import { linkAtivo } from '@/lib/influencer-status'
import { parceriaAtiva, type Parceria } from '@/lib/partnership'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { influencer_id, campaign_id, customer_name, customer_cpf, customer_phone, customer_email, seller_id } = body

    // Autenticar antes de validar o corpo: quem não tem sessão recebe 401,
    // não uma pista sobre quais campos a rota espera.
    // So admin. E aqui que a regra vale -- esconder na tela nunca foi trava.
  const auth = await requireRole(['admin'])
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

    // Os termos vem do influenciador desde 18/08/2026, nao da campanha.
    const { data: influencer } = await supabase
      .from('influencers')
      .select('id, active, partnerships(*)')
      .eq('id', influencer_id)
      .maybeSingle()

    if (!influencer) {
      return NextResponse.json({ error: 'Influencer não encontrado.' }, { status: 404 })
    }

    const parceria = parceriaAtiva(influencer.partnerships as Parceria[] | null)
    if (!linkAtivo(influencer, parceria)) {
      return NextResponse.json({ error: 'A parceria deste influencer não está ativa.' }, { status: 400 })
    }

    const now = new Date()
    const expiresAt = addDays(now, parceria!.validity_days)

    const result = await insertCouponWithRetry(supabase, {
      influencer_id,
      campaign_id,
      partnership_id: parceria!.id,
      // Retrato do que valia agora. Sem isso, renovar a parceria reescreveria o
      // desconto e a comissao deste cupom.
      discount_type: parceria!.discount_type,
      discount_value: parceria!.discount_value,
      commission_per_sale: parceria!.commission_per_sale,
      customer_name: customer_name.trim(),
      customer_cpf: cpfClean,
      customer_phone: phoneClean,
      customer_email: customer_email.trim().toLowerCase(),
      status: 'used',
      expires_at: expiresAt.toISOString(),
      used_at: now.toISOString(),
      used_by_admin: auth.name,
      seller_id,
    }, '*, influencers(name, instagram_handle), campaigns(name)')

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
