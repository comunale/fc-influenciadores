'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { formatCPF } from '@/lib/validators/cpf'
import { validarCelular, mascaraCelular } from '@/lib/validators/telefone'

interface Props {
  codigo: string
}

/**
 * O formulário do comprador no link de indicação.
 *
 * É o do influenciador menos o e-mail: o César decidiu que nome, CPF e
 * telefone bastam para dar o desconto e amarrar a venda a quem indicou.
 */
export function FormularioDoComprador({ codigo }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [form, setForm] = useState({
    customer_name: '',
    customer_cpf: '',
    customer_phone: '',
    accept_communications: false,
  })

  function handleChange(campo: string, valor: string | boolean) {
    setErrors((prev) => ({ ...prev, [campo]: '' }))
    if (campo === 'customer_cpf' && typeof valor === 'string') {
      setForm((prev) => ({ ...prev, customer_cpf: formatCPF(valor) }))
      return
    }
    if (campo === 'customer_phone' && typeof valor === 'string') {
      setForm((prev) => ({ ...prev, customer_phone: mascaraCelular(valor) }))
      return
    }
    setForm((prev) => ({ ...prev, [campo]: valor }))
  }

  function validate(): boolean {
    const e: Record<string, string> = {}
    if (form.customer_name.trim().length < 3) e.customer_name = 'Informe seu nome completo.'
    if (form.customer_cpf.replace(/\D/g, '').length < 11) e.customer_cpf = 'CPF inválido.'
    const fone = validarCelular(form.customer_phone)
    if (!fone.ok) e.customer_phone = fone.motivo
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault()
    if (!validate()) return

    setLoading(true)
    try {
      const res = await fetch('/api/indicacao/cupom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codigo,
          customer_name: form.customer_name,
          customer_cpf: form.customer_cpf.replace(/\D/g, ''),
          customer_phone: validarCelular(form.customer_phone).digitos,
          accept_communications: form.accept_communications,
        }),
      })
      const data = await res.json()

      if (!res.ok) {
        if (res.status === 409 && data.coupon_number) {
          toast.error('Você já tem um cupom! Redirecionando...')
          setTimeout(() => router.push(`/cupom/${data.coupon_number}`), 1500)
          return
        }
        throw new Error(data.error || 'Erro ao gerar cupom.')
      }

      toast.success('Cupom gerado!')
      router.push(`/cupom/${data.coupon_number}`)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Input
        label="Nome completo"
        placeholder="Seu nome completo"
        value={form.customer_name}
        onChange={(e) => handleChange('customer_name', e.target.value)}
        error={errors.customer_name}
        autoComplete="name"
        disabled={loading}
      />

      <Input
        label="CPF"
        placeholder="000.000.000-00"
        value={form.customer_cpf}
        onChange={(e) => handleChange('customer_cpf', e.target.value)}
        error={errors.customer_cpf}
        inputMode="numeric"
        disabled={loading}
      />

      <Input
        label="WhatsApp (com DDD)"
        placeholder="(11) 99999-9999"
        value={form.customer_phone}
        onChange={(e) => handleChange('customer_phone', e.target.value)}
        error={errors.customer_phone}
        inputMode="numeric"
        autoComplete="tel"
        disabled={loading}
      />
      {!errors.customer_phone && (
        <p className="text-xs text-gray-500 -mt-2 leading-relaxed">
          Celular com DDD e o 9. É por aqui que a loja fala com você sobre o cupom.
        </p>
      )}

      <label className="flex items-start gap-3 cursor-pointer mt-1">
        <input
          type="checkbox"
          checked={form.accept_communications}
          onChange={(e) => handleChange('accept_communications', e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-[#00ff87] cursor-pointer"
          disabled={loading}
        />
        <span className="text-sm text-gray-400 leading-tight">
          Aceito receber comunicações da FoxCycles por WhatsApp
        </span>
      </label>

      <Button type="submit" size="lg" loading={loading} className="mt-2 w-full font-bold text-black">
        {loading ? 'Gerando seu cupom...' : 'Gerar Meu Cupom'}
      </Button>

      <p className="text-xs text-center text-gray-500">
        Seus dados estão protegidos e não serão compartilhados com terceiros.
      </p>
    </form>
  )
}
