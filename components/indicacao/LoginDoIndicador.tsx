'use client'

import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { formatCPF } from '@/lib/validators/cpf'
import { emailSinteticoDoCpf } from '@/lib/indicacao/regras'

function Formulario() {
  const searchParams = useSearchParams()
  const next = searchParams.get('next') || '/indicador'
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ cpf: '', senha: '' })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    // O CPF é o login. O Auth guarda um e-mail sintético derivado dele —
    // ninguém escreve para esse endereço.
    const { error } = await createClient().auth.signInWithPassword({
      email: emailSinteticoDoCpf(form.cpf),
      password: form.senha,
    })

    if (error) {
      // Mensagem única de propósito: dizer qual dos dois errou conta a quem
      // tenta adivinhar que aquele CPF está cadastrado.
      toast.error('CPF ou senha incorretos.')
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
        label="CPF"
        placeholder="000.000.000-00"
        value={form.cpf}
        onChange={(e) => setForm((p) => ({ ...p, cpf: formatCPF(e.target.value) }))}
        inputMode="numeric"
        required
        disabled={loading}
      />
      <Input
        label="Senha"
        type="password"
        placeholder="••••••••"
        value={form.senha}
        onChange={(e) => setForm((p) => ({ ...p, senha: e.target.value }))}
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

export function LoginDoIndicador() {
  return (
    <Suspense fallback={null}>
      <Formulario />
    </Suspense>
  )
}
