import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { coupon_number, admin_name } = body

    if (!coupon_number) {
      return NextResponse.json({ error: 'Código do cupom é obrigatório.' }, { status: 400 })
    }

    const supabase = await createClient()

    // Verificar autenticação
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
    }

    // Buscar perfil (store ou admin pode validar)
    const { data: profile } = await supabase
      .from('admin_profiles')
      .select('role, name')
      .eq('id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'Perfil não encontrado.' }, { status: 403 })
    }

    // Buscar cupom com dados relacionados
    const { data: coupon, error } = await supabase
      .from('coupons')
      .select('*, influencers(name, instagram_handle), campaigns(name, discount_value, discount_type, coupon_title)')
      .eq('coupon_number', coupon_number.toUpperCase().trim())
      .single()

    if (error || !coupon) {
      return NextResponse.json({ error: 'Cupom não encontrado.' }, { status: 404 })
    }

    // Verificar status atual
    if (coupon.status === 'used') {
      return NextResponse.json({ error: 'Cupom já foi utilizado.', coupon }, { status: 400 })
    }

    if (coupon.status === 'cancelled') {
      return NextResponse.json({ error: 'Cupom cancelado.', coupon }, { status: 400 })
    }

    if (coupon.status === 'expired' || new Date(coupon.expires_at) < new Date()) {
      await supabase.from('coupons').update({ status: 'expired' }).eq('id', coupon.id)
      return NextResponse.json({ error: 'Cupom expirado.', coupon }, { status: 400 })
    }

    // Marcar como usado
    const { data: updated, error: updateError } = await supabase
      .from('coupons')
      .update({
        status: 'used',
        used_at: new Date().toISOString(),
        used_by_admin: admin_name || profile.name,
      })
      .eq('id', coupon.id)
      .select('*, influencers(name, instagram_handle), campaigns(name, discount_value, discount_type, coupon_title)')
      .single()

    if (updateError || !updated) {
      return NextResponse.json({ error: 'Erro ao validar cupom.' }, { status: 500 })
    }

    return NextResponse.json({ success: true, coupon: updated })
  } catch (err) {
    console.error('Validate error:', err)
    return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 })
  }
}

// GET para buscar cupom sem validar (para preview antes de confirmar)
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const coupon_number = searchParams.get('code')

    if (!coupon_number) {
      return NextResponse.json({ error: 'Código obrigatório.' }, { status: 400 })
    }

    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
    }

    const { data: coupon, error } = await supabase
      .from('coupons')
      .select('*, influencers(name, instagram_handle), campaigns(name, discount_value, discount_type, coupon_title)')
      .eq('coupon_number', coupon_number.toUpperCase().trim())
      .single()

    if (error || !coupon) {
      return NextResponse.json({ error: 'Cupom não encontrado.' }, { status: 404 })
    }

    // Verificar expiração dinamicamente
    if (coupon.status === 'pending' && new Date(coupon.expires_at) < new Date()) {
      await supabase.from('coupons').update({ status: 'expired' }).eq('id', coupon.id)
      coupon.status = 'expired'
    }

    return NextResponse.json({ coupon })
  } catch (err) {
    console.error('Get coupon error:', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
