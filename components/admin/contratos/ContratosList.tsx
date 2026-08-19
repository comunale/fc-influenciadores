'use client'

import Link from 'next/link'

export type ContratoNaLista = {
  id: string
  status: string
  accepted_at: string | null
  fee_a_restituir: number | null
  created_at: string
  partnerships: {
    starts_at: string
    ends_at: string | null
    status: string
    fee_amount: number
    commission_per_sale: number
    influencers: { name: string; instagram_handle: string } | null
  } | null
}

const SITUACAO: Record<string, { texto: string; classe: string }> = {
  rascunho:     { texto: 'Rascunho',            classe: 'bg-[#2a2a2a] text-gray-400' },
  aguardando:   { texto: 'Aguardando aceite',   classe: 'bg-yellow-950 text-yellow-400' },
  aceito:       { texto: 'Aceito',              classe: 'bg-[#00ff87]/10 text-[#00ff87]' },
  descumprido:  { texto: 'Descumprido',         classe: 'bg-red-950 text-red-400' },
  cancelado:    { texto: 'Cancelado',           classe: 'bg-[#2a2a2a] text-gray-500' },
}

const dia = (iso: string) => new Date(iso).toLocaleDateString('pt-BR')
const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export function ContratosList({
  contratos,
  podeAgir,
}: {
  contratos: ContratoNaLista[]
  podeAgir: boolean
}) {
  if (contratos.length === 0) {
    return (
      <div className="bg-[#141414] border border-[#1e1e1e] rounded-2xl p-6">
        <p className="text-gray-400 text-sm">Nenhum contrato ainda.</p>
        <p className="text-gray-600 text-xs mt-2 leading-relaxed">
          Toda parceria criada de agora em diante gera um contrato, e o link só
          liga depois que o influenciador aceita. As parcerias que já estavam no
          ar em 19/08 seguem isentas — os links delas já estavam em bio e story.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {contratos.map((c) => {
        const p = c.partnerships
        const inf = p?.influencers
        const s = SITUACAO[c.status] ?? SITUACAO.rascunho

        return (
          <Link
            key={c.id}
            href={podeAgir ? `/admin/contratos/${c.id}` : '#'}
            className={`bg-[#141414] border border-[#1e1e1e] rounded-2xl p-5 flex items-start justify-between gap-4 flex-wrap transition-colors ${
              podeAgir ? 'hover:border-[#2a2a2a]' : 'cursor-default'
            }`}
          >
            <div className="min-w-0">
              <div className="text-white font-semibold">
                {inf?.name ?? 'Influenciador removido'}
                {inf && <span className="text-gray-500 font-normal ml-2">{inf.instagram_handle}</span>}
              </div>
              <div className="text-gray-500 text-sm mt-1">
                Parceria desde {p ? dia(p.starts_at + 'T12:00:00') : '—'}
                {p?.ends_at && <> até {dia(p.ends_at + 'T12:00:00')}</>}
                {p && <> · {brl(p.commission_per_sale)} por venda</>}
                {p && p.fee_amount > 0 && <> · fee {brl(p.fee_amount)}</>}
              </div>
              {c.accepted_at && (
                <div className="text-gray-600 text-xs mt-1">
                  Aceito em {new Date(c.accepted_at).toLocaleString('pt-BR')}
                </div>
              )}
              {c.fee_a_restituir != null && (
                <div className="text-red-400 text-xs mt-1">
                  Fee a restituir: {brl(Number(c.fee_a_restituir))}
                </div>
              )}
            </div>

            <span className={`text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap ${s.classe}`}>
              {s.texto}
            </span>
          </Link>
        )
      })}
    </div>
  )
}
