'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { formatCPF } from '@/lib/validators/cpf'
import { validarCelular, mascaraCelular } from '@/lib/validators/telefone'
import { SENHA_MINIMA } from '@/lib/indicacao/cadastro'
import { maiorDeIdade, IDADE_MINIMA } from '@/lib/indicacao/regras'

const CAMPO_SELECT =
  'flex h-12 w-full rounded-lg border bg-[#1e1e1e] px-4 py-2 text-base text-white ' +
  'border-[#2a2a2a] focus:border-[#00ff87] focus:outline-none focus:ring-1 focus:ring-[#00ff87]'

export function FormularioDeCadastro() {
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [pronto, setPronto] = useState<{ codigo: string; link: string } | null>(null)
  const [form, setForm] = useState({
    nome: '',
    cpf: '',
    telefone: '',
    sexo: '',
    data_nascimento: '',
    senha: '',
    aceite_termos: false,
    aceite_comunicacoes: false,
  })

  function handleChange(campo: string, valor: string | boolean) {
    setErrors((prev) => ({ ...prev, [campo]: '' }))
    if (campo === 'cpf' && typeof valor === 'string') {
      setForm((prev) => ({ ...prev, cpf: formatCPF(valor) }))
      return
    }
    if (campo === 'telefone' && typeof valor === 'string') {
      setForm((prev) => ({ ...prev, telefone: mascaraCelular(valor) }))
      return
    }
    setForm((prev) => ({ ...prev, [campo]: valor }))
  }

  function validate(): boolean {
    const e: Record<string, string> = {}

    if (form.nome.trim().length < 3) e.nome = 'Informe seu nome completo.'
    if (form.cpf.replace(/\D/g, '').length < 11) e.cpf = 'CPF inválido.'

    const fone = validarCelular(form.telefone)
    if (!fone.ok) e.telefone = fone.motivo

    if (!form.sexo) e.sexo = 'Selecione uma opção.'
    if (!form.data_nascimento) {
      e.data_nascimento = 'Informe sua data de nascimento.'
    } else if (!maiorDeIdade(form.data_nascimento)) {
      e.data_nascimento = `É preciso ter ${IDADE_MINIMA} anos para participar.`
    }
    if (form.senha.length < SENHA_MINIMA) {
      e.senha = `Pelo menos ${SENHA_MINIMA} caracteres.`
    }
    if (!form.aceite_termos) e.aceite_termos = 'É preciso aceitar os termos do programa.'

    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault()
    if (!validate()) return

    setLoading(true)
    try {
      const res = await fetch('/api/indicacao/cadastro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          cpf: form.cpf.replace(/\D/g, ''),
          telefone: validarCelular(form.telefone).digitos,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao cadastrar.')

      setPronto({ codigo: data.codigo, link: data.link })
      toast.success('Pronto! Seu link já está valendo.')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  if (pronto) {
    const linkCompleto =
      typeof window === 'undefined' ? pronto.link : `${window.location.origin}${pronto.link}`

    return (
      <div className="flex flex-col gap-5 text-center">
        <div>
          <p className="text-sm text-gray-400">Seu código de indicação</p>
          <p className="text-3xl font-black text-[#00ff87] tracking-wider mt-1">{pronto.codigo}</p>
          <p className="text-xs text-gray-500 mt-2 leading-relaxed">
            Este código identifica você. Quem for comprar precisa gerar o cupom
            pelo seu link — mostrar este código na loja não vale desconto.
          </p>
        </div>

        <div className="border-t border-[#1e1e1e] pt-5">
          <p className="text-sm text-gray-400">Seu link para divulgar</p>
          <p className="text-white text-sm break-all mt-1 bg-[#1e1e1e] rounded-lg px-3 py-2">
            {linkCompleto}
          </p>
          <Button
            type="button"
            size="lg"
            className="mt-3 w-full font-bold text-black"
            onClick={() => {
              navigator.clipboard
                .writeText(linkCompleto)
                .then(() => toast.success('Link copiado.'))
                .catch(() => toast.error('Copie o link à mão.'))
            }}
          >
            Copiar meu link
          </Button>
        </div>

        <div className="border-t border-[#1e1e1e] pt-5 text-left">
          <p className="text-sm text-gray-300 leading-relaxed">
            Quem comprar pelo seu link leva <strong className="text-white">R$ 300</strong> de
            desconto. Depois que a loja confere a nota fiscal, seus{' '}
            <strong className="text-white">R$ 200</strong> entram na sua área.
          </p>
          <a
            href="/indicador"
            className="inline-block mt-3 text-[#00ff87] hover:underline text-sm font-medium"
          >
            Ir para a minha área
          </a>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Input
        label="Nome completo"
        placeholder="Seu nome completo"
        value={form.nome}
        onChange={(e) => handleChange('nome', e.target.value)}
        error={errors.nome}
        autoComplete="name"
        disabled={loading}
      />

      <Input
        label="CPF"
        placeholder="000.000.000-00"
        value={form.cpf}
        onChange={(e) => handleChange('cpf', e.target.value)}
        error={errors.cpf}
        inputMode="numeric"
        disabled={loading}
      />
      {!errors.cpf && (
        <p className="text-xs text-gray-500 -mt-2 leading-relaxed">
          O CPF é o seu login, e é o que liga cada venda a você.
        </p>
      )}

      <Input
        label="WhatsApp (com DDD)"
        placeholder="(11) 99999-9999"
        value={form.telefone}
        onChange={(e) => handleChange('telefone', e.target.value)}
        error={errors.telefone}
        inputMode="numeric"
        autoComplete="tel"
        disabled={loading}
      />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="sexo" className="text-sm font-medium text-gray-300">
          Sexo
        </label>
        <select
          id="sexo"
          value={form.sexo}
          onChange={(e) => handleChange('sexo', e.target.value)}
          disabled={loading}
          className={CAMPO_SELECT}
        >
          <option value="">Selecione</option>
          <option value="F">Feminino</option>
          <option value="M">Masculino</option>
          <option value="outro">Prefiro não dizer</option>
        </select>
        {errors.sexo && <p className="text-xs text-red-400">{errors.sexo}</p>}
      </div>

      <Input
        label="Data de nascimento"
        type="date"
        value={form.data_nascimento}
        onChange={(e) => handleChange('data_nascimento', e.target.value)}
        error={errors.data_nascimento}
        disabled={loading}
      />

      <Input
        label="Senha"
        type="password"
        placeholder={`Pelo menos ${SENHA_MINIMA} caracteres`}
        value={form.senha}
        onChange={(e) => handleChange('senha', e.target.value)}
        error={errors.senha}
        autoComplete="new-password"
        disabled={loading}
      />

      <label className="flex items-start gap-3 cursor-pointer mt-1">
        <input
          type="checkbox"
          checked={form.aceite_termos}
          onChange={(e) => handleChange('aceite_termos', e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-[#00ff87] cursor-pointer"
          disabled={loading}
        />
        <span className="text-sm text-gray-400 leading-tight">
          Aceito os termos do programa e o uso dos meus dados para gerar o meu cartão de
          benefícios e pagar os prêmios.
        </span>
      </label>
      {errors.aceite_termos && <p className="text-xs text-red-400 -mt-2">{errors.aceite_termos}</p>}

      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={form.aceite_comunicacoes}
          onChange={(e) => handleChange('aceite_comunicacoes', e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-[#00ff87] cursor-pointer"
          disabled={loading}
        />
        <span className="text-sm text-gray-400 leading-tight">
          Quero receber novidades e publicidade da FoxCycles por WhatsApp.{' '}
          <span className="text-gray-500">(opcional)</span>
        </span>
      </label>

      <Button type="submit" size="lg" loading={loading} className="mt-2 w-full font-bold text-black">
        {loading ? 'Criando seu acesso...' : 'Quero meu link'}
      </Button>
    </form>
  )
}
