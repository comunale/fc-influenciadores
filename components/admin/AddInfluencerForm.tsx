'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

interface Campaign {
  id: string
  name: string
}

export function AddInfluencerForm({ campaigns }: { campaigns: Campaign[] }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    campaign_id: campaigns[0]?.id || '',
    name: '',
    instagram_handle: '',
    coupon_code: '',
    fee_amount: '500',
    commission_per_sale: '500',
    commission_starts_at: '2',
  })

  function handleHandleChange(value: string) {
    const handle = value.replace('@', '').toUpperCase().replace(/[^A-Z0-9]/g, '')
    setForm((p) => ({ ...p, instagram_handle: `@${handle.toLowerCase()}`, coupon_code: handle }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name || !form.instagram_handle || !form.coupon_code || !form.campaign_id) {
      toast.error('Preencha todos os campos obrigatórios.')
      return
    }

    setLoading(true)
    const supabase = createClient()

    const { error } = await supabase.from('influencers').insert({
      campaign_id: form.campaign_id,
      name: form.name.trim(),
      instagram_handle: form.instagram_handle,
      coupon_code: form.coupon_code.toUpperCase(),
      fee_amount: parseFloat(form.fee_amount) || 0,
      commission_per_sale: parseFloat(form.commission_per_sale) || 0,
      commission_starts_at: parseInt(form.commission_starts_at) || 2,
      active: true,
    })

    setLoading(false)

    if (error) {
      if (error.code === '23505') {
        toast.error('Este código de cupom já está em uso.')
      } else {
        toast.error('Erro ao salvar influencer.')
      }
      return
    }

    toast.success('Influencer adicionado!')
    setForm((p) => ({ ...p, name: '', instagram_handle: '', coupon_code: '' }))
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <label className="text-sm text-gray-300 block mb-1.5">Campanha *</label>
        <select
          value={form.campaign_id}
          onChange={(e) => setForm((p) => ({ ...p, campaign_id: e.target.value }))}
          className="w-full h-12 px-4 rounded-lg border border-[#2a2a2a] bg-[#1e1e1e] text-white text-sm focus:border-[#00ff87] focus:outline-none"
          disabled={loading}
        >
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      <Input
        label="Nome completo *"
        placeholder="Ex: Prii Valim"
        value={form.name}
        onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
        disabled={loading}
      />

      <Input
        label="Instagram *"
        placeholder="@seuperfil"
        value={form.instagram_handle}
        onChange={(e) => handleHandleChange(e.target.value)}
        disabled={loading}
      />

      <Input
        label="Código do cupom *"
        placeholder="SEUPERFIL"
        value={form.coupon_code}
        onChange={(e) => setForm((p) => ({ ...p, coupon_code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') }))}
        disabled={loading}
      />

      <Input
        label="Fee fixo (R$)"
        type="number"
        value={form.fee_amount}
        onChange={(e) => setForm((p) => ({ ...p, fee_amount: e.target.value }))}
        disabled={loading}
      />

      <Input
        label="Comissão por venda (R$)"
        type="number"
        value={form.commission_per_sale}
        onChange={(e) => setForm((p) => ({ ...p, commission_per_sale: e.target.value }))}
        disabled={loading}
      />

      <div className="md:col-span-2">
        <Button type="submit" loading={loading} className="w-full md:w-auto">
          Adicionar Influencer
        </Button>
      </div>
    </form>
  )
}
