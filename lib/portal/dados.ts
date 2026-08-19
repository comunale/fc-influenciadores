import { createClient } from '@/lib/supabase/server'
import { montarPortal, type CupomDoPortal, type ParceriaNoPortal } from '@/lib/portal'
import type { Parceria } from '@/lib/partnership'

/**
 * Tudo que o portal precisa mostrar para um influenciador.
 *
 * A RLS já limita o que estas consultas alcançam -- `partnerships` só devolve as
 * marcadas como visíveis, e as vendas vêm por função. O filtro por
 * `influencer_id` aqui não é a trava, é só clareza: a trava é o banco.
 *
 * Parceria anterior ao sistema não aparece de forma alguma, nem como linha
 * vazia. Decidido pelo César em 19/08: "a partir de agora a gente contabiliza,
 * o que é passado é passado -- o sistema começou agora". Se o sistema começa
 * agora, não existe histórico anterior para o influenciador ver, e mostrar uma
 * linha sem números só levantaria a pergunta que a decisão quis evitar.
 */
export async function carregarPortal(influencerId: string): Promise<ParceriaNoPortal[]> {
  const supabase = await createClient()

  // Nada aqui le tabela de cupom. O influenciador nao tem acesso a ela -- nem
  // por esta consulta, nem pela API com o token dele. As duas funcoes abaixo
  // devolvem exatamente o que o portal mostra, e nada alem.
  const [parceriasRes, vendasRes] = await Promise.all([
    supabase.from('partnerships').select('*').eq('influencer_id', influencerId),
    supabase.rpc('portal_vendas'),
  ])

  const parcerias = (parceriasRes.data ?? []) as unknown as (Parceria & { portal_visible: boolean })[]
  const cupons = (vendasRes.data ?? []) as unknown as CupomDoPortal[]
  return montarPortal(parcerias, cupons)
}
