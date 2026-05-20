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
  store_name: string | null
  active: boolean
  created_at: string
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  moderator: 'Moderador (Loja)',
}

export function UserManagement({
  users,
  currentUserId,
}: {
  users: UserProfile[]
  currentUserId: string
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState({ name: '', email: '', password: '', role: 'moderator', store_name: '' })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ name: '', role: 'moderator', store_name: '' })

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
    setCreateForm({ name: '', email: '', password: '', role: 'moderator', store_name: '' })
    setShowCreate(false)
    router.refresh()
  }

  function openEdit(u: UserProfile) {
    setEditingId(u.id)
    setEditForm({ name: u.name, role: u.role, store_name: u.store_name || '' })
  }

  async function handleEdit(id: string) {
    if (!editForm.name.trim()) { toast.error('Nome é obrigatório.'); return }
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase
      .from('admin_profiles')
      .update({
        name: editForm.name.trim(),
        role: editForm.role,
        store_name: editForm.role === 'moderator' ? editForm.store_name.trim() || null : null,
      })
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

  async function handleResetPassword(email: string | null) {
    if (!email) { toast.error('Email não cadastrado para este usuário.'); return }
    const supabase = createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/admin/login`,
    })
    if (error) { toast.error(error.message); return }
    toast.success(`Link de redefinição enviado para ${email}`)
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header + botão */}
      <div className="flex items-center justify-between">
        <p className="text-gray-500 text-sm">{users.length} usuário{users.length !== 1 ? 's' : ''} cadastrado{users.length !== 1 ? 's' : ''}</p>
        <Button size="sm" onClick={() => setShowCreate((v) => !v)}>
          {showCreate ? 'Cancelar' : '+ Novo Usuário'}
        </Button>
      </div>

      {/* Formulário de criação */}
      {showCreate && (
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-5">
          <h3 className="text-white font-semibold mb-4">Novo usuário</h3>
          <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Nome completo *" placeholder="Ex: João da Silva" value={createForm.name}
              onChange={(e) => setCreateForm((p) => ({ ...p, name: e.target.value }))}
              required disabled={loading} />
            <Input label="E-mail *" type="email" placeholder="joao@foxcycles.com.br" value={createForm.email}
              onChange={(e) => setCreateForm((p) => ({ ...p, email: e.target.value }))}
              required disabled={loading} />
            <Input label="Senha inicial *" type="password" placeholder="Mínimo 8 caracteres" value={createForm.password}
              onChange={(e) => setCreateForm((p) => ({ ...p, password: e.target.value }))}
              required disabled={loading} />
            <div>
              <label className="text-sm text-gray-300 block mb-1.5">Tipo *</label>
              <select
                value={createForm.role}
                onChange={(e) => setCreateForm((p) => ({ ...p, role: e.target.value }))}
                className="w-full h-12 px-4 rounded-lg border border-[#2a2a2a] bg-[#1e1e1e] text-white text-sm focus:border-[#00ff87] focus:outline-none"
                disabled={loading}
              >
                <option value="moderator">Moderador (Loja) — só valida cupons</option>
                <option value="admin">Administrador — acesso total</option>
              </select>
            </div>
            {createForm.role === 'moderator' && (
              <Input label="Nome da loja *" placeholder="Ex: FoxCycles Campinas" value={createForm.store_name}
                onChange={(e) => setCreateForm((p) => ({ ...p, store_name: e.target.value }))}
                required disabled={loading} className="md:col-span-2" />
            )}
            <div className="md:col-span-2 flex gap-3">
              <Button type="submit" loading={loading}>Criar usuário</Button>
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)} disabled={loading}>Cancelar</Button>
            </div>
          </form>
        </div>
      )}

      {/* Lista de usuários */}
      <div className="bg-[#141414] border border-[#1e1e1e] rounded-xl overflow-hidden divide-y divide-[#1a1a1a]">
        {users.length === 0 && (
          <div className="px-6 py-8 text-center text-gray-500 text-sm">Nenhum usuário cadastrado.</div>
        )}
        {users.map((u) => (
          <div key={u.id} className="px-5 py-4">
            {editingId === u.id ? (
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Input label="Nome" value={editForm.name}
                    onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                    disabled={loading} />
                  <div>
                    <label className="text-sm text-gray-300 block mb-1.5">Tipo</label>
                    <select
                      value={editForm.role}
                      onChange={(e) => setEditForm((p) => ({ ...p, role: e.target.value }))}
                      className="w-full h-12 px-4 rounded-lg border border-[#2a2a2a] bg-[#1e1e1e] text-white text-sm focus:border-[#00ff87] focus:outline-none"
                      disabled={loading || u.id === currentUserId}
                    >
                      <option value="moderator">Moderador (Loja)</option>
                      <option value="admin">Administrador</option>
                    </select>
                  </div>
                  {editForm.role === 'moderator' && (
                    <Input label="Nome da loja" value={editForm.store_name}
                      onChange={(e) => setEditForm((p) => ({ ...p, store_name: e.target.value }))}
                      disabled={loading} className="md:col-span-2" />
                  )}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" loading={loading} onClick={() => handleEdit(u.id)}>Salvar</Button>
                  <Button size="sm" variant="outline" onClick={() => setEditingId(null)} disabled={loading}>Cancelar</Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-sm font-medium ${u.active ? 'text-white' : 'text-gray-500 line-through'}`}>
                      {u.name}
                    </span>
                    {u.id === currentUserId && <span className="text-xs text-gray-500">(você)</span>}
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      u.role === 'admin' ? 'bg-[#00ff87]/10 text-[#00ff87]' : 'bg-[#1e1e1e] text-gray-400'
                    }`}>
                      {ROLE_LABELS[u.role] || u.role}
                    </span>
                    {!u.active && (
                      <span className="text-xs bg-red-950 text-red-400 px-2 py-0.5 rounded-full">Inativo</span>
                    )}
                  </div>
                  <div className="text-gray-500 text-xs mt-0.5">
                    {u.email || '—'}
                    {u.store_name && <span className="ml-2">· {u.store_name}</span>}
                    <span className="ml-2">· desde {formatDate(u.created_at)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                  <button onClick={() => openEdit(u)}
                    className="text-xs border border-[#2a2a2a] text-gray-400 hover:text-white hover:border-[#00ff87] px-3 py-1.5 rounded-lg transition-colors">
                    Editar
                  </button>
                  <button onClick={() => handleResetPassword(u.email)}
                    className="text-xs border border-[#2a2a2a] text-gray-400 hover:text-white px-3 py-1.5 rounded-lg transition-colors">
                    Resetar senha
                  </button>
                  {u.id !== currentUserId && (
                    <button onClick={() => handleToggleActive(u)}
                      className={`text-xs border px-3 py-1.5 rounded-lg transition-colors ${
                        u.active ? 'border-red-800 text-red-400 hover:bg-red-950' : 'border-[#00ff87]/30 text-[#00ff87] hover:bg-[#00ff87]/10'
                      }`}>
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
  )
}
