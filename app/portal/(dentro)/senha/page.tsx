'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

/**
 * O influenciador troca a própria senha.
 *
 * Primeira escrita que um usuário de fora faz neste sistema, liberada pelo
 * César em 19/08 com a condição de ficar SEPARADA do resto.
 *
 * E fica, por construção: isto não toca em nenhuma tabela nossa. A senha vive
 * no Auth do Supabase, que é outro sistema -- não há tabela, política ou coluna
 * do fc-influenciadores envolvida aqui. Não dá para escorregar de "trocar a
 * própria senha" para "alterar qualquer outra coisa", porque não existe caminho.
 *
 * A senha atual é exigida mesmo com a sessão válida: sem isso, um celular
 * destravado e esquecido em cima do balcão vira uma conta tomada.
 */
export default function TrocarSenhaPage() {
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ atual: '', nova: '', repetir: '' })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (form.nova.length < 8) {
      return toast.error('A senha nova precisa ter ao menos 8 caracteres.')
    }
    if (form.nova !== form.repetir) {
      return toast.error('As duas senhas novas não são iguais.')
    }
    if (form.nova === form.atual) {
      return toast.error('A senha nova precisa ser diferente da atual.')
    }

    setLoading(true)
    const supabase = createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) {
      setLoading(false)
      return toast.error('Sessão expirada. Entre de novo.')
    }

    // Confere a senha atual antes de deixar trocar.
    const { error: erroLogin } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: form.atual,
    })
    if (erroLogin) {
      setLoading(false)
      return toast.error('A senha atual está errada.')
    }

    const { error } = await supabase.auth.updateUser({ password: form.nova })
    setLoading(false)

    if (error) return toast.error('Não foi possível trocar a senha.')

    toast.success('Senha trocada.')
    setForm({ atual: '', nova: '', repetir: '' })
  }

  return (
    <div className="max-w-md mx-auto px-4 py-6 flex flex-col gap-6">
      <div>
        <h1 className="text-white font-bold text-2xl">Trocar senha</h1>
        <p className="text-gray-500 text-sm mt-1">
          Se você entrou com a senha que a FoxCycles enviou, troque por uma sua.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="bg-[#141414] border border-[#1e1e1e] rounded-2xl p-6 flex flex-col gap-4"
      >
        <Input
          label="Senha atual"
          type="password"
          value={form.atual}
          onChange={(e) => setForm((p) => ({ ...p, atual: e.target.value }))}
          autoComplete="current-password"
          required
          disabled={loading}
        />
        <Input
          label="Senha nova"
          type="password"
          placeholder="ao menos 8 caracteres"
          value={form.nova}
          onChange={(e) => setForm((p) => ({ ...p, nova: e.target.value }))}
          autoComplete="new-password"
          required
          disabled={loading}
        />
        <Input
          label="Repita a senha nova"
          type="password"
          value={form.repetir}
          onChange={(e) => setForm((p) => ({ ...p, repetir: e.target.value }))}
          autoComplete="new-password"
          required
          disabled={loading}
        />
        <Button type="submit" loading={loading} className="mt-2">
          Trocar senha
        </Button>
      </form>

      <p className="text-gray-600 text-xs leading-relaxed">
        Esqueceu a senha? Fale com quem cuida da sua parceria na FoxCycles — o
        sistema não envia e-mail de recuperação.
      </p>
    </div>
  )
}
