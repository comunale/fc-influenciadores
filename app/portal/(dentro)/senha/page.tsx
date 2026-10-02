import { getInfluencerDaSessao } from '@/lib/portal/sessao'
import { redirect } from 'next/navigation'
import { FormSenha } from '@/components/portal/FormSenha'

export const dynamic = 'force-dynamic'

export default async function SenhaPage() {
  const influencer = await getInfluencerDaSessao()
  if (!influencer) redirect('/portal/login')

  // Primeira vez: ele ainda está com a senha que a FoxCycles gerou e mandou.
  // O proxy segura o portal inteiro aqui até isto ser resolvido.
  const primeiraVez = !influencer.senhaDefinidaAt

  return (
    <div className="max-w-md mx-auto px-4 py-6 flex flex-col gap-6">
      <div>
        <h1 className="text-white font-bold text-2xl">
          {primeiraVez ? 'Crie a sua senha' : 'Trocar senha'}
        </h1>
        <p className="text-gray-500 text-sm mt-1 leading-relaxed">
          {primeiraVez
            ? 'Antes de continuar, troque a senha que a FoxCycles enviou por uma sua. ' +
              'A partir daí, só você a conhece.'
            : 'Se você entrou com a senha que a FoxCycles enviou, troque por uma sua.'}
        </p>
      </div>

      {primeiraVez && (
        <div className="bg-[#141414] border border-yellow-900/40 rounded-2xl p-4">
          <p className="text-yellow-500 text-sm leading-relaxed">
            O portal e o contrato só abrem depois disto. É assim de propósito: um
            contrato aceito com uma senha que outra pessoa também conhece não
            prova que foi você quem aceitou.
          </p>
        </div>
      )}

      <FormSenha primeiraVez={primeiraVez} />

      <p className="text-gray-600 text-xs leading-relaxed">
        Esqueceu a senha? Fale com quem cuida da sua parceria na FoxCycles — o
        sistema não envia e-mail de recuperação.
      </p>
    </div>
  )
}
