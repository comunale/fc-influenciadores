'use client'

import { useState } from 'react'
import { DetalheDoLancamento } from './DetalheDoLancamento'
import { FecharPeriodo } from './FecharPeriodo'
import { brl, dia, diaDoUso, diaIsoDoUso, SITUACAO, type GrupoDoInfluenciador, type Lancamento } from './tipos'

const TIPO: Record<string, string> = { comissao: 'Comissão', fixo: 'Fixo', restituicao: 'Restituição' }

function LinhaDoLancamento({ l }: { l: Lancamento }) {
  const [aberta, setAberta] = useState(l.status === 'aberto')
  const s = SITUACAO[l.status] ?? { texto: l.status, classe: 'bg-[#2a2a2a] text-gray-400' }
  const periodo = l.periodo_de && l.periodo_ate ? `${dia(l.periodo_de)} a ${dia(l.periodo_ate)}` : 'sem período'
  // O rotulo do periodo e a pergunta que o Financeiro respondeu ("outubro
  // fechado"); o que foi gravado nao muda. Se os cupons incluidos vao alem dele
  // (pos-fim escolhidos a mao), a linha diz.
  const dias = l.settlement_items.flatMap((i) => (i.coupons?.used_at ? [diaIsoDoUso(i.coupons.used_at)] : [])).sort()
  const ultimo = dias[dias.length - 1]
  const primeiro = dias[0]
  const alem =
    l.periodo_ate && ultimo && ultimo > l.periodo_ate ? ' - contém cupons usados até ' + diaDoUso(ultimo) : ''
  const antes =
    l.periodo_de && primeiro && primeiro < l.periodo_de ? ' - contém cupons usados desde ' + diaDoUso(primeiro) : ''
  // Um botao por linha, e o rotulo diz o que ele faz com esta linha.
  const rotulo = aberta ? 'Recolher' : l.status === 'aberto' ? 'Pagar ou cancelar' : 'Ver cupons'

  return (
    <li className="border border-[#1e1e1e] rounded-xl overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 flex-wrap">
        <span className={`text-xs px-2 py-0.5 rounded-full ${s.classe}`}>{s.texto}</span>
        <div className="flex-1 min-w-[10rem]">
          <p className="text-sm text-white">{TIPO[l.tipo] ?? l.tipo} - {periodo}{antes}{alem}</p>
          <p className="text-xs text-gray-500">
            {l.settlement_items.length} cupom(ns)
            {l.status === 'pago' ? ` - pago em ${dia(l.paid_at)}` : ''}
          </p>
        </div>
        <span className="text-white font-medium">{brl(l.valor)}</span>
        <button
          onClick={() => setAberta((v) => !v)}
          aria-expanded={aberta}
          className="text-xs px-3 py-1.5 rounded-md border border-[#2a2a2a] text-gray-300 hover:text-white hover:border-[#00ff87] transition-colors"
        >
          {rotulo}
        </button>
      </div>
      {aberta && <DetalheDoLancamento l={l} />}
    </li>
  )
}

export function ListaDeLancamentos({ grupos }: { grupos: GrupoDoInfluenciador[] }) {
  if (grupos.length === 0) {
    return (
      <div className="bg-[#141414] border border-[#1e1e1e] rounded-2xl p-6">
        <p className="text-gray-400 text-sm">Nenhuma parceria cadastrada ainda.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {grupos.map((g) => {
        const todos = g.parcerias.flatMap((p) => p.lancamentos)
        const soma = (status: string) =>
          todos.filter((l) => l.status === status).reduce((t, l) => t + Number(l.valor), 0)

        return (
          <section key={g.influencer.id} className="bg-[#141414] border border-[#1e1e1e] rounded-2xl p-4 sm:p-5 flex flex-col gap-4">
            <header className="flex items-baseline justify-between gap-3 flex-wrap">
              <div>
                <h2 className="text-white font-semibold">{g.influencer.name}</h2>
                {g.influencer.instagram_handle && (
                  <p className="text-xs text-gray-500">@{g.influencer.instagram_handle.replace(/^@/, '')}</p>
                )}
              </div>
              <p className="text-xs text-gray-400">
                Em aberto <span className="text-yellow-400 font-medium">{brl(soma('aberto'))}</span>
                {' - '}
                Pago em lançamentos <span className="text-[#00ff87] font-medium">{brl(soma('pago'))}</span>
              </p>
            </header>
            {g.pagosForaDeLancamento > 0 && (
              <p className="text-xs text-gray-500 bg-[#0f0f0f] border border-[#1e1e1e] rounded-lg px-3 py-2">
                Mais {g.pagosForaDeLancamento} cupom(ns) já marcado(s) como pago fora de lançamento (anteriores ao Financeiro).
                Eles aparecem como &quot;já pago&quot; no portal do influenciador, mas não entram no total acima.
              </p>
            )}

            {g.parcerias.map((p) => (
              <div key={p.id} className="flex flex-col gap-3">
                <p className="text-xs text-gray-500">
                  Parceria {p.encerrada ? 'encerrada' : 'ativa'} desde {dia(p.starts_at)}
                  {p.ends_at ? ` até ${dia(p.ends_at)}` : ''} - fechamento {p.payment_schedule === 'mensal' ? 'mensal' : 'ao fim da parceria'}
                </p>
                <FecharPeriodo partnershipId={p.id} previa={p.previa} calendario={p.payment_schedule} encerrada={p.encerrada} />
                {p.lancamentos.length > 0 && (
                  <ul className="flex flex-col gap-2">
                    {p.lancamentos.map((l) => <LinhaDoLancamento key={l.id} l={l} />)}
                  </ul>
                )}
              </div>
            ))}
          </section>
        )
      })}
    </div>
  )
}
