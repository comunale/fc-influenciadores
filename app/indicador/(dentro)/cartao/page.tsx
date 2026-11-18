import { redirect } from 'next/navigation'
import { getIndicadorDaSessao } from '@/lib/indicacao/sessao'
import { CartaoDeBeneficios } from '@/components/indicacao/CartaoDeBeneficios'

export default async function CartaoPage() {
  const indicador = await getIndicadorDaSessao()
  if (!indicador) redirect('/indicador/login')

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 flex flex-col gap-6 items-center">
      <div className="text-center no-print">
        <h1 className="text-white font-bold text-2xl">Meu cartão de benefícios</h1>
        <p className="text-gray-500 text-sm mt-1 max-w-sm">
          Mostre na loja, imprima, ou mande o print para quem você quer indicar.
        </p>
      </div>

      <CartaoDeBeneficios nome={indicador.nome} codigo={indicador.codigo} />

      {!indicador.ativo && (
        <div className="no-print w-full max-w-sm bg-[#1e1a0a] border border-[#8a6d1f] rounded-xl p-4">
          <p className="text-[#ffd166] text-sm leading-relaxed">
            Este benefício foi encerrado pela FoxCycles: o cartão não gera mais cupom. Os
            prêmios já conferidos continuam valendo.
          </p>
        </div>
      )}
    </div>
  )
}
