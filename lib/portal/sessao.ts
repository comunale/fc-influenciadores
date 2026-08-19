import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

/**
 * O influenciador dono da sessão atual, do lado do servidor.
 *
 * Devolve null para qualquer outro papel -- é a checagem que impede um usuário
 * interno de cair no portal por um link direto. O `proxy.ts` já barra antes;
 * isto é a segunda camada, e a RLS é a terceira.
 *
 * Usa `createClient` (sessão do usuário), nunca o cliente de service role: é
 * justamente a RLS que garante que ele só alcança o que é dele. Ler pelo
 * service role aqui apagaria a camada que mais importa.
 */
export const getInfluencerDaSessao = cache(async (): Promise<{
  userId: string
  influencerId: string
  nome: string
  handle: string
  couponCode: string
  ativo: boolean
} | null> => {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: perfil } = await supabase
    .from('admin_profiles')
    .select('role, active, influencer_id')
    .eq('id', user.id)
    .single()

  if (!perfil?.active || perfil.role !== 'influencer' || !perfil.influencer_id) return null

  const { data: inf } = await supabase
    .from('influencers')
    .select('id, name, instagram_handle, coupon_code, active')
    .eq('id', perfil.influencer_id)
    .single()

  if (!inf) return null

  return {
    userId: user.id,
    influencerId: inf.id,
    nome: inf.name,
    handle: inf.instagram_handle,
    couponCode: inf.coupon_code,
    ativo: inf.active,
  }
})
