'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { formatDateTime } from '@/lib/utils'

interface UserProfile {
  id: string
  name: string
  role: string
  created_at: string
}

export function UserManagement({ users, currentUserId }: { users: UserProfile[]; currentUserId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'store' })

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    const res = await fetch('/api/admin/create-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json()
    setLoading(false)

    if (!res.ok) {
      toast.error(data.error || 'Erro ao criar usuário.')
      return
    }

    toast.success(`Usuário "${form.name}" criado como ${form.role === 'admin' ? 'Admin' : 'Loja'}.`)
    setForm({ name: '', email: '', password: '', role: 'store' })
    router.refresh()
  }

  const roleLabels: Record<string, string> = {
    admin: 'Admin',
    store: 'Loja',
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Lista de usuários */}
      <div className="bg-[#141414] border border-[#1e1e1e] rounded-xl p-6">
        <h2 className="text-white font-semibold mb-4">Usuários do sistema</h2>
        <div className="flex flex-col gap-2">
          {users.map((u) => (
            <div key={u.id} className="flex items-center justify-between py-2 border-b border-[#1a1a1a] last:border-0">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-white text-sm font-medium">{u.name}</span>
                  {u.id === currentUserId && (
                    <span className="text-xs text-gray-500">(você)</span>
                  )}
                </div>
                <div className="text-gray-500 text-xs">Criado em {formatDateTime(u.created_at)}</div>
              </div>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                u.role === 'admin'
                  ? 'bg-[#00ff87]/10 text-[#00ff87]'
                  : 'bg-[#1e1e1e] text-gray-400'
              }`}>
                {roleLabels[u.role] || u.role}
              </span>
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

        <form onSubmit={handleCreate} className="flex flex-col gap-4">
          <Input
            label="Nome"
            placeholder="Nome do usuário"
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            required
            disabled={loading}
          />
          <Input
            label="E-mail"
            type="email"
            placeholder="usuario@foxcycles.com.br"
            value={form.email}
            onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
            required
            disabled={loading}
          />
          <Input
            label="Senha inicial"
            type="password"
            placeholder="Mínimo 8 caracteres"
            value={form.password}
            onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
            required
            disabled={loading}
          />
          <div>
            <label className="text-sm font-medium text-gray-300 block mb-1.5">Perfil</label>
            <select
              value={form.role}
              onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}
              className="w-full h-12 px-4 rounded-lg border border-[#2a2a2a] bg-[#1e1e1e] text-white text-sm focus:border-[#00ff87] focus:outline-none"
              disabled={loading}
            >
              <option value="store">Loja — só valida cupons</option>
              <option value="admin">Admin — acesso total</option>
            </select>
          </div>

          <Button type="submit" loading={loading} className="w-full md:w-auto">
            Criar usuário
          </Button>
        </form>
      </div>
    </div>
  )
}
