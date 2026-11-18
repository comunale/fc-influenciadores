import { getUsuarioAtual } from '@/lib/supabase/server'
import { FoxLogo } from '@/components/FoxLogo'
import { LoginDoIndicador } from '@/components/indicacao/LoginDoIndicador'
import { SairDaSessao } from '@/components/portal/SairDaSessao'
import { ROLE_LABELS, type Role } from '@/lib/auth/roles'

/**
 * Entrada do Programa de Indicação, separada do admin e do portal.
 *
 * Quem abre esta página já logado como usuário interno lê o que está
 * acontecendo em vez de ser mandado embora — quase sempre é o próprio César
 * conferindo a tela da pessoa, e ser devolvido sem explicação parece defeito.
 */
export default async function LoginDoIndicadorPage() {
  const usuario = await getUsuarioAtual()
  const interno = usuario && usuario.role !== 'indicador' ? usuario : null

  return (
    <main className="min-h-screen bg-[#0a0a0a] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <FoxLogo size="lg" />
          <h1 className="text-white font-bold text-xl mt-4">Programa de Indicação</h1>
          <p className="text-gray-500 text-sm mt-1">Entre com seu CPF</p>
        </div>

        {interno ? (
          <div className="bg-[#141414] border border-[#1e1e1e] rounded-2xl p-6 flex flex-col gap-4">
            <div>
              <p className="text-white text-sm leading-relaxed">
                Você está conectado como{' '}
                <span className="font-semibold">{interno.email || interno.name}</span>{' '}
                ({ROLE_LABELS[interno.role as Role] || interno.role}).
              </p>
              <p className="text-gray-500 text-sm mt-2 leading-relaxed">
                Esta é a área de quem indica. Para entrar como um participante — por
                exemplo, para conferir o que ele vê — saia primeiro.
              </p>
            </div>
            <SairDaSessao voltarPara="/indicador/login" rotulo="Sair e entrar como participante" />
            <a
              href="/admin"
              className="text-gray-500 hover:text-white text-sm text-center transition-colors"
            >
              Voltar para o painel
            </a>
          </div>
        ) : (
          <>
            <LoginDoIndicador />
            <p className="text-gray-600 text-xs text-center mt-6 leading-relaxed">
              Ainda não participa?{' '}
              <a href="/indique" className="text-[#00ff87] hover:underline">
                Cadastre-se aqui
              </a>
              .
              <br />
              Esqueceu a senha? Escreva para{' '}
              <a href="mailto:marketing@foxcycles.com.br" className="text-gray-400 hover:underline">
                marketing@foxcycles.com.br
              </a>
              .
            </p>
          </>
        )}
      </div>
    </main>
  )
}
