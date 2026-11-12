'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import type { PreviaDaTela } from '@/lib/settlements/previa'
import { brl, dia, diaDoUso, lerResposta } from './tipos'

type Excluidos = { quantidade: number; valor: number; por_motivo: Record<string, number> }

function Excluidas({ ex }: { ex: Excluidos }) {
  if (ex.quantidade === 0) return null
  return (
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
  )
}

/**
 * Previa e fechamento de UMA parceria. O valor, a quantidade e o que ficou de
 * fora chegam calculados pelo servidor (mesma funcao da rota); aqui so se mostra
 * e se confirma. Cupom usado depois do fim da parceria e escolhido um a um e
 * comeca desmarcado.
 */
export function FecharPeriodo({
  partnershipId,
  previa,
  calendario,
  encerrada,
}: {
  partnershipId: string
  previa: PreviaDaTela
  calendario: string
  encerrada: boolean
}) {
  const router = useRouter()
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [escolhidos, setEscolhidos] = useState<Set<string>>(new Set())
  const [confirmando, setConfirmando] = useState(false)
  const [resultado, setResultado] = useState<{ valor: number; itens: number; ignorados: number } | null>(null)

  const { periodo, regulares, posFim, excluidos } = previa
  const marcados = posFim.filter((c) => escolhidos.has(c.coupon_id))
  // Soma dos valores que o servidor ja arredondou; o total gravado volta da rota.
  const somaMarcados = Math.round(marcados.reduce((t, c) => t + c.valor * 100, 0)) / 100
  const totalDaVez = Math.round((previa.total + somaMarcados) * 100) / 100
  const qtdDaVez = regulares.length + marcados.length
  const podeFechar = periodo !== null && qtdDaVez > 0

  function alternar(id: string) {
    setConfirmando(false)
    setEscolhidos((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  async function fechar() {
    if (!periodo) return
    setEnviando(true)
    setErro(null)
    setResultado(null)
    try {
      const res = await fetch('/api/finance/settlements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partnership_id: partnershipId,
          periodo,
          // Exatamente o que esta na tela e foi marcado; o servidor refaz a conta
          // e so aceita o que ele mesmo considera elegivel.
          cupom_ids: [...regulares.map((c) => c.coupon_id), ...marcados.map((c) => c.coupon_id)],
        }),
      })
      const r = await lerResposta(res)
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      setResultado({ valor: Number(r.data.valor), itens: Number(r.data.itens), ignorados: Number(r.data.ignorados ?? 0) })
      setConfirmando(false)
      setEscolhidos(new Set())
      toast.success('Período fechado.')
      router.refresh()
    } catch {
      setErro('Erro de conexão.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {periodo ? (
        <p className="text-sm text-gray-300">
          Período a fechar: <span className="text-white">{dia(periodo.de)} a {dia(periodo.ate)}</span>
          {' - '}
          {regulares.length} cupom(ns) -{' '}
          <span className="text-white font-medium">{brl(previa.total)}</span>
          {marcados.length > 0 && (
            <span className="text-yellow-300">
              {' '}+ {marcados.length} usado(s) depois do fim, marcado(s): {brl(somaMarcados)} = {brl(totalDaVez)}
            </span>
          )}
        </p>
      ) : (
        <p className="text-xs text-gray-600">
          Sem período a fechar agora:{' '}
          {encerrada
            ? 'esta parceria está encerrada, mas a data de término nunca foi registrada, então não há período para fechar. Peça a um administrador para registrar a data de término dela.'
            : calendario === 'fim'
              ? 'esta parceria só fecha quando termina, e ela ainda está ativa.'
              : 'o primeiro mês fechado ainda não terminou.'}
        </p>
      )}

      {periodo && regulares.length === 0 && posFim.length === 0 && (
        <p className="text-xs text-gray-500">
          Nada a fechar neste período: nenhuma venda conferida e ainda sem lançamento.
          {excluidos.quantidade > 0 ? ' Veja abaixo o que ficou de fora.' : ''}
        </p>
      )}

      {posFim.length > 0 && (
        <fieldset className="border border-[#2a2a2a] rounded-lg p-3 flex flex-col gap-2">
          <legend className="px-1 text-xs text-yellow-400">
            Usados depois do fim da parceria{previa.fimDaParceria ? ` (${dia(previa.fimDaParceria)})` : ''} - você escolhe cada um
          </legend>
          <p className="text-xs text-gray-500">
            A comissão foi ganha, então estes cupons podem ser pagos, mas nenhum entra sem ser marcado.
          </p>
          {posFim.map((c) => (
            <label key={c.coupon_id} className="flex items-center gap-3 text-sm text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={escolhidos.has(c.coupon_id)}
                onChange={() => alternar(c.coupon_id)}
                disabled={enviando}
                className="accent-[#00ff87] w-4 h-4"
              />
              <span className="font-mono text-xs">{c.numero}</span>
              <span className="flex-1">{c.cliente ?? '-'}</span>
              <span className="text-xs text-gray-500">{c.usado_em ? diaDoUso(c.usado_em) : '-'}</span>
              <span>{brl(c.valor)}</span>
            </label>
          ))}
        </fieldset>
      )}

      {podeFechar && !confirmando && (
        <div>
          <button
            onClick={() => setConfirmando(true)}
            disabled={enviando}
            className="text-sm px-4 py-2 rounded-lg bg-[#00ff87] text-black font-medium hover:bg-[#00e078] disabled:opacity-50 transition-colors"
          >
            Fechar período
          </button>
        </div>
      )}

      {podeFechar && confirmando && periodo && (
        <div className="border border-[#00ff87]/40 bg-[#00ff87]/5 rounded-lg p-3 flex flex-col gap-2">
          <p className="text-sm text-gray-200">
            Vai criar um lançamento de <span className="text-white font-medium">{brl(totalDaVez)}</span> com {qtdDaVez} cupom(ns),
            período {dia(periodo.de)} a {dia(periodo.ate)}
            {marcados.length > 0 ? `, incluindo ${marcados.length} usado(s) depois do fim da parceria` : ''}.
            Nada é pago ainda: o pagamento é um passo à parte.
          </p>
          <div className="flex gap-2">
            <button
              onClick={fechar}
              disabled={enviando}
              className="text-sm px-4 py-2 rounded-lg bg-[#00ff87] text-black font-medium hover:bg-[#00e078] disabled:opacity-50 transition-colors"
            >
              {enviando ? 'Fechando...' : 'Confirmar fechamento'}
            </button>
            <button onClick={() => setConfirmando(false)} disabled={enviando} className="text-sm px-3 py-2 text-gray-400 hover:text-white">
              Voltar
            </button>
          </div>
        </div>
      )}

      {erro && (
        <p role="alert" className="text-sm text-red-400 bg-red-950/40 border border-red-900 rounded-lg px-3 py-2">
          {erro}
        </p>
      )}

      {resultado && (
        <p className="text-sm text-[#00ff87]">
          Lançamento aberto: {resultado.itens} cupom(ns), {brl(resultado.valor)}.
          {resultado.ignorados > 0 ? ` ${resultado.ignorados} item(ns) da seleção não eram elegíveis e foram ignorados.` : ''}
        </p>
      )}

      <Excluidas ex={excluidos} />
    </div>
  )
}
