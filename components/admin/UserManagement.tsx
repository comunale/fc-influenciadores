'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/utils'
import { ROLES, ROLE_LABELS, type Role } from '@/lib/auth/roles'

// Dica curta ao lado do nome do papel, so na tela de criacao.
const ROLE_HINT: Record<Role, string> = {
  admin: ' — acesso total',
  finance: ' — confere NF, marca pago e exporta',
  moderator: ' — só valida cupons no balcão',
}

interface UserProfile {
  id: string
  name: string
  email: string | null
  role: string
  store_name: string | null
  active: boolean
  created_at: string
}


export function UserManagement({
  users,
  currentUserId,
  storeNames,
}: {
  users: UserProfile[]
  currentUserId: string
  storeNames: string[]
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState({ name: '', email: '', password: '', role: 'moderator', store_name: '' })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ name: '', email: '', role: 'moderator', store_name: '' })
  const [passwordId, setPasswordId] = useState<string | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)

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
    setPasswordId(null)
    setDeletingId(null)
    setEditForm({ name: u.name, email: u.email || '', role: u.role, store_name: u.store_name || '' })
  }

  async function handleEdit(id: string) {
    if (!editForm.name.trim()) { toast.error('Nome é obrigatório.'); return }
    if (!editForm.email.trim()) { toast.error('E-mail é obrigatório.'); return }
    setLoading(true)
    const res = await fetch('/api/admin/update-user', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: id, ...editForm }),
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) { toast.error(data.error || 'Erro ao atualizar usuário.'); return }
    toast.success('Usuário atualizado!')
    setEditingId(null)
    router.refresh()
  }

  async function handleDelete(u: UserProfile) {
    setLoading(true)
    const res = await fetch(`/api/admin/delete-user?userId=${encodeURIComponent(u.id)}`, {
      method: 'DELETE',
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) { toast.error(data.error || 'Erro ao excluir usuário.'); return }
    toast.success(`Usuário "${u.name}" excluído.`)
    setDeletingId(null)
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

  function openChangePassword(id: string) {
    setPasswordId(id)
    setNewPassword('')
    setEditingId(null)
    setDeletingId(null)
  }

  async function handleChangePassword(id: string) {
    if (newPassword.length < 8) { toast.error('Senha deve ter ao menos 8 caracteres.'); return }
    setLoading(true)
    const res = await fetch('/api/admin/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: id, password: newPassword }),
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) { toast.error(data.error || 'Erro ao alterar senha.'); return }
    toast.success('Senha alterada com sucesso!')
    setPasswordId(null)
    setNewPassword('')
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Lojas ja existentes. O campo aceita digitar uma nova, mas escolher da
          lista evita criar loja fantasma por erro de digitacao. */}
      <datalist id="lojas-existentes">
        {storeNames.map((s) => <option key={s} value={s} />)}
      </datalist>
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
                {ROLES.map((r) => (
                  <option key={r} value={r}>{ROLE_LABELS[r]}{ROLE_HINT[r]}</option>
                ))}
              </select>
            </div>
            {createForm.role === 'moderator' && (
              <Input label="Nome da loja *" list="lojas-existentes"
                placeholder="Escolha da lista ou digite uma loja nova" value={createForm.store_name}
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
                  <Input label="E-mail (login)" type="email" value={editForm.email}
                    onChange={(e) => setEditForm((p) => ({ ...p, email: e.target.value }))}
                    placeholder="usuario@foxcycles.com.br"
                    disabled={loading} />
                  <div>
                    <label className="text-sm text-gray-300 block mb-1.5">Tipo</label>
                    <select
                      value={editForm.role}
                      onChange={(e) => setEditForm((p) => ({ ...p, role: e.target.value }))}
                      className="w-full h-12 px-4 rounded-lg border border-[#2a2a2a] bg-[#1e1e1e] text-white text-sm focus:border-[#00ff87] focus:outline-none"
                      disabled={loading || u.id === currentUserId}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                      ))}
                    </select>
                  </div>
                  {editForm.role === 'moderator' && (
                    <Input label="Nome da loja" list="lojas-existentes" value={editForm.store_name}
                      onChange={(e) => setEditForm((p) => ({ ...p, store_name: e.target.value }))}
                      disabled={loading} className="md:col-span-2" />
                  )}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" loading={loading} onClick={() => handleEdit(u.id)}>Salvar</Button>
                  <Button size="sm" variant="outline" onClick={() => setEditingId(null)} disabled={loading}>Cancelar</Button>
                </div>
              </div>
            ) : passwordId === u.id ? (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-gray-300">Alterar senha de <span className="text-white font-medium">{u.name}</span></p>
                <div className="flex gap-2 items-end">
                  <Input
                    label="Nova senha (mín. 8 caracteres)"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    disabled={loading}
                    className="flex-1"
                  />
                  <Button size="sm" loading={loading} onClick={() => handleChangePassword(u.id)}>Salvar</Button>
                  <Button size="sm" variant="outline" onClick={() => setPasswordId(null)} disabled={loading}>Cancelar</Button>
                </div>
              </div>
            ) : deletingId === u.id ? (
              <div className="flex flex-col gap-3 bg-red-950/30 border border-red-900 rounded-lg p-4 -mx-1">
                <div>
                  <p className="text-red-400 font-semibold text-sm">
                    Excluir <span className="text-white">{u.name}</span> definitivamente?
                  </p>
                  <p className="text-gray-400 text-xs mt-1 leading-relaxed">
                    O login <span className="font-mono">{u.email || '—'}</span> será removido e a pessoa perde
                    o acesso imediatamente. Esta ação não pode ser desfeita.
                    <br />
                    Os cupons que ela validou continuam no histórico. Se você só quer bloquear o acesso
                    temporariamente, use <span className="text-gray-300">Desativar</span>.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="destructive" loading={loading} onClick={() => handleDelete(u)}>
                    Sim, excluir
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setDeletingId(null)} disabled={loading}>
                    Cancelar
                  </Button>
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
                      u.role === 'admin' ? 'bg-[#00ff87]/10 text-[#00ff87]' :
                      u.role === 'finance' ? 'bg-blue-500/10 text-blue-400' :
                      'bg-[#1e1e1e] text-gray-400'
                    }`}>
                      {ROLE_LABELS[u.role as Role] || u.role}
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
                  <button onClick={() => openChangePassword(u.id)}
                    className="text-xs border border-[#2a2a2a] text-gray-400 hover:text-white px-3 py-1.5 rounded-lg transition-colors">
                    Alterar senha
                  </button>
                  {u.id !== currentUserId && (
                    <>
                      <button onClick={() => handleToggleActive(u)}
                        className={`text-xs border px-3 py-1.5 rounded-lg transition-colors ${
                          u.active ? 'border-red-800 text-red-400 hover:bg-red-950' : 'border-[#00ff87]/30 text-[#00ff87] hover:bg-[#00ff87]/10'
                        }`}>
                        {u.active ? 'Desativar' : 'Ativar'}
                      </button>
                      <button onClick={() => { setDeletingId(u.id); setEditingId(null); setPasswordId(null) }}
                        className="text-xs border border-red-900 bg-red-950/40 text-red-400 hover:bg-red-900/50 hover:text-red-300 px-3 py-1.5 rounded-lg transition-colors">
                        Excluir
                      </button>
                    </>
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
