'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { montarConvite, enderecoDoPortal } from '@/lib/portal/convite'

/**
 * O acesso do influenciador ao portal, dentro do bloco onde o César procura.
 *
 * A primeira versão deixou isto em "Ações", no fim da página -- e, pior, o bloco
 * de Ações sumia enquanto ele editava a ficha. Ele clicou em Editar, foi
 * procurar como redefinir a senha e não achou. A regra que sai daí: a ação mora
 * onde está a informação sobre a qual ela age.
 *
 * A senha NUNCA fica guardada legível -- o Auth só tem o hash. Ela existe por um
 * instante, ao criar ou redefinir, e é esse o único momento em que dá para
 * copiá-la. Por isso a mensagem pronta aparece na hora, e não depois.
 */
export function AcessoDoPortal({
  influencerId, nome, handle, acesso, contratoPendente, site, podeEditar,
}: {
  influencerId: string
  nome: string
  handle: string
  acesso: { id: string; email: string | null } | null
  contratoPendente: boolean
  site: string
  podeEditar: boolean
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [criando, setCriando] = useState(false)
  const [email, setEmail] = useState('')
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
    setConvite(montarConvite({ nome, email: json.email, senha: json.senha, site, contratoPendente: true }))
    setCriando(false)
    router.refresh()
  }

  async function redefinir() {
    if (!confirm(
      `Gerar uma senha nova para ${handle}?\n\n` +
      'A senha atual deixa de funcionar na hora, e ele terá que criar a dele ' +
      'de novo ao entrar.'
    )) return

    setLoading(true)
    const res = await fetch('/api/admin/portal-access', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ influencer_id: influencerId }),
    })
    const json = await res.json()
    setLoading(false)
    if (!res.ok) return toast.error(json.error || 'Não foi possível redefinir.')
    setConvite(montarConvite({ nome, email: json.email, senha: json.senha, site, contratoPendente }))
    router.refresh()
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
    router.refresh()
  }

  // A mensagem pronta: o único momento em que a senha existe.
  if (convite) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-[#00ff87] text-sm font-medium">
          Pronto. Copie agora — a senha aparece só aqui.
        </p>
        <pre className="bg-[#0f0f0f] border border-[#1e1e1e] rounded-xl p-3 text-gray-300 text-xs whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">
          {convite}
        </pre>
        <div className="flex gap-2 flex-wrap">
          <Button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(convite)
              toast.success('Mensagem copiada. É só colar no WhatsApp.')
            }}
          >
            Copiar mensagem
          </Button>
          <Button type="button" variant="ghost" onClick={() => setConvite(null)}>
            Já copiei
          </Button>
        </div>
        <p className="text-gray-600 text-xs leading-relaxed">
          Depois de fechar, nem o sistema sabe qual é a senha — só dá para gerar
          outra.
        </p>
      </div>
    )
  }

  // Ainda não tem acesso.
  if (!acesso?.email) {
    return criando ? (
      <form onSubmit={criar} className="flex flex-col gap-3">
        <Input
          label="E-mail dele"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={loading}
        />
        <p className="text-gray-600 text-xs leading-relaxed">
          A senha é gerada pelo sistema e aparece aqui para você copiar. Serve
          para o primeiro acesso: depois ele cria a dele, e nem você sabe qual é.
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={() => setCriando(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button type="submit" loading={loading}>Criar acesso</Button>
        </div>
      </form>
    ) : (
      <div className="flex flex-col gap-3">
        <p className="text-gray-500 text-sm">Sem acesso criado.</p>
        {podeEditar && (
          <Button type="button" size="sm" onClick={() => setCriando(true)} className="self-start">
            Criar acesso
          </Button>
        )}
      </div>
    )
  }

  // Já tem acesso.
  return (
    <div className="flex flex-col gap-3">
      <code className="text-white text-sm break-all">{enderecoDoPortal(site)}</code>
      <div className="text-gray-400 text-sm break-all">{acesso.email}</div>

      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => {
            navigator.clipboard.writeText(
              montarConvite({ nome, email: acesso.email ?? '', site, contratoPendente })
            )
            toast.success('Mensagem copiada — sem a senha.')
          }}
          className="text-xs border border-[#2a2a2a] text-gray-400 hover:text-white hover:border-[#00ff87] px-3 py-1.5 rounded-lg transition-colors"
        >
          Copiar mensagem
        </button>

        {podeEditar && (
          <>
            <button
              onClick={redefinir}
              disabled={loading}
              className="text-xs border border-[#00ff87]/40 text-[#00ff87] hover:bg-[#00ff87]/10 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            >
              Gerar senha nova
            </button>
            <button
              onClick={remover}
              disabled={loading}
              className="text-xs border border-red-900/50 text-red-400 hover:bg-red-950/30 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            >
              Remover acesso
            </button>
          </>
        )}
      </div>

      <p className="text-gray-600 text-xs leading-relaxed">
        A senha não vai nessa mensagem: ela só existe no instante em que é
        gerada. Se ele perdeu, clique em <span className="text-gray-400">Gerar
        senha nova</span> — sai uma mensagem pronta, com a senha.
      </p>
    </div>
  )
}
