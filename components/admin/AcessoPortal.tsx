'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { montarConvite } from '@/lib/portal/convite'

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
  nome,
  emailAtual,
  userIdAtual,
  onFechar,
}: {
  influencerId: string
  handle: string
  /** O nome de verdade. A mensagem trata a pessoa pelo primeiro nome, não pelo @. */
  nome: string
  emailAtual: string | null
  userIdAtual: string | null
  onFechar: (mudou: boolean) => void
}) {
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [novaSenha, setNovaSenha] = useState('')
  // A senha so existe AQUI, no instante em que e definida. Depois disto nem o
  // sistema a conhece -- e o motivo de a mensagem pronta aparecer agora.
  const [convite, setConvite] = useState<string | null>(null)

  async function criar(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const res = await fetch('/api/admin/portal-access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ influencer_id: influencerId, email }),
    })
    const json = await res.json()
    setLoading(false)

    if (!res.ok) return toast.error(json.error || 'Erro ao criar o acesso.')
    toast.success('Acesso criado.')
    setConvite(montarConvite({
      nome, email: json.email, senha: json.senha,
      contratoPendente: true,
    }))
  }

  // Nao ha e-mail de recuperacao neste projeto: se ele esquecer a senha, o
  // admin e a unica saida.
  async function redefinir(e: React.FormEvent) {
    e.preventDefault()
    if (novaSenha.length < 12) return toast.error('A senha precisa ter ao menos 12 caracteres.')
    setLoading(true)
    const res = await fetch('/api/admin/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: userIdAtual, password: novaSenha }),
    })
    const json = await res.json()
    setLoading(false)
    if (!res.ok) return toast.error(json.error || 'Erro ao redefinir.')
    toast.success('Senha redefinida.')
    setConvite(montarConvite({
      nome, email: emailAtual ?? '', senha: novaSenha,
    }))
    setNovaSenha('')
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

        {convite && (
          <div className="mt-4 flex flex-col gap-3">
            <p className="text-[#00ff87] text-sm">Pronto. Agora é só mandar para ele.</p>
            <pre className="bg-[#0f0f0f] border border-[#1e1e1e] rounded-xl p-3 text-gray-300 text-xs whitespace-pre-wrap leading-relaxed max-h-56 overflow-y-auto">
              {convite}
            </pre>
            <Button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(convite)
                toast.success('Mensagem copiada.')
              }}
            >
              Copiar mensagem
            </Button>
            <p className="text-gray-600 text-xs leading-relaxed">
              Guarde ou mande agora: a senha aparece só aqui. Depois que esta
              janela fechar, nem o sistema sabe qual é -- só dá para definir uma
              nova.
            </p>
            <Button type="button" variant="ghost" onClick={() => onFechar(true)}>
              Fechar
            </Button>
          </div>
        )}

        {!convite && (<>

        {emailAtual ? (
          <>
            <div className="bg-[#0f0f0f] border border-[#1e1e1e] rounded-xl p-3 mt-4">
              <div className="text-gray-500 text-xs uppercase tracking-wide">Entra com</div>
              <div className="text-white text-sm mt-1 break-all">{emailAtual}</div>
            </div>
            <p className="text-gray-600 text-xs mt-3 leading-relaxed">
              Ele vê os próprios números e nada mais — nem dado de cliente, nem
              dado bancário.
            </p>

            <form onSubmit={redefinir} className="flex flex-col gap-3 mt-4 pt-4 border-t border-[#1e1e1e]">
              <Input
                label="Redefinir senha"
                type="text"
                placeholder="nova senha, ao menos 12 caracteres"
                value={novaSenha}
                onChange={(e) => setNovaSenha(e.target.value)}
                disabled={loading}
              />
              <Button type="submit" variant="outline" loading={loading} disabled={!novaSenha}>
                Redefinir
              </Button>
              <p className="text-gray-600 text-xs leading-relaxed">
                Use se ele esquecer a senha. Ele também pode trocar sozinho,
                dentro do portal.
              </p>
            </form>
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
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
            />
            <div className="bg-[#0f0f0f] border border-[#1e1e1e] rounded-xl p-3">
              <p className="text-gray-400 text-xs leading-relaxed">
                A senha é gerada pelo sistema e serve para o primeiro acesso.
                Assim que ele entrar, é obrigado a criar a dele — e a partir daí
                nem você sabe qual é.
              </p>
              <p className="text-gray-600 text-xs mt-2 leading-relaxed">
                É isso que torna o aceite do contrato defensável: ninguém além
                dele conhece a senha no momento em que assina.
              </p>
            </div>
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
        </>)}
      </div>
    </div>
  )
}
