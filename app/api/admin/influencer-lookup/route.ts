import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const handle = searchParams.get('handle')?.trim().replace(/^@/, '').toUpperCase()

    if (!handle) {
      return NextResponse.json({ error: 'Handle obrigatório.' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })

    const { data: influencer, error } = await supabase
      .from('influencers')
      .select('*, campaigns(*)')
      .eq('coupon_code', handle)
      .eq('active', true)
      .single()

    if (error || !influencer) {
      return NextResponse.json({ error: 'Influencer ou cupom não encontrado.' }, { status: 404 })
    }

    const campaign = influencer.campaigns as { active: boolean }
    if (!campaign?.active) {
      return NextResponse.json({ error: 'Campanha inativa.' }, { status: 400 })
    }

    return NextResponse.json({ influencer })
  } catch (err) {
    console.error('influencer-lookup error:', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
