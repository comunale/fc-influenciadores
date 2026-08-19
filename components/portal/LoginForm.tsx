'use client'

import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

function Formulario() {
  const searchParams = useSearchParams()
  const next = searchParams.get('next') || '/portal'
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ email: '', password: '' })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    const { error } = await createClient().auth.signInWithPassword({
      email: form.email,
      password: form.password,
    })

    if (error) {
      toast.error('E-mail ou senha inválidos.')
      setLoading(false)
      return
    }

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
        placeholder="voce@email.com"
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

export function LoginForm() {
  return (
    <Suspense fallback={null}>
      <Formulario />
    </Suspense>
  )
}
