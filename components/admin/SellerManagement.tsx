'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export interface Seller {
  id: string
  name: string
  store_name: string
  active: boolean
  created_at: string
}

export function SellerManagement({
  sellers,
  storeNames,
}: {
  sellers: Seller[]
  storeNames: string[]
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState({ name: '', store_name: storeNames[0] ?? '' })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [excluindoId, setExcluindoId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ name: '', store_name: '' })

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const res = await fetch('/api/admin/sellers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createForm),
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) { toast.error(data.error || 'Erro ao criar vendedor.'); return }
    toast.success(`Vendedor "${createForm.name}" criado!`)
    setCreateForm({ name: '', store_name: storeNames[0] ?? '' })
    setShowCreate(false)
    router.refresh()
  }

  function openEdit(s: Seller) {
    setEditingId(s.id)
    setEditForm({ name: s.name, store_name: s.store_name })
  }

  async function handleEdit(id: string) {
    if (!editForm.name.trim()) { toast.error('Nome é obrigatório.'); return }
    setLoading(true)
    const res = await fetch('/api/admin/sellers', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...editForm }),
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) { toast.error(data.error || 'Erro ao atualizar vendedor.'); return }
    toast.success('Vendedor atualizado!')
    setEditingId(null)
    router.refresh()
  }

  async function handleDelete(s: Seller) {
    setLoading(true)
    const res = await fetch(`/api/admin/sellers?id=${encodeURIComponent(s.id)}`, { method: 'DELETE' })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) { toast.error(data.error || 'Erro ao excluir.'); return }
    toast.success(`Vendedor "${s.name}" excluído.`)
    setExcluindoId(null)
    router.refresh()
  }

  async function handleToggleActive(s: Seller) {
    setLoading(true)
    const res = await fetch('/api/admin/sellers', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: s.id, active: !s.active }),
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) { toast.error(data.error || 'Erro ao alterar o vendedor.'); return }
    toast.success(s.active ? 'Vendedor desativado.' : 'Vendedor ativado.')
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-gray-500 text-sm">
          {sellers.length} vendedor{sellers.length !== 1 ? 'es' : ''} cadastrado{sellers.length !== 1 ? 's' : ''}
        </p>
        <Button size="sm" onClick={() => setShowCreate((v) => !v)}>
          {showCreate ? 'Cancelar' : '+ Novo Vendedor'}
        </Button>
      </div>

      <p className="text-gray-500 text-xs leading-relaxed">
        O vendedor escolhe o próprio nome na tela Validar, sem senha. O campo serve para
        revelar padrão — não é prova de quem atendeu. Vendedor não se exclui: desative,
        e o histórico de quem validou o quê continua de pé.
      </p>

      {showCreate && (
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-5">
          <h3 className="text-white font-semibold mb-4">Novo vendedor</h3>
          <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Nome *" placeholder="Ex: João da Silva" value={createForm.name}
              onChange={(e) => setCreateForm((p) => ({ ...p, name: e.target.value }))}
              required disabled={loading} />
            <div>
              <label className="text-sm text-gray-300 block mb-1.5">Loja *</label>
              <select
                value={createForm.store_name}
                onChange={(e) => setCreateForm((p) => ({ ...p, store_name: e.target.value }))}
                className="w-full h-12 px-4 rounded-lg border border-[#2a2a2a] bg-[#1e1e1e] text-white text-sm focus:border-[#00ff87] focus:outline-none"
                disabled={loading}
                required
              >
                {storeNames.length === 0 && <option value="">Nenhuma loja cadastrada</option>}
                {storeNames.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="md:col-span-2 flex gap-3">
              <Button type="submit" loading={loading}>Criar vendedor</Button>
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)} disabled={loading}>Cancelar</Button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-[#141414] border border-[#1e1e1e] rounded-xl overflow-hidden divide-y divide-[#1a1a1a]">
        {sellers.length === 0 && (
          <div className="px-6 py-8 text-center text-gray-500 text-sm">Nenhum vendedor cadastrado.</div>
        )}
        {sellers.map((s) => (
          <div key={s.id} className="px-5 py-4">
            {editingId === s.id ? (
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Input label="Nome" value={editForm.name}
                    onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                    disabled={loading} />
                  <div>
                    <label className="text-sm text-gray-300 block mb-1.5">Loja</label>
                    <select
                      value={editForm.store_name}
                      onChange={(e) => setEditForm((p) => ({ ...p, store_name: e.target.value }))}
                      className="w-full h-12 px-4 rounded-lg border border-[#2a2a2a] bg-[#1e1e1e] text-white text-sm focus:border-[#00ff87] focus:outline-none"
                      disabled={loading}
                    >
                      {storeNames.map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" loading={loading} onClick={() => handleEdit(s.id)}>Salvar</Button>
                  <Button size="sm" variant="outline" onClick={() => setEditingId(null)} disabled={loading}>Cancelar</Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-sm font-medium ${s.active ? 'text-white' : 'text-gray-500 line-through'}`}>
                      {s.name}
                    </span>
                    {!s.active && (
                      <span className="text-xs bg-red-950 text-red-400 px-2 py-0.5 rounded-full">Inativo</span>
                    )}
                  </div>
                  <div className="text-gray-500 text-xs mt-0.5">{s.store_name}</div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => openEdit(s)}
                    className="text-xs border border-[#2a2a2a] text-gray-400 hover:text-white hover:border-[#00ff87] px-3 py-1.5 rounded-lg transition-colors">
                    Editar
                  </button>
                  <button onClick={() => handleToggleActive(s)}
                    className={`text-xs border px-3 py-1.5 rounded-lg transition-colors ${
                      s.active ? 'border-red-800 text-red-400 hover:bg-red-950' : 'border-[#00ff87]/30 text-[#00ff87] hover:bg-[#00ff87]/10'
                    }`}>
                    {s.active ? 'Desativar' : 'Ativar'}
                  </button>
                  {excluindoId === s.id ? (
                    <>
                      <button onClick={() => handleDelete(s)} disabled={loading}
                        className="text-xs bg-red-700 text-white font-semibold px-3 py-1.5 rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50">
                        Confirmar
                      </button>
                      <button onClick={() => setExcluindoId(null)} disabled={loading}
                        className="text-xs border border-[#2a2a2a] text-gray-400 hover:text-white px-3 py-1.5 rounded-lg transition-colors">
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <button onClick={() => setExcluindoId(s.id)}
                      className="text-xs border border-red-900 text-red-400 hover:bg-red-950 px-3 py-1.5 rounded-lg transition-colors">
                      Excluir
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
