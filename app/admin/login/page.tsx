'use client'

import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase/client'
import { FoxLogo } from '@/components/FoxLogo'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

function LoginForm() {
  const searchParams = useSearchParams()
  const next = searchParams.get('next') || '/admin'
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ email: '', password: '' })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({
      email: form.email,
      password: form.password,
    })

    if (error) {
      toast.error('E-mail ou senha inválidos.')
      setLoading(false)
      return
    }

    toast.success('Login realizado!')
    window.location.href = next
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-[#141414] border border-[#1e1e1e] rounded-2xl p-6 flex flex-col gap-4"
    >
      <Input
        label="E-mail"
        type="email"
        placeholder="admin@foxcycles.com.br"
        value={form.email}
        onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
        autoComplete="email"
        required
        disabled={loading}
      />
      <Input
        label="Senha"
        type="password"
        placeholder="••••••••"
        value={form.password}
        onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
        autoComplete="current-password"
        required
        disabled={loading}
      />
      <Button type="submit" size="lg" loading={loading} className="mt-2 w-full">
        {loading ? 'Entrando...' : 'Entrar'}
      </Button>
    </form>
  )
}

export default function AdminLoginPage() {
  return (
    <main className="min-h-screen bg-[#0a0a0a] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <FoxLogo size="lg" />
          <h1 className="text-white font-bold text-xl mt-4">Painel Admin</h1>
          <p className="text-gray-500 text-sm mt-1">FoxCycles · Sistema de Cupons</p>
        </div>

        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  )
}
