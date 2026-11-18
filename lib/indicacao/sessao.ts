import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

/**
 * O indicador dono da sessão atual, do lado do servidor.
 *
 * Espelho de `lib/portal/sessao.ts`, e pelos mesmos motivos: devolve null para
 * qualquer outro papel, o que impede um usuário interno de cair na área da
 * pessoa por link direto. O `proxy.ts` barra antes; isto é a segunda camada, e
 * a RLS é a terceira.
 *
 * Usa `createClient` (sessão do usuário), nunca o cliente de service role — é a
 * RLS que garante que ela só alcança o que é dela. Ler pelo service role aqui
 * apagaria a camada que mais importa.
 */
export const getIndicadorDaSessao = cache(async (): Promise<{
  userId: string
  indicadorId: string
  nome: string
  codigo: string
  ativo: boolean
  tetoUsos: number | null
} | null> => {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: perfil } = await supabase
    .from('admin_profiles')
    .select('role, active, indicador_id')
    .eq('id', user.id)
    .single()

  if (!perfil?.active || perfil.role !== 'indicador' || !perfil.indicador_id) return null

  const { data: ind } = await supabase
    .from('indicadores')
    .select('id, nome, codigo, ativo, teto_usos')
    .eq('id', perfil.indicador_id)
    .single()

  if (!ind) return null

  return {
    userId: user.id,
    indicadorId: ind.id,
    nome: ind.nome,
    codigo: ind.codigo,
    ativo: ind.ativo,
    tetoUsos: ind.teto_usos,
  }
})
