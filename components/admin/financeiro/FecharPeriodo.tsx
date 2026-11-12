'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { brl, dia, lerResposta } from './tipos'

type Excluidos = { quantidade: number; valor: number; por_motivo: Record<string, number> }

/**
 * Fecha o periodo sugerido de UMA parceria. O botao mora na linha da parceria,
 * junto do periodo que ele fecha. Quando o fechamento deixa cupom de fora, a
 * tela diz quantos e por que: total menor sem explicacao e pior que recusa.
 */
export function FecharPeriodo({
  partnershipId,
  sugerido,
}: {
  partnershipId: string
  sugerido: { de: string; ate: string } | null
}) {
  const router = useRouter()
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [resultado, setResultado] = useState<{ valor: number; itens: number; excluidos: Excluidos } | null>(null)

  if (!sugerido) {
    return <p className="text-xs text-gray-600">Sem período a fechar agora.</p>
  }

  async function fechar() {
    if (!sugerido) return
    setEnviando(true)
    setErro(null)
    setResultado(null)
    try {
      const res = await fetch('/api/finance/settlements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partnership_id: partnershipId, periodo: sugerido }),
      })
      const r = await lerResposta(res)
      if (!r.ok) {
        setErro(r.erro)
        // Um 422 pode trazer o resumo do que ficou de fora: mostra junto da recusa.
        const ex = r.data.excluidos as Excluidos | undefined
        if (ex && ex.quantidade > 0) setResultado({ valor: 0, itens: 0, excluidos: ex })
        return
      }
      setResultado({
        valor: Number(r.data.valor),
        itens: Number(r.data.itens),
        excluidos: (r.data.excluidos as Excluidos) ?? { quantidade: 0, valor: 0, por_motivo: {} },
      })
      toast.success('Período fechado.')
      router.refresh()
    } catch {
      setErro('Erro de conexão.')
    } finally {
      setEnviando(false)
    }
  }

  const ex = resultado?.excluidos
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={fechar}
          disabled={enviando}
          className="text-sm px-4 py-2 rounded-lg bg-[#00ff87] text-black font-medium hover:bg-[#00e078] disabled:opacity-50 transition-colors"
        >
          {enviando ? 'Fechando...' : `Fechar ${dia(sugerido.de)} a ${dia(sugerido.ate)}`}
        </button>
        <span className="text-xs text-gray-500">
          Entram as vendas conferidas desse período que ainda não estão em nenhum lançamento.
        </span>
      </div>

      {erro && (
        <p role="alert" className="text-sm text-red-400 bg-red-950/40 border border-red-900 rounded-lg px-3 py-2">
          {erro}
        </p>
      )}

      {resultado && resultado.itens > 0 && (
        <p className="text-sm text-[#00ff87]">
          Lançamento aberto: {resultado.itens} cupom(ns), {brl(resultado.valor)}.
        </p>
      )}

      {ex && ex.quantidade > 0 && (
        <div role="status" className="text-sm text-yellow-300 bg-yellow-950/40 border border-yellow-900 rounded-lg px-3 py-2">
          <p className="font-medium">
            {ex.quantidade} cupom(ns) ficaram de fora, no valor de {brl(ex.valor)}:
          </p>
          <ul className="mt-1 list-disc list-inside text-yellow-200/80">
            {Object.entries(ex.por_motivo).map(([motivo, qtd]) => (
              <li key={motivo}>{qtd} - {motivo}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
