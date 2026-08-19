'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

/**
 * Cria (ou remove) o acesso de um influenciador ao portal dele.
 *
 * Sem autocadastro e sem convite por e-mail -- o envio de e-mail foi descartado
 * no projeto. Quem cria é o César, e passa a senha inicial por onde já fala com
 * o influenciador.
 */
export function AcessoPortal({
  influencerId,
  handle,
  emailAtual,
  onFechar,
}: {
  influencerId: string
  handle: string
  emailAtual: string | null
  onFechar: (mudou: boolean) => void
}) {
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ email: '', password: '' })

  async function criar(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const res = await fetch('/api/admin/portal-access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ influencer_id: influencerId, ...form }),
    })
    const json = await res.json()
    setLoading(false)

    if (!res.ok) return toast.error(json.error || 'Erro ao criar o acesso.')
    toast.success('Acesso criado.')
    onFechar(true)
  }

  async function remover() {
    if (!confirm(`Remover o acesso de ${handle} ao portal?`)) return
    setLoading(true)
    const res = await fetch('/api/admin/portal-access', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ influencer_id: influencerId }),
    })
    const json = await res.json()
    setLoading(false)

    if (!res.ok) return toast.error(json.error || 'Erro ao remover.')
    toast.success('Acesso removido.')
    onFechar(true)
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center px-4 z-50">
      <div className="bg-[#141414] border border-[#1e1e1e] rounded-2xl p-6 w-full max-w-sm">
        <h2 className="text-white font-bold text-lg">Acesso ao portal</h2>
        <p className="text-gray-500 text-sm mt-1">{handle}</p>

        {emailAtual ? (
          <>
            <div className="bg-[#0f0f0f] border border-[#1e1e1e] rounded-xl p-3 mt-4">
              <div className="text-gray-500 text-xs uppercase tracking-wide">Entra com</div>
              <div className="text-white text-sm mt-1 break-all">{emailAtual}</div>
            </div>
            <p className="text-gray-600 text-xs mt-3 leading-relaxed">
              Ele vê os próprios números e nada mais — nem dado de cliente, nem
              dado bancário. O portal é só leitura.
            </p>
            <div className="flex gap-2 mt-5">
              <Button type="button" variant="ghost" onClick={() => onFechar(false)} className="flex-1">
                Fechar
              </Button>
              <button
                type="button"
                onClick={remover}
                disabled={loading}
                className="flex-1 text-sm border border-red-900/50 text-red-400 hover:bg-red-950/30 rounded-lg px-4 py-2 transition-colors disabled:opacity-50"
              >
                Remover acesso
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={criar} className="flex flex-col gap-4 mt-4">
            <Input
              label="E-mail do influenciador"
              type="email"
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              required
              disabled={loading}
            />
            <Input
              label="Senha inicial"
              type="text"
              placeholder="ao menos 8 caracteres"
              value={form.password}
              onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
              required
              minLength={8}
              disabled={loading}
            />
            <p className="text-gray-600 text-xs leading-relaxed">
              Passe a senha para ele por onde vocês já conversam. O sistema não
              envia e-mail.
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => onFechar(false)} className="flex-1">
                Cancelar
              </Button>
              <Button type="submit" loading={loading} className="flex-1">
                Criar acesso
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
