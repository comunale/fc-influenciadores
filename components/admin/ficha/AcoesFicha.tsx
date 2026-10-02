'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { mensagemDeErro } from '@/lib/db-errors'

/**
 * O que NÃO é edição de campo.
 *
 * Renovar encerra uma parceria e abre outra -- é evento, com regra de histórico
 * própria, e por isso não entra no botão Editar da ficha. Acesso ao portal é
 * conta de autenticação. Excluir é excluir.
 *
 * Cada uma diz o que vai acontecer ANTES de acontecer. Renovar, em especial,
 * desliga o link até o influenciador assinar o contrato novo -- quem renova numa
 * sexta sem saber disso passa o fim de semana sem link.
 */
export function AcoesFicha({
  influencerId, handle, temParceria, podeRenovar,
}: {
  influencerId: string
  handle: string
  temParceria: boolean
  podeRenovar: boolean
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [modal, setModal] = useState<'renovar' | 'prorrogar' | null>(null)
  const [ate, setAte] = useState('')

  async function parceriaAcao(acao: 'renovar' | 'prorrogar') {
    setLoading(true)
    const res = await fetch('/api/admin/influencer-renew', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ influencer_id: influencerId, acao, ends_at: ate || null }),
    })
    const json = await res.json()
    setLoading(false)
    if (!res.ok) return toast.error(json.error || 'Não foi possível.')
    toast.success(acao === 'renovar' ? 'Parceria renovada.' : 'Prazo prorrogado.')
    setModal(null)
    setAte('')
    router.refresh()
  }

  async function excluir() {
    if (!confirm(`Excluir ${handle}? Isso apaga o influenciador. Cupons já gerados impedem a exclusão.`)) return
    setLoading(true)
    // Mesmo caminho que a lista já usava: a RLS decide, e a FK de histórico
    // financeiro recusa apagar quem tem cupom.
    const { error } = await createClient().from('influencers').delete().eq('id', influencerId)
    setLoading(false)
    if (error) return toast.error(mensagemDeErro(error.message))
    toast.success('Influenciador excluído.')
    router.push('/admin/influencers')
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {podeRenovar && temParceria && (
          <>
            <Button variant="outline" size="sm" onClick={() => setModal('prorrogar')}>
              Prorrogar prazo
            </Button>
            <Button variant="outline" size="sm" onClick={() => setModal('renovar')}>
              Renovar parceria
            </Button>
          </>
        )}
        <button
          onClick={excluir}
          disabled={loading}
          className="text-sm border border-red-900/50 text-red-400 hover:bg-red-950/30 rounded-lg px-4 py-2 transition-colors disabled:opacity-50"
        >
          Excluir
        </button>
      </div>

      {(modal === 'renovar' || modal === 'prorrogar') && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center px-4 z-50">
          <div className="bg-[#141414] border border-[#1e1e1e] rounded-2xl p-6 w-full max-w-md flex flex-col gap-4">
            <div>
              <h2 className="text-white font-semibold text-lg">
                {modal === 'renovar' ? 'Renovar parceria' : 'Prorrogar prazo'}
              </h2>
              <p className="text-gray-500 text-sm mt-1">{handle}</p>
            </div>

            <p className="text-gray-400 text-sm leading-relaxed">
              {modal === 'renovar'
                ? 'Encerra a parceria atual e abre uma nova com os mesmos termos. O link não muda, e os cupons já gerados mantêm os valores antigos.'
                : 'Mantém a mesma parceria e só estende a data de fim. Nada mais muda.'}
            </p>

            {modal === 'renovar' && (
              <div className="bg-yellow-950/30 border border-yellow-900/50 rounded-xl p-3">
                <p className="text-yellow-500 text-xs leading-relaxed">
                  <span className="font-semibold">O link fica desligado até ele assinar.</span>{' '}
                  Parceria nova exige contrato aceito. Avise a pessoa para entrar no
                  portal — o link volta no instante em que ela aceitar.
                </p>
              </div>
            )}

            <Input
              label="Parceria até"
              type="date"
              value={ate}
              onChange={(e) => setAte(e.target.value)}
              disabled={loading}
            />
            <p className="text-gray-600 text-xs">Deixe vazio para parceria sem prazo definido.</p>

            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setModal(null)} disabled={loading} className="flex-1">
                Cancelar
              </Button>
              <Button onClick={() => parceriaAcao(modal)} loading={loading} className="flex-1">
                {modal === 'renovar' ? 'Renovar' : 'Prorrogar'}
              </Button>
            </div>
          </div>
        </div>
      )}

    </>
  )
}
