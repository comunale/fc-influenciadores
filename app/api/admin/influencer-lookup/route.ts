import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { linkAtivo } from '@/lib/influencer-status'
import { parceriaAtiva, type Parceria } from '@/lib/partnership'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const bruto = searchParams.get('handle')?.trim().replace(/^@/, '').toUpperCase() ?? ''
    // Vai montar um filtro .or() em texto: so deixa passar o que e seguro ali.
    const handle = bruto.replace(/[^A-Z0-9._-]/g, '')

    if (!handle) {
      return NextResponse.json({ error: 'Handle obrigatório.' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })

    const { data: influencer, error } = await supabase
      .from('influencers')
      .select('*, partnerships(*), campaigns(name)')
      // Busca SO pelo codigo do cupom, nunca pelo @ do Instagram. Decisao do
      // Cesar em 18/08/2026: a tela prometia os dois mas so aceitava o codigo, e
      // ele preferiu tirar a promessa a manter duas formas de achar a mesma coisa.
      .eq('coupon_code', handle)
      .maybeSingle()

    if (error || !influencer) {
      return NextResponse.json(
        { error: 'Código não encontrado. Confira o código do influencer na tela Influencers.' },
        { status: 404 }
      )
    }

    // A campanha nao decide mais. Ver lib/influencer-status.ts.
    if (!linkAtivo(influencer, parceriaAtiva(influencer.partnerships as Parceria[] | null))) {
      return NextResponse.json({ error: 'A parceria deste influencer não está ativa.' }, { status: 400 })
    }

    return NextResponse.json({ influencer })
  } catch (err) {
    console.error('influencer-lookup error:', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
