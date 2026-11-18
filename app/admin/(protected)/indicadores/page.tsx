import { redirect } from 'next/navigation'
import { createClient, getUserRole } from '@/lib/supabase/server'
import { can, type Role } from '@/lib/auth/roles'
import { resumoDoIndicador, type CupomDoIndicador } from '@/lib/indicacao/regras'
import { ListaDeIndicadores } from '@/components/admin/indicadores/ListaDeIndicadores'
import type { IndicadorNaTela } from '@/components/admin/indicadores/tipos'

/**
 * Programa de Indicação, do lado de quem administra.
 *
 * O dinheiro é somado por `resumoDoIndicador`, o MESMO que a área da pessoa
 * usa e que tem teste. Somar aqui de novo, em SQL ou à mão, criaria duas
 * respostas para "quanto ela tem a receber" — e uma delas estaria errada.
 */
export default async function IndicadoresPage() {
  const role = await getUserRole()
  if (!can(role, 'indicadores.edit')) redirect('/admin/validar')

  const supabase = await createClient()

  const [{ data: indicadores }, { data: cupons }, { data: cliques }] = await Promise.all([
    supabase.from('indicadores').select('*').order('created_at', { ascending: false }),
    supabase
      .from('coupons')
      .select('indicador_id, status, verified, commission_per_sale')
      .not('indicador_id', 'is', null),
    supabase.rpc('indicacao_cliques_por_indicador'),
  ])

  const porIndicador = new Map<string, CupomDoIndicador[]>()
  for (const c of cupons ?? []) {
    if (!c.indicador_id) continue
    const lista = porIndicador.get(c.indicador_id) ?? []
    lista.push({
      status: c.status,
      verified: c.verified,
      commission_per_sale: c.commission_per_sale,
    })
    porIndicador.set(c.indicador_id, lista)
  }

  const cliquesPor = new Map((cliques ?? []).map((c) => [c.indicador_id, c.cliques]))

  const linhas: IndicadorNaTela[] = (indicadores ?? []).map((i) => ({
    id: i.id,
    nome: i.nome,
    cpf: i.cpf,
    telefone: i.telefone,
    codigo: i.codigo,
    tetoUsos: i.teto_usos,
    ativo: i.ativo,
    encerradoEm: i.encerrado_em,
    criadoEm: i.created_at,
    aceiteComunicacoes: i.aceite_comunicacoes,
    cliques: cliquesPor.get(i.id) ?? 0,
    ...resumoDoIndicador(porIndicador.get(i.id) ?? []),
  }))

  const aPagar = linhas.reduce((s, l) => s + l.aReceber, 0)

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Programa de Indicação</h1>
        <p className="text-gray-500 text-sm mt-1">
          Quem divulga, quanto trouxe e quanto tem a receber. O prêmio é pago por fora:
          esta tela exporta a lista.
        </p>
      </div>

      <ListaDeIndicadores linhas={linhas} aPagar={aPagar} role={(role ?? '') as Role} />
    </div>
  )
}
