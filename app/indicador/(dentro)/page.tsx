import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getIndicadorDaSessao } from '@/lib/indicacao/sessao'
import { resumoDasIndicacoes, type LinhaDaIndicacao } from '@/lib/indicacao/regras'
import { podeGerar } from '@/lib/indicacao/link'
import { CopiarLink } from '@/components/indicacao/CopiarLink'
import { formatCurrency, formatDate } from '@/lib/utils'

/**
 * O painel de quem indica.
 *
 * Lê pelas funções `indicacao_minhas_indicacoes()` e
 * `indicacao_meus_cliques()`, e NÃO por query direta em `coupons`. O motivo
 * está na migration 036: RLS filtra linha e não coluna, então uma policy por
 * `indicador_id` deixaria a pessoa pedir /rest/v1/coupons?select=* e ler nome,
 * CPF e telefone de cada comprador que ela indicou. As funções devolvem só o
 * primeiro nome.
 */
export default async function PainelDoIndicador() {
  const indicador = await getIndicadorDaSessao()
  if (!indicador) redirect('/indicador/login')

  const supabase = await createClient()

  const [{ data: linhas }, { data: cliques }] = await Promise.all([
    supabase.rpc('indicacao_minhas_indicacoes'),
    supabase.rpc('indicacao_meus_cliques'),
  ])

  const indicacoes = (linhas ?? []) as LinhaDaIndicacao[]
  const resumo = resumoDasIndicacoes(indicacoes)
  const estado = podeGerar(
    { ativo: indicador.ativo, teto_usos: indicador.tetoUsos },
    resumo.usos
  )

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 flex flex-col gap-6">
      {/* O aviso vem primeiro quando existe: é o que explica por que o link
          parou de gerar cupom, e a pessoa só descobriria tentando. */}
      {!estado.ok && (
        <div className="bg-[#1e1a0a] border border-[#8a6d1f] rounded-xl p-4">
          <div className="text-[#ffd166] font-semibold text-sm">Seu link não está gerando cupom</div>
          <p className="text-gray-300 text-sm mt-1 leading-relaxed">
            {estado.erro}{' '}
            {resumo.aReceber > 0 && 'Os prêmios já conferidos continuam valendo.'}
          </p>
        </div>
      )}

      <div>
        <h1 className="text-white font-bold text-2xl">Minhas indicações</h1>
        <p className="text-gray-500 text-sm mt-1">
          Cada venda conferida vale {formatCurrency(200)} para você.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Numero rotulo="Cliques no link" valor={String(cliques ?? 0)} />
        <Numero rotulo="Cupons gerados" valor={String(resumo.cupons)} />
        <Numero rotulo="Vendas feitas" valor={String(resumo.usos)} />
        <Numero
          rotulo="A receber"
          valor={formatCurrency(resumo.aReceber)}
          destaque
          detalhe={`${resumo.premiados} conferida${resumo.premiados === 1 ? '' : 's'}`}
        />
      </div>

      <CopiarLink codigo={indicador.codigo} />

      <div className="bg-[#141414] border border-[#1e1e1e] rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#1e1e1e]">
          <h2 className="text-white font-semibold text-sm">Quem usou o seu link</h2>
          <p className="text-gray-500 text-xs mt-0.5">
            Por privacidade, você vê só o primeiro nome de quem comprou.
          </p>
        </div>

        {indicacoes.length === 0 ? (
          <p className="px-5 py-8 text-center text-gray-500 text-sm">
            Ninguém usou o seu link ainda. Compartilhe e volte aqui.
          </p>
        ) : (
          <ul className="divide-y divide-[#1e1e1e]">
            {indicacoes.map((i) => (
              <li key={i.coupon_number} className="px-5 py-4 flex items-center gap-4">
                <div className="min-w-0 flex-1">
                  <div className="text-white text-sm font-medium">{i.primeiro_nome}</div>
                  <div className="text-gray-500 text-xs mt-0.5">
                    {i.coupon_number} · gerado em {formatDate(i.criado_em)}
                  </div>
                </div>
                <Situacao status={i.status} verified={i.verified} premio={i.premio} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-xs text-gray-600 text-center">
        Dúvidas:{' '}
        <a href="mailto:marketing@foxcycles.com.br" className="text-gray-400 hover:underline">
          marketing@foxcycles.com.br
        </a>
      </p>
    </div>
  )
}

function Numero({
  rotulo,
  valor,
  detalhe,
  destaque,
}: {
  rotulo: string
  valor: string
  detalhe?: string
  destaque?: boolean
}) {
  return (
    <div className="bg-[#141414] border border-[#1e1e1e] rounded-xl p-4">
      <div className="text-gray-500 text-xs">{rotulo}</div>
      <div
        className={`font-black text-2xl mt-1 ${destaque ? 'text-[#00ff87]' : 'text-white'}`}
      >
        {valor}
      </div>
      {detalhe && <div className="text-gray-600 text-xs mt-0.5">{detalhe}</div>}
    </div>
  )
}

/**
 * A situação de uma indicação, na linguagem de quem espera o prêmio.
 *
 * "Conferido" é o único estado que vale dinheiro, e por isso é o único que
 * mostra valor. Dizer "a receber" numa venda ainda não conferida criaria uma
 * expectativa que o Financeiro pode não confirmar.
 */
function Situacao({
  status,
  verified,
  premio,
}: {
  status: string
  verified: boolean
  premio: number | null
}) {
  if (status === 'used' && verified) {
    return (
      <span className="shrink-0 text-[#00ff87] text-sm font-bold">
        {formatCurrency(premio ?? 0)}
      </span>
    )
  }
  if (status === 'used') {
    return <span className="shrink-0 text-gray-400 text-xs">Em conferência</span>
  }
  if (status === 'cancelled') {
    return <span className="shrink-0 text-gray-600 text-xs">Cancelado</span>
  }
  return <span className="shrink-0 text-gray-500 text-xs">Ainda não comprou</span>
}
