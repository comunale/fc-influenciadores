import { createClient } from '@/lib/supabase/server'
import { montarPortal, linhaFechada, type CupomDoPortal, type ParceriaNoPortal } from '@/lib/portal'
import type { Parceria } from '@/lib/partnership'

/**
 * Tudo que o portal precisa mostrar para um influenciador.
 *
 * A RLS já limita o que estas consultas alcançam -- `partnerships` só devolve as
 * marcadas como visíveis, e `coupons` só os dele. O filtro por `influencer_id`
 * aqui não é a trava, é só clareza: a trava é o banco.
 */
export async function carregarPortal(influencerId: string): Promise<ParceriaNoPortal[]> {
  const supabase = await createClient()

  // Nada aqui le tabela de cupom. O influenciador nao tem acesso a ela -- nem
  // por esta consulta, nem pela API com o token dele. As duas funcoes abaixo
  // devolvem exatamente o que o portal mostra, e nada alem.
  const [parceriasRes, vendasRes, encerradasRes] = await Promise.all([
    supabase.from('partnerships').select('*').eq('influencer_id', influencerId),
    supabase.rpc('portal_vendas'),
    supabase.rpc('portal_parcerias_encerradas'),
  ])

  const parcerias = (parceriasRes.data ?? []) as unknown as (Parceria & { portal_visible: boolean })[]
  const cupons = (vendasRes.data ?? []) as unknown as CupomDoPortal[]
  const encerradas = (encerradasRes.data ?? []) as unknown as
    { id: string; starts_at: string; ends_at: string | null }[]

  return [...montarPortal(parcerias, cupons), ...encerradas.map(linhaFechada)]
    .sort((a, b) => b.starts_at.localeCompare(a.starts_at))
}
