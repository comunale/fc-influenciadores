'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

/** Mesmo mínimo da rota. Subiu de 8 para 12 em 02/10/2026. */
const MINIMO = 12

/**
 * O influenciador define a própria senha.
 *
 * A troca acontece numa rota do SERVIDOR, não com `auth.updateUser` aqui. O
 * motivo: é o servidor que carimba "ele já definiu a dele", e esse carimbo
 * libera o portal e sustenta o aceite do contrato. Carimbo que o próprio
 * interessado pudesse emitir do navegador não valeria nada.
 */
export function FormSenha({ primeiraVez }: { primeiraVez: boolean }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ atual: '', nova: '', repetir: '' })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (form.nova.length < MINIMO) {
      return toast.error(`A senha nova precisa ter ao menos ${MINIMO} caracteres.`)
    }
    if (form.nova !== form.repetir) {
      return toast.error('As duas senhas novas não são iguais.')
    }

    setLoading(true)
    const res = await fetch('/api/portal/definir-senha', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ senha_atual: form.atual, senha_nova: form.nova }),
    })
    const json = await res.json()
    setLoading(false)

    if (!res.ok) return toast.error(json.error || 'Não foi possível trocar a senha.')

    setForm({ atual: '', nova: '', repetir: '' })
    toast.success(primeiraVez ? 'Pronto! Bem-vindo ao portal.' : 'Senha trocada.')

    // Na primeira vez o portal estava fechado: agora abre.
    if (primeiraVez) router.push('/portal')
    else router.refresh()
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-[#141414] border border-[#1e1e1e] rounded-2xl p-6 flex flex-col gap-4"
    >
      <Input
        label={primeiraVez ? 'Senha que a FoxCycles enviou' : 'Senha atual'}
        type="password"
        value={form.atual}
        onChange={(e) => setForm((p) => ({ ...p, atual: e.target.value }))}
        autoComplete="current-password"
        required
        disabled={loading}
      />
      <Input
        label="Sua nova senha"
        type="password"
        placeholder={`ao menos ${MINIMO} caracteres`}
        value={form.nova}
        onChange={(e) => setForm((p) => ({ ...p, nova: e.target.value }))}
        autoComplete="new-password"
        required
        disabled={loading}
      />
      <Input
        label="Repita a nova senha"
        type="password"
        value={form.repetir}
        onChange={(e) => setForm((p) => ({ ...p, repetir: e.target.value }))}
        autoComplete="new-password"
        required
        disabled={loading}
      />
      <Button type="submit" loading={loading} className="mt-2">
        {primeiraVez ? 'Criar minha senha e entrar' : 'Trocar senha'}
      </Button>
    </form>
  )
}
