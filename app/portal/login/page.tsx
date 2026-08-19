import { getUsuarioAtual } from '@/lib/supabase/server'
import { FoxLogo } from '@/components/FoxLogo'
import { LoginForm } from '@/components/portal/LoginForm'
import { SairDaSessao } from '@/components/portal/SairDaSessao'
import { ROLE_LABELS, type Role } from '@/lib/auth/roles'

/**
 * Entrada do influenciador, separada da do admin.
 *
 * Se quem abre esta página já está logado como usuário INTERNO, a página diz
 * isso em vez de mandar a pessoa embora. Quase sempre é o próprio César
 * querendo entrar como influenciador para conferir o portal -- e ser devolvido
 * ao admin sem explicação parece defeito do sistema, não regra.
 *
 * Influenciador já logado nem chega aqui: o proxy manda direto para /portal.
 */
export default async function PortalLoginPage() {
  const usuario = await getUsuarioAtual()
  const interno = usuario && usuario.role !== 'influencer' ? usuario : null

  return (
    <main className="min-h-screen bg-[#0a0a0a] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <FoxLogo size="lg" />
          <h1 className="text-white font-bold text-xl mt-4">Portal do Influenciador</h1>
          <p className="text-gray-500 text-sm mt-1">FoxCycles</p>
        </div>

        {interno ? (
          <div className="bg-[#141414] border border-[#1e1e1e] rounded-2xl p-6 flex flex-col gap-4">
            <div>
              <p className="text-white text-sm leading-relaxed">
                Você está conectado como{' '}
                <span className="font-semibold">{interno.email || interno.name}</span>
                {' '}({ROLE_LABELS[interno.role as Role] || interno.role}).
              </p>
              <p className="text-gray-500 text-sm mt-2 leading-relaxed">
                Este portal é a área do influenciador. Para entrar como um deles —
                por exemplo, para conferir o que ele vê — saia primeiro.
              </p>
            </div>
            <SairDaSessao />
            <a
              href="/admin"
              className="text-gray-500 hover:text-white text-sm text-center transition-colors"
            >
              Voltar para o painel
            </a>
          </div>
        ) : (
          <>
            <LoginForm />
            <p className="text-gray-600 text-xs text-center mt-6 leading-relaxed">
              O acesso é criado pela FoxCycles. Esqueceu a senha? Fale com quem cuida
              da sua parceria.
            </p>
          </>
        )}
      </div>
    </main>
  )
}
