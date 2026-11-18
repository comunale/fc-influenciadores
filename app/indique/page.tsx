import { FoxLogo } from '@/components/FoxLogo'
import { FormularioDeCadastro } from '@/components/indicacao/FormularioDeCadastro'
import type { Metadata } from 'next'

const TITULO = 'FoxCycles | Programa de Indicação — ganhe R$ 200 por indicação'
const DESCRICAO =
  'Indique quem quer uma moto elétrica: a pessoa leva R$ 300 de desconto e você ganha R$ 200 por venda. Qualquer pessoa pode participar.'

export const metadata: Metadata = {
  title: TITULO,
  description: DESCRICAO,
  openGraph: { title: TITULO, description: DESCRICAO, siteName: 'FoxCycles', type: 'website' },
}

const PASSOS = [
  {
    numero: '1',
    titulo: 'Você se cadastra',
    texto: 'Leva um minuto. Você sai daqui com um link e um número de cupom, já valendo.',
  },
  {
    numero: '2',
    titulo: 'Você divulga',
    texto:
      'Manda o link para quem está pensando em comprar. Pode ser família, amigo, cliente, seguidor — qualquer pessoa.',
  },
  {
    numero: '3',
    titulo: 'A pessoa compra com desconto',
    texto:
      'Quem usa o seu link leva R$ 300 de desconto na moto. É o desconto que faz ela querer usar o seu link e não outro.',
  },
  {
    numero: '4',
    titulo: 'Você recebe R$ 200',
    texto:
      'Assim que a loja confere a nota fiscal da venda, os R$ 200 aparecem na sua área como valor a receber. A FOX paga por fora.',
  },
]

export default function IndiquePage() {
  return (
    <main className="min-h-screen bg-[#0a0a0a] flex flex-col items-center">
      <header className="w-full bg-[#0a0a0a] border-b border-[#1e1e1e] px-4 py-4 flex justify-center">
        <FoxLogo size="md" />
      </header>

      <div className="w-full max-w-md px-4 py-8 flex flex-col gap-8">
        <div className="text-center flex flex-col gap-3">
          <span className="inline-block self-center bg-[#1e1e1e] border border-[#2a2a2a] text-gray-300 text-xs px-4 py-1.5 rounded-full uppercase tracking-widest">
            Programa de Indicação
          </span>
          <div>
            <div className="text-6xl font-black text-[#00ff87] leading-none">R$ 200</div>
            <div className="text-xl font-bold text-white mt-2">
              para você, por cada indicação que virar venda
            </div>
          </div>
          <p className="text-sm text-gray-400 leading-relaxed">
            E <strong className="text-white">R$ 300 de desconto</strong> para quem comprar pelo seu
            link. Você não precisa ser influenciador, nem ter comprado uma FOX: precisa conhecer
            alguém que queira uma.
          </p>
        </div>

        <div className="flex flex-col gap-4">
          {PASSOS.map((p) => (
            <div key={p.numero} className="flex gap-4">
              <div className="shrink-0 h-8 w-8 rounded-full bg-[#1e1e1e] border border-[#2a2a2a] flex items-center justify-center text-[#00ff87] font-bold text-sm">
                {p.numero}
              </div>
              <div>
                <div className="text-white font-semibold text-sm">{p.titulo}</div>
                <p className="text-gray-400 text-sm leading-relaxed mt-0.5">{p.texto}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-[#2a2a2a]" />
          <span className="text-xs text-gray-500 uppercase tracking-widest">Cadastro</span>
          <div className="flex-1 h-px bg-[#2a2a2a]" />
        </div>

        <div className="bg-[#141414] border border-[#1e1e1e] rounded-2xl p-6">
          <FormularioDeCadastro />
        </div>

        {/* As regras ficam na própria página, e não num link "veja os termos":
            quem lê o que aceitou reclama menos depois. */}
        <div className="border border-[#1e1e1e] rounded-2xl p-5 flex flex-col gap-2">
          <div className="text-white font-semibold text-sm">As regras, sem letra miúda</div>
          <ul className="text-gray-400 text-sm leading-relaxed flex flex-col gap-1.5 list-disc pl-4">
            <li>O prêmio é de R$ 200 por venda, e conta depois que a nota fiscal é conferida.</li>
            <li>Você não pode usar o seu próprio link: indicação é para outra pessoa.</li>
            <li>Cada CPF usa o programa uma vez.</li>
            <li>O pagamento do prêmio é feito pela FoxCycles por fora do sistema.</li>
            <li>A FoxCycles pode encerrar o benefício de um participante quando entender que é o caso.</li>
          </ul>
        </div>

        <div className="text-center flex flex-col gap-2">
          <a href="/indicador" className="text-[#00ff87] hover:underline text-sm font-medium">
            Já me cadastrei — entrar na minha área
          </a>
          <p className="text-xs text-gray-600">
            Dúvidas ou senha esquecida:{' '}
            <a href="mailto:marketing@foxcycles.com.br" className="text-gray-400 hover:underline">
              marketing@foxcycles.com.br
            </a>
          </p>
        </div>
      </div>
    </main>
  )
}
