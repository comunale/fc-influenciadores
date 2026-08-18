'use client'

import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

/**
 * Dados bancários do influenciador. Só admin e Financeiro chegam aqui — o botão
 * que abre este painel já é escondido para os demais, e a tabela tem RLS
 * própria, então o Lojista não lê nem chamando a API direto.
 *
 * Carrega sob demanda: os dados não vêm na listagem de influencers, para não
 * trafegarem em tela que não precisa deles.
 */
type DadosPagamento = {
  payment_method: string | null
  pix_key: string | null
  bank_name: string | null
  bank_agency: string | null
  bank_account: string | null
  payment_document: string | null
  payment_notes: string | null
  updated_at?: string | null
  updated_by?: string | null
}

const VAZIO: DadosPagamento = {
  payment_method: 'pix',
  pix_key: '',
  bank_name: '',
  bank_agency: '',
  bank_account: '',
  payment_document: '',
  payment_notes: '',
}

export function DadosBancarios({
  influencerId,
  handle,
  onFechar,
}: {
  influencerId: string
  handle: string
  onFechar: () => void
}) {
  const [form, setForm] = useState<DadosPagamento>(VAZIO)
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [atualizado, setAtualizado] = useState<{ em: string | null; por: string | null }>({ em: null, por: null })

  useEffect(() => {
    let cancelado = false
    fetch(`/api/admin/influencer-payment?influencer_id=${encodeURIComponent(influencerId)}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelado) return
        if (d.dados) {
          setForm({ ...VAZIO, ...d.dados })
          setAtualizado({ em: d.dados.updated_at ?? null, por: d.dados.updated_by ?? null })
        }
      })
      .catch(() => toast.error('Erro ao carregar dados bancários.'))
      .finally(() => !cancelado && setCarregando(false))
    return () => { cancelado = true }
  }, [influencerId])

  async function salvar() {
    setSalvando(true)
    const res = await fetch('/api/admin/influencer-payment', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ influencer_id: influencerId, ...form }),
    })
    const data = await res.json()
    setSalvando(false)
    if (!res.ok) { toast.error(data.error || 'Erro ao salvar.'); return }
    toast.success('Dados bancários salvos.')
    onFechar()
  }

  const pix = form.payment_method === 'pix'

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-4 bg-black/70">
      <div className="bg-[#141414] border border-[#1e1e1e] rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1e1e1e]">
          <div>
            <h2 className="text-white font-semibold text-lg">Dados bancários</h2>
            <p className="text-gray-500 text-xs mt-0.5">{handle}</p>
          </div>
          <button onClick={onFechar} className="text-gray-500 hover:text-white text-xl">✕</button>
        </div>

        {carregando ? (
          <div className="p-10 text-center text-gray-500 text-sm">Carregando...</div>
        ) : (
          <div className="p-6 flex flex-col gap-4">
            <div>
              <label className="text-sm text-gray-300 block mb-1.5">Forma de pagamento</label>
              <select
                value={form.payment_method ?? 'pix'}
                onChange={(e) => setForm((p) => ({ ...p, payment_method: e.target.value }))}
                className="w-full h-12 px-4 rounded-lg border border-[#2a2a2a] bg-[#1e1e1e] text-white text-sm focus:border-[#00ff87] focus:outline-none"
                disabled={salvando}
              >
                <option value="pix">PIX</option>
                <option value="conta">Conta bancária</option>
              </select>
            </div>

            {pix ? (
              <Input label="Chave PIX" value={form.pix_key ?? ''} disabled={salvando}
                placeholder="CPF, e-mail, telefone ou chave aleatória"
                onChange={(e) => setForm((p) => ({ ...p, pix_key: e.target.value }))} />
            ) : (
              <>
                <Input label="Banco" value={form.bank_name ?? ''} disabled={salvando}
                  onChange={(e) => setForm((p) => ({ ...p, bank_name: e.target.value }))} />
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Agência" value={form.bank_agency ?? ''} disabled={salvando}
                    onChange={(e) => setForm((p) => ({ ...p, bank_agency: e.target.value }))} />
                  <Input label="Conta" value={form.bank_account ?? ''} disabled={salvando}
                    onChange={(e) => setForm((p) => ({ ...p, bank_account: e.target.value }))} />
                </div>
              </>
            )}

            <Input label="CPF ou CNPJ do recebedor" value={form.payment_document ?? ''} disabled={salvando}
              onChange={(e) => setForm((p) => ({ ...p, payment_document: e.target.value }))} />

            <Input label="Observações" value={form.payment_notes ?? ''} disabled={salvando}
              placeholder="Ex: pagar sempre até o dia 10"
              onChange={(e) => setForm((p) => ({ ...p, payment_notes: e.target.value }))} />

            {atualizado.em && (
              <p className="text-xs text-gray-600">
                Última alteração em {new Date(atualizado.em).toLocaleDateString('pt-BR')}
                {atualizado.por ? ` por ${atualizado.por}` : ''}
              </p>
            )}

            <div className="flex gap-3 pt-1">
              <Button onClick={salvar} loading={salvando} className="flex-1">Salvar</Button>
              <Button variant="outline" onClick={onFechar} disabled={salvando}>Cancelar</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
