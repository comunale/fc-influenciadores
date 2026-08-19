import { getInfluencerDaSessao } from '@/lib/portal/sessao'
import { redirect } from 'next/navigation'
import { PortalNav } from '@/components/portal/PortalNav'

/**
 * Área do influenciador. Fora do grupo (protected) do admin de propósito: layout
 * próprio, sem menu interno e sem nenhum link que leve para dentro do sistema.
 *
 * A checagem aqui é a segunda camada. O proxy já barra quem não é influenciador
 * antes de chegar neste ponto, e a RLS é a terceira.
 */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const influencer = await getInfluencerDaSessao()
  if (!influencer) redirect('/portal/login')

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <PortalNav nome={influencer.nome} handle={influencer.handle} />
      <main className="min-h-[calc(100vh-3.5rem)]">{children}</main>
    </div>
  )
}
