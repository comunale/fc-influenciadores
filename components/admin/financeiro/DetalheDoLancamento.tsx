'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { brl, dia, diaDoUso, INPUT, lerResposta, type Lancamento } from './tipos'

const FORMAS = ['PIX', 'TED', 'Transferência', 'Dinheiro']

/**
 * Cupons congelados de um lancamento e a acao sobre ele, na mesma tela:
 * aberto -> pagar (ou cancelar); pago -> so leitura.
 */
export function DetalheDoLancamento({ l }: { l: Lancamento }) {
  const router = useRouter()
  const hoje = new Date().toLocaleDateString('en-CA')
  const [pagando, setPagando] = useState(false)
  const [paidAt, setPaidAt] = useState(hoje)
  const [forma, setForma] = useState('PIX')
  const [identificador, setIdentificador] = useState('')
  const [confirmaCancelar, setConfirmaCancelar] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function enviar(url: string, corpo: unknown, sucesso: string) {
    setEnviando(true)
    setErro(null)
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
      })
      const r = await lerResposta(res)
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      toast.success(sucesso)
      router.refresh()
    } catch {
      setErro('Erro de conexão.')
    } finally {
      setEnviando(false)
    }
  }

  const aberto = l.status === 'aberto'
  const itens = l.settlement_items

  return (
    <div className="border-t border-[#1e1e1e] bg-[#0f0f0f] px-4 py-4 flex flex-col gap-4">
      {l.status === 'pago' && (
        <p className="text-xs text-gray-400">
          Pago em {dia(l.paid_at)} via {l.forma}
          {l.identificador ? ` (${l.identificador})` : ''}. Lançamento pago não se altera: a correção é um lançamento novo.
        </p>
      )}

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-gray-500 text-xs">
            <th className="py-1 font-medium">Cupom</th>
            <th className="py-1 font-medium">Cliente</th>
            <th className="py-1 font-medium">Usado em</th>
            <th className="py-1 font-medium text-right">Valor</th>
          </tr>
        </thead>
        <tbody>
          {itens.length === 0 && (
            <tr><td colSpan={4} className="py-2 text-gray-600">Sem cupons neste lançamento.</td></tr>
          )}
          {itens.map((i) => (
            <tr key={i.id} className="border-t border-[#1a1a1a] text-gray-300">
              <td className="py-1.5 font-mono text-xs">{i.coupons?.coupon_number ?? '-'}</td>
              <td className="py-1.5">{i.coupons?.customer_name ?? '-'}</td>
              <td className="py-1.5">{i.coupons?.used_at ? diaDoUso(i.coupons.used_at) : '-'}</td>
              <td className="py-1.5 text-right">{brl(i.valor)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {erro && (
        <p role="alert" className="text-sm text-red-400 bg-red-950/40 border border-red-900 rounded-lg px-3 py-2">
          {erro}
        </p>
      )}

      {aberto && !pagando && !confirmaCancelar && (
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setPagando(true)}
            className="text-sm px-4 py-2 rounded-lg bg-[#00ff87] text-black font-medium hover:bg-[#00e078] transition-colors"
          >
            Pagar {brl(l.valor)}
          </button>
          <button
            onClick={() => setConfirmaCancelar(true)}
            className="text-sm px-4 py-2 rounded-lg border border-[#2a2a2a] text-gray-400 hover:text-red-400 hover:border-red-800 transition-colors"
          >
            Cancelar lançamento
          </button>
        </div>
      )}

      {aberto && pagando && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            enviar(
              `/api/finance/settlements/${l.id}/pagar`,
              { paid_at: paidAt, forma, identificador },
              'Pagamento registrado.'
            )
          }}
          className="grid grid-cols-1 sm:grid-cols-3 gap-3"
        >
          <label className="text-xs text-gray-400 flex flex-col gap-1">
            Data do pagamento
            <input type="date" required value={paidAt} onChange={(e) => setPaidAt(e.target.value)} className={INPUT} />
          </label>
          <label className="text-xs text-gray-400 flex flex-col gap-1">
            Forma
            <input list="formas-de-pagamento" required maxLength={60} value={forma} onChange={(e) => setForma(e.target.value)} className={INPUT} />
            <datalist id="formas-de-pagamento">{FORMAS.map((f) => <option key={f} value={f} />)}</datalist>
          </label>
          <label className="text-xs text-gray-400 flex flex-col gap-1">
            Identificador (opcional)
            <input maxLength={200} value={identificador} onChange={(e) => setIdentificador(e.target.value)} placeholder="ID do PIX, comprovante..." className={INPUT} />
          </label>
          <div className="sm:col-span-3 flex gap-2 items-center flex-wrap">
            <button type="submit" disabled={enviando} className="text-sm px-4 py-2 rounded-lg bg-[#00ff87] text-black font-medium hover:bg-[#00e078] disabled:opacity-50 transition-colors">
              {enviando ? 'Pagando...' : `Confirmar pagamento de ${brl(l.valor)}`}
            </button>
            <button type="button" onClick={() => setPagando(false)} className="text-sm px-3 py-2 text-gray-400 hover:text-white">
              Voltar
            </button>
            <span className="text-xs text-gray-600">Depois de pago, o lançamento não pode mais ser alterado.</span>
          </div>
        </form>
      )}

      {aberto && confirmaCancelar && (
        <div className="border border-red-900 bg-red-950/30 rounded-lg p-3 flex flex-col gap-2">
          <p className="text-sm text-red-300">
            Cancelar apaga os {itens.length} cupom(ns) deste lançamento. Eles voltam a ficar disponíveis para o próximo fechamento. Isso não pode ser desfeito.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => enviar(`/api/finance/settlements/${l.id}/cancelar`, undefined, 'Lançamento cancelado.')}
              disabled={enviando}
              className="text-sm px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-500 disabled:opacity-50 transition-colors"
            >
              {enviando ? 'Cancelando...' : 'Sim, cancelar e apagar os cupons'}
            </button>
            <button onClick={() => setConfirmaCancelar(false)} className="text-sm px-3 py-2 text-gray-400 hover:text-white">
              Voltar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
