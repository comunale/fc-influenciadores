'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { formatCPF, formatPhone } from '@/lib/validators/cpf'

interface CouponFormProps {
  influencerCode: string
}

export function CouponForm({ influencerCode }: CouponFormProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [form, setForm] = useState({
    customer_name: '',
    customer_cpf: '',
    customer_phone: '',
    customer_email: '',
    accept_communications: false,
  })

  function handleChange(field: string, value: string | boolean) {
    setErrors((prev) => ({ ...prev, [field]: '' }))
    if (field === 'customer_cpf' && typeof value === 'string') {
      setForm((prev) => ({ ...prev, [field]: formatCPF(value) }))
      return
    }
    if (field === 'customer_phone' && typeof value === 'string') {
      setForm((prev) => ({ ...prev, [field]: formatPhone(value) }))
      return
    }
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function validate(): boolean {
    const newErrors: Record<string, string> = {}

    if (!form.customer_name.trim() || form.customer_name.trim().length < 3) {
      newErrors.customer_name = 'Informe seu nome completo.'
    }
    if (!form.customer_cpf || form.customer_cpf.replace(/\D/g, '').length < 11) {
      newErrors.customer_cpf = 'CPF inválido.'
    }
    if (!form.customer_phone || form.customer_phone.replace(/\D/g, '').length < 10) {
      newErrors.customer_phone = 'Informe o telefone com DDD.'
    }
    if (!form.customer_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.customer_email)) {
      newErrors.customer_email = 'E-mail inválido.'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return

    setLoading(true)
    try {
      const res = await fetch('/api/coupons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          influencer_code: influencerCode,
          customer_name: form.customer_name,
          customer_cpf: form.customer_cpf,
          customer_phone: form.customer_phone,
          customer_email: form.customer_email,
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

      toast.success('Cupom gerado com sucesso!')
      router.push(`/cupom/${data.coupon_number}`)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Tente novamente.'
      toast.error(message)
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
        label="Telefone (com DDD)"
        placeholder="(11) 99999-9999"
        value={form.customer_phone}
        onChange={(e) => handleChange('customer_phone', e.target.value)}
        error={errors.customer_phone}
        inputMode="numeric"
        autoComplete="tel"
        disabled={loading}
      />

      <Input
        label="E-mail"
        placeholder="seu@email.com"
        type="email"
        value={form.customer_email}
        onChange={(e) => handleChange('customer_email', e.target.value)}
        error={errors.customer_email}
        autoComplete="email"
        disabled={loading}
      />

      <label className="flex items-start gap-3 cursor-pointer mt-1">
        <input
          type="checkbox"
          checked={form.accept_communications}
          onChange={(e) => handleChange('accept_communications', e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-[#00ff87] cursor-pointer"
          disabled={loading}
        />
        <span className="text-sm text-gray-400 leading-tight">
          Aceito receber comunicações da FoxCycles por e-mail e WhatsApp
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
