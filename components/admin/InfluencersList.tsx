'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://fc-influenciadores.vercel.app'

interface InfluencerRow {
  id: string
  name: string
  instagram_handle: string
  coupon_code: string
  fee_amount: number
  commission_per_sale: number
  commission_starts_at: number
  active: boolean
  campaign_id: string
  campaign_name: string
  total_coupons: number
  used_coupons: number
  pending_coupons: number
}

interface Campaign { id: string; name: string }

interface Props {
  influencers: InfluencerRow[]
  campaigns: Campaign[]
  canEdit?: boolean
}

const emptyForm = {
  campaign_id: '',
  name: '',
  instagram_handle: '',
  coupon_code: '',
  fee_amount: '500',
  commission_per_sale: '500',
  commission_starts_at: '2',
  active: true,
}

export function InfluencersList({ influencers: initial, campaigns, canEdit = false }: Props) {
  const router = useRouter()
  const [influencers, setInfluencers] = useState(initial)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<InfluencerRow | null>(null)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ ...emptyForm, campaign_id: campaigns[0]?.id || '' })

  function openCreate() {
    setEditing(null)
    setForm({ ...emptyForm, campaign_id: campaigns[0]?.id || '' })
    setShowForm(true)
  }

  function openEdit(inf: InfluencerRow) {
    setEditing(inf)
    setForm({
      campaign_id: inf.campaign_id,
      name: inf.name,
      instagram_handle: inf.instagram_handle,
      coupon_code: inf.coupon_code,
      fee_amount: String(inf.fee_amount),
      commission_per_sale: String(inf.commission_per_sale),
      commission_starts_at: String(inf.commission_starts_at),
      active: inf.active,
    })
    setShowForm(true)
  }

  function handleHandleChange(val: string) {
    const clean = val.replace('@', '').toUpperCase().replace(/[^A-Z0-9]/g, '')
    setForm((p) => ({ ...p, instagram_handle: `@${clean.toLowerCase()}`, coupon_code: clean }))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name || !form.coupon_code || !form.campaign_id) {
      toast.error('Preencha todos os campos obrigatórios.')
      return
    }
    setLoading(true)
    const supabase = createClient()
    const payload = {
      campaign_id: form.campaign_id,
      name: form.name.trim(),
      instagram_handle: form.instagram_handle,
      coupon_code: form.coupon_code.toUpperCase(),
      fee_amount: parseFloat(form.fee_amount) || 0,
      commission_per_sale: parseFloat(form.commission_per_sale) || 0,
      commission_starts_at: parseInt(form.commission_starts_at) || 2,
      active: form.active,
    }

    const { error } = editing
      ? await supabase.from('influencers').update(payload).eq('id', editing.id)
      : await supabase.from('influencers').insert(payload)

    setLoading(false)
    if (error) {
      toast.error(error.code === '23505' ? 'Código de cupom já existe.' : error.message)
      return
    }
    toast.success(editing ? 'Influencer atualizado!' : 'Influencer criado!')
    setShowForm(false)
    router.refresh()
  }

  async function handleToggleActive(inf: InfluencerRow) {
    const supabase = createClient()
    const { error } = await supabase
      .from('influencers')
      .update({ active: !inf.active })
      .eq('id', inf.id)
    if (error) { toast.error('Erro ao atualizar.'); return }
    toast.success(inf.active ? 'Influencer desativado.' : 'Influencer ativado.')
    router.refresh()
  }

  function copyLink(code: string) {
    navigator.clipboard.writeText(`${SITE_URL}/c/${code}`)
    toast.success('Link copiado!')
  }

  return (
    <>
      {/* Cabeçalho */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Influencers</h1>
          <p className="text-gray-500 text-sm mt-0.5">{influencers.length} cadastrados</p>
        </div>
        {canEdit && <Button onClick={openCreate} size="sm">+ Novo Influencer</Button>}
      </div>

      {/* Modal criar/editar */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-4 bg-black/60">
          <div className="bg-[#141414] border border-[#1e1e1e] rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#1e1e1e]">
              <h2 className="text-white font-semibold text-lg">
                {editing ? 'Editar Influencer' : 'Novo Influencer'}
              </h2>
              <button onClick={() => setShowForm(false)} className="text-gray-500 hover:text-white text-xl">✕</button>
            </div>

            <form onSubmit={handleSave} className="p-6 flex flex-col gap-4">
              <div>
                <label className="text-sm text-gray-300 block mb-1.5">Campanha *</label>
                <select
                  value={form.campaign_id}
                  onChange={(e) => setForm((p) => ({ ...p, campaign_id: e.target.value }))}
                  className="w-full h-12 px-4 rounded-lg border border-[#2a2a2a] bg-[#1e1e1e] text-white text-sm focus:border-[#00ff87] focus:outline-none"
                  disabled={loading}
                >
                  {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              <Input label="Nome completo *" value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="Ex: Prii Valim" disabled={loading} />

              <Input label="@ Instagram *" value={form.instagram_handle}
                onChange={(e) => handleHandleChange(e.target.value)}
                placeholder="@seuperfil" disabled={loading} />

              <Input label="Código do cupom *" value={form.coupon_code}
                onChange={(e) => setForm((p) => ({ ...p, coupon_code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') }))}
                placeholder="SEUPERFIL" disabled={loading} />

              <div className="grid grid-cols-2 gap-3">
                <Input label="Fee fixo (R$)" type="number" value={form.fee_amount}
                  onChange={(e) => setForm((p) => ({ ...p, fee_amount: e.target.value }))}
                  disabled={loading} />
                <Input label="Comissão/venda (R$)" type="number" value={form.commission_per_sale}
                  onChange={(e) => setForm((p) => ({ ...p, commission_per_sale: e.target.value }))}
                  disabled={loading} />
              </div>

              <Input label="Comissão inicia na venda nº" type="number" value={form.commission_starts_at}
                onChange={(e) => setForm((p) => ({ ...p, commission_starts_at: e.target.value }))}
                disabled={loading} />

              {editing && (
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={form.active}
                    onChange={(e) => setForm((p) => ({ ...p, active: e.target.checked }))}
                    className="accent-[#00ff87] w-4 h-4" />
                  <span className="text-sm text-gray-300">Ativo</span>
                </label>
              )}

              <div className="flex gap-3 pt-2">
                <Button type="submit" loading={loading} className="flex-1">
                  {editing ? 'Salvar alterações' : 'Criar Influencer'}
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowForm(false)} disabled={loading}>
                  Cancelar
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lista */}
      <div className="flex flex-col gap-3">
        {influencers.map((inf) => (
          <div key={inf.id}
            className="bg-[#141414] border border-[#1e1e1e] rounded-xl p-4 flex flex-col gap-3">
            {/* Linha 1: nome + status */}
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-white font-semibold">{inf.name}</span>
                  <span className="text-[#00ff87] text-sm">{inf.instagram_handle}</span>
                  {!inf.active && (
                    <span className="text-xs text-red-400 bg-red-950 px-2 py-0.5 rounded-full">Inativo</span>
                  )}
                </div>
                <div className="text-gray-500 text-xs mt-0.5">
                  Campanha: {inf.campaign_name} · Código:{' '}
                  <span className="font-mono text-gray-300">{inf.coupon_code}</span>
                </div>
              </div>
              {canEdit && (
                <button
                  onClick={() => openEdit(inf)}
                  className="text-xs border border-[#2a2a2a] text-gray-400 hover:text-white hover:border-[#00ff87] px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
                >
                  Editar
                </button>
              )}
            </div>

            {/* Linha 2: métricas */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div className="bg-[#1a1a1a] rounded-lg px-3 py-2 text-center">
                <div className="text-xs text-gray-500">Cupons</div>
                <div className="text-white font-bold">{inf.total_coupons}</div>
              </div>
              <div className="bg-[#1a1a1a] rounded-lg px-3 py-2 text-center">
                <div className="text-xs text-gray-500">Vendas</div>
                <div className="text-[#00ff87] font-bold">{inf.used_coupons}</div>
              </div>
              <div className="bg-[#1a1a1a] rounded-lg px-3 py-2 text-center">
                <div className="text-xs text-gray-500">Fee</div>
                <div className="text-white font-bold text-sm">{formatCurrency(inf.fee_amount)}</div>
              </div>
              <div className="bg-[#1a1a1a] rounded-lg px-3 py-2 text-center">
                <div className="text-xs text-gray-500">Comissão/venda</div>
                <div className="text-[#00ff87] font-bold text-sm">{formatCurrency(inf.commission_per_sale)}</div>
              </div>
            </div>

            {/* Linha 3: link + ações */}
            <div className="flex items-center gap-2 flex-wrap">
              <code className="text-xs text-gray-600 bg-[#1a1a1a] px-3 py-1.5 rounded-lg flex-1 min-w-0 truncate">
                {SITE_URL}/c/{inf.coupon_code}
              </code>
              <button
                onClick={() => copyLink(inf.coupon_code)}
                className="text-xs bg-[#00ff87] text-black font-semibold px-3 py-1.5 rounded-lg hover:bg-[#00cc6a] transition-colors flex-shrink-0"
              >
                Copiar Link
              </button>
              {canEdit && (
                <button
                  onClick={() => handleToggleActive(inf)}
                  className="text-xs border border-[#2a2a2a] text-gray-400 hover:text-white px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
                >
                  {inf.active ? 'Desativar' : 'Ativar'}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
