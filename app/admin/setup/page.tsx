'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase/client'
import { FoxLogo } from '@/components/FoxLogo'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export default function SetupPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    setupKey: '',
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (form.password !== form.confirmPassword) {
      toast.error('As senhas não coincidem.')
      return
    }
    if (form.password.length < 8) {
      toast.error('A senha deve ter pelo menos 8 caracteres.')
      return
    }

    setLoading(true)
    const supabase = createClient()

    // Verificar se já existe algum admin
    const { count } = await supabase
      .from('admin_profiles')
      .select('*', { count: 'exact', head: true })

    if ((count ?? 0) > 0) {
      toast.error('Setup já foi realizado. Acesse /admin/login.')
      setLoading(false)
      return
    }

    // Criar usuário no Supabase Auth
    const { data, error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
    })

    if (error || !data.user) {
      toast.error(error?.message || 'Erro ao criar usuário.')
      setLoading(false)
      return
    }

    // Criar perfil admin
    const { error: profileError } = await supabase.from('admin_profiles').insert({
      id: data.user.id,
      name: form.name,
      role: 'admin',
    })

    if (profileError) {
      toast.error('Usuário criado mas erro no perfil: ' + profileError.message)
      setLoading(false)
      return
    }

    setDone(true)
    toast.success('Admin criado com sucesso!')
    setTimeout(() => router.push('/admin/login'), 2000)
  }

  if (done) {
    return (
      <main className="min-h-screen bg-[#0a0a0a] flex items-center justify-center px-4">
        <div className="text-center">
          <div className="text-[#00ff87] text-5xl mb-4">✓</div>
          <h1 className="text-white text-2xl font-bold">Admin criado!</h1>
          <p className="text-gray-400 mt-2">Redirecionando para o login...</p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#0a0a0a] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <FoxLogo size="lg" />
          <h1 className="text-white font-bold text-xl mt-4">Configuração Inicial</h1>
          <p className="text-gray-500 text-sm mt-1 text-center">
            Crie o primeiro usuário administrador do sistema.
            <br />Esta página ficará indisponível após o primeiro cadastro.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-[#141414] border border-[#1e1e1e] rounded-2xl p-6 flex flex-col gap-4"
        >
          <Input
            label="Seu nome"
            placeholder="Nome do administrador"
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            required
            disabled={loading}
          />
          <Input
            label="E-mail"
            type="email"
            placeholder="admin@foxcycles.com.br"
            value={form.email}
            onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
            required
            disabled={loading}
          />
          <Input
            label="Senha"
            type="password"
            placeholder="Mínimo 8 caracteres"
            value={form.password}
            onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
            required
            disabled={loading}
          />
          <Input
            label="Confirmar senha"
            type="password"
            placeholder="Repita a senha"
            value={form.confirmPassword}
            onChange={(e) => setForm((p) => ({ ...p, confirmPassword: e.target.value }))}
            required
            disabled={loading}
          />
          <Button type="submit" size="lg" loading={loading} className="mt-2 w-full">
            {loading ? 'Criando admin...' : 'Criar Administrador'}
          </Button>
        </form>
      </div>
    </main>
  )
}
