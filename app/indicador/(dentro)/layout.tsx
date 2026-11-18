import { redirect } from 'next/navigation'
import { getIndicadorDaSessao } from '@/lib/indicacao/sessao'
import { NavDoIndicador } from '@/components/indicacao/NavDoIndicador'

/**
 * Área de quem indica. Fora do grupo (protected) do admin e separada do portal
 * do influenciador: layout próprio, sem menu interno e sem nenhum link que leve
 * para dentro do sistema.
 *
 * A checagem aqui é a segunda camada. O proxy barra antes; a RLS é a terceira.
 */
export default async function LayoutDoIndicador({
  children,
}: {
  children: React.ReactNode
}) {
  const indicador = await getIndicadorDaSessao()
  if (!indicador) redirect('/indicador/login')

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <NavDoIndicador nome={indicador.nome} codigo={indicador.codigo} />
      <main className="min-h-[calc(100vh-3.5rem)]">{children}</main>
    </div>
  )
}
