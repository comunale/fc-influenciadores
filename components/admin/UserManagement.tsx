'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/utils'

interface UserProfile {
  id: string
  name: string
  email: string | null
  role: string
  active: boolean
  created_at: string
}

const roleLabels: Record<string, string> = { admin: 'Admin', store: 'Loja' }

export function UserManagement({
  users,
  currentUserId,
}: {
  users: UserProfile[]
  currentUserId: string
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [createForm, setCreateForm] = useState({ name: '', email: '', password: '', role: 'store' })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ name: '', role: 'store' })

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const res = await fetch('/api/admin/create-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createForm),
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) { toast.error(data.error || 'Erro ao criar usuário.'); return }
    toast.success(`Usuário "${createForm.name}" criado!`)
    setCreateForm({ name: '', email: '', password: '', role: 'store' })
    router.refresh()
  }

  function openEdit(u: UserProfile) {
    setEditingId(u.id)
    setEditForm({ name: u.name, role: u.role })
  }

  async function handleEdit(id: string) {
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase
      .from('admin_profiles')
      .update({ name: editForm.name.trim(), role: editForm.role })
      .eq('id', id)
    setLoading(false)
    if (error) { toast.error(error.message); return }
    toast.success('Usuário atualizado!')
    setEditingId(null)
    router.refresh()
  }

  async function handleToggleActive(u: UserProfile) {
    if (u.id === currentUserId) { toast.error('Você não pode desativar sua própria conta.'); return }
    const supabase = createClient()
    const { error } = await supabase
      .from('admin_profiles')
      .update({ active: !u.active })
      .eq('id', u.id)
    if (error) { toast.error(error.message); return }
    toast.success(u.active ? 'Usuário desativado.' : 'Usuário ativado.')
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Lista de usuários */}
      <div className="bg-[#141414] border border-[#1e1e1e] rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-[#1e1e1e]">
          <h2 className="text-white font-semibold">Usuários do sistema</h2>
          <p className="text-gray-500 text-xs mt-0.5">{users.length} usuário{users.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="divide-y divide-[#1a1a1a]">
          {users.map((u) => (
            <div key={u.id} className="px-6 py-4">
              {editingId === u.id ? (
                /* Inline edit form */
                <div className="flex flex-col gap-3">
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      label="Nome"
                      value={editForm.name}
                      onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                      disabled={loading}
                    />
                    <div>
                      <label className="text-sm text-gray-300 block mb-1.5">Perfil</label>
                      <select
                        value={editForm.role}
                        onChange={(e) => setEditForm((p) => ({ ...p, role: e.target.value }))}
                        className="w-full h-12 px-4 rounded-lg border border-[#2a2a2a] bg-[#1e1e1e] text-white text-sm focus:border-[#00ff87] focus:outline-none"
                        disabled={loading || u.id === currentUserId}
                      >
                        <option value="store">Loja</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" loading={loading} onClick={() => handleEdit(u.id)}>Salvar</Button>
                    <Button size="sm" variant="outline" onClick={() => setEditingId(null)} disabled={loading}>Cancelar</Button>
                  </div>
                </div>
              ) : (
                /* Normal display */
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-sm font-medium ${u.active ? 'text-white' : 'text-gray-500 line-through'}`}>
                        {u.name}
                      </span>
                      {u.id === currentUserId && (
                        <span className="text-xs text-gray-500">(você)</span>
                      )}
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        u.role === 'admin'
                          ? 'bg-[#00ff87]/10 text-[#00ff87]'
                          : 'bg-[#1e1e1e] text-gray-400'
                      }`}>
                        {roleLabels[u.role] || u.role}
                      </span>
                      {!u.active && (
                        <span className="text-xs bg-red-950 text-red-400 px-2 py-0.5 rounded-full">Inativo</span>
                      )}
                    </div>
                    <div className="text-gray-500 text-xs mt-0.5">
                      {u.email && <span>{u.email} · </span>}
                      Desde {formatDate(u.created_at)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => openEdit(u)}
                      className="text-xs border border-[#2a2a2a] text-gray-400 hover:text-white hover:border-[#00ff87] px-3 py-1.5 rounded-lg transition-colors"
                    >
                      Editar
                    </button>
                    {u.id !== currentUserId && (
                      <button
                        onClick={() => handleToggleActive(u)}
                        className={`text-xs border px-3 py-1.5 rounded-lg transition-colors ${
                          u.active
                            ? 'border-red-800 text-red-400 hover:bg-red-950'
                            : 'border-[#00ff87]/30 text-[#00ff87] hover:bg-[#00ff87]/10'
                        }`}
                      >
                        {u.active ? 'Desativar' : 'Ativar'}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Criar novo usuário */}
      <div className="bg-[#141414] border border-[#1e1e1e] rounded-xl p-6">
        <h2 className="text-white font-semibold mb-1">Adicionar usuário</h2>
        <p className="text-gray-500 text-xs mb-4">
          <strong className="text-gray-400">Admin</strong> — acesso total ao painel.{' '}
          <strong className="text-gray-400">Loja</strong> — apenas valida cupons em /admin/validar.
        </p>
        <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input label="Nome" placeholder="Nome completo" value={createForm.name}
            onChange={(e) => setCreateForm((p) => ({ ...p, name: e.target.value }))}
            required disabled={loading} />
          <Input label="E-mail" type="email" placeholder="usuario@foxcycles.com.br" value={createForm.email}
            onChange={(e) => setCreateForm((p) => ({ ...p, email: e.target.value }))}
            required disabled={loading} />
          <Input label="Senha inicial" type="password" placeholder="Mínimo 8 caracteres" value={createForm.password}
            onChange={(e) => setCreateForm((p) => ({ ...p, password: e.target.value }))}
            required disabled={loading} />
          <div>
            <label className="text-sm text-gray-300 block mb-1.5">Perfil</label>
            <select
              value={createForm.role}
              onChange={(e) => setCreateForm((p) => ({ ...p, role: e.target.value }))}
              className="w-full h-12 px-4 rounded-lg border border-[#2a2a2a] bg-[#1e1e1e] text-white text-sm focus:border-[#00ff87] focus:outline-none"
              disabled={loading}
            >
              <option value="store">Loja — só valida cupons</option>
              <option value="admin">Admin — acesso total</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <Button type="submit" loading={loading}>Criar usuário</Button>
          </div>
        </form>
      </div>
    </div>
  )
}
