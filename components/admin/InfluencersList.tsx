'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { ResumoComissao } from '@/lib/commission'
import { mensagemDeErro } from '@/lib/db-errors'
import { motivoLinkInativo } from '@/lib/influencer-status'
import { ParceriaPanel, type ParceriaForm } from './ParceriaPanel'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://influenciadores.foxcycles.com.br'

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
  discount_type: string
  discount_value: number
  validity_days: number
  coupon_title: string | null
  coupon_description: string | null
  partnership_ends_at: string | null
  total_coupons: number
  used_coupons: number
  pending_coupons: number
  comissao: ResumoComissao
}

interface Campaign {
  id: string
  name: string
  discount_type: string
  discount_value: number
  validity_days: number
  coupon_title: string
  coupon_description: string
}

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
  // A oferta desceu da campanha para o influencer em 18/08/2026.
  discount_type: 'fixed',
  discount_value: '200',
  validity_days: '30',
  coupon_title: '',
  coupon_description: '',
}

export function InfluencersList({ influencers: initial, campaigns, canEdit = false }: Props) {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [excluindoId, setExcluindoId] = useState<string | null>(null)
  const [parceria, setParceria] = useState<{ inf: InfluencerRow; acao: 'prorrogar' | 'renovar' } | null>(null)
  const [pForm, setPForm] = useState<ParceriaForm>({
    ends_at: '', discount_value: '', validity_days: '',
    commission_per_sale: '', commission_starts_at: '', zerar_contagem: false,
  })
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
      discount_type: inf.discount_type,
      discount_value: String(inf.discount_value),
      validity_days: String(inf.validity_days),
      coupon_title: inf.coupon_title ?? '',
      coupon_description: inf.coupon_description ?? '',
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
      discount_type: form.discount_type,
      discount_value: parseFloat(form.discount_value) || 0,
      validity_days: parseInt(form.validity_days) || 30,
      coupon_title: form.coupon_title.trim() || null,
      coupon_description: form.coupon_description.trim() || null,
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

  function abrirParceria(inf: InfluencerRow, acao: 'prorrogar' | 'renovar') {
    setParceria({ inf, acao })
    setPForm({
      ends_at: inf.partnership_ends_at ?? '',
      discount_value: String(inf.discount_value),
      validity_days: String(inf.validity_days),
      commission_per_sale: String(inf.commission_per_sale),
      commission_starts_at: String(inf.commission_starts_at),
      zerar_contagem: false,
    })
  }

  async function salvarParceria() {
    if (!parceria) return
    setLoading(true)
    const res = await fetch('/api/admin/influencer-renew', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: parceria.inf.id,
        acao: parceria.acao,
        ends_at: pForm.ends_at || null,
        ...(parceria.acao === 'renovar' ? {
          termos: {
            discount_value: pForm.discount_value,
            validity_days: pForm.validity_days,
            commission_per_sale: pForm.commission_per_sale,
            commission_starts_at: pForm.commission_starts_at,
          },
          zerar_contagem: pForm.zerar_contagem,
        } : {}),
      }),
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) { toast.error(data.error || 'Erro ao salvar.'); return }
    toast.success(parceria.acao === 'prorrogar' ? 'Parceria prorrogada!' : 'Parceria renovada!')
    setParceria(null)
    router.refresh()
  }

  async function handleDelete(inf: { id: string; instagram_handle: string }) {
    const supabase = createClient()
    const { error } = await supabase.from('influencers').delete().eq('id', inf.id)
    if (error) { toast.error(mensagemDeErro(error.message, 'influencer')); return }
    toast.success(`Influencer ${inf.instagram_handle} excluído.`)
    setExcluindoId(null)
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
          <p className="text-gray-500 text-sm mt-0.5">{initial.length} cadastrados</p>
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
                  onChange={(e) => {
                    const c = campaigns.find((x) => x.id === e.target.value)
                    // A campanha e MODELO: preenche, nao manda. Depois disto os
                    // valores sao deste influencer e podem ser editados a vontade.
                    setForm((p) => ({
                      ...p,
                      campaign_id: e.target.value,
                      ...(c ? {
                        discount_type: c.discount_type,
                        discount_value: String(c.discount_value),
                        validity_days: String(c.validity_days),
                        coupon_title: c.coupon_title ?? '',
                        coupon_description: c.coupon_description ?? '',
                      } : {}),
                    }))
                  }}
                  className="w-full h-12 px-4 rounded-lg border border-[#2a2a2a] bg-[#1e1e1e] text-white text-sm focus:border-[#00ff87] focus:outline-none"
                  disabled={loading}
                >
                  {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              <p className="text-xs text-gray-500 md:col-span-2 -mb-1">
                A campanha preenche os campos abaixo, mas eles passam a ser deste
                influencer. Editar aqui não afeta a campanha nem os outros.
              </p>

              <div>
                <label className="text-sm text-gray-300 block mb-1.5">Tipo de desconto</label>
                <select
                  value={form.discount_type}
                  onChange={(e) => setForm((p) => ({ ...p, discount_type: e.target.value }))}
                  className="w-full h-12 px-4 rounded-lg border border-[#2a2a2a] bg-[#1e1e1e] text-white text-sm focus:border-[#00ff87] focus:outline-none"
                  disabled={loading}
                >
                  <option value="fixed">Valor fixo (R$)</option>
                  <option value="percentage">Percentual (%)</option>
                </select>
              </div>

              <Input label="Desconto" type="number" value={form.discount_value}
                onChange={(e) => setForm((p) => ({ ...p, discount_value: e.target.value }))}
                disabled={loading} />

              <Input label="Validade do cupom (dias)" type="number" value={form.validity_days}
                onChange={(e) => setForm((p) => ({ ...p, validity_days: e.target.value }))}
                disabled={loading} />

              <Input label="Título do cupom" value={form.coupon_title}
                onChange={(e) => setForm((p) => ({ ...p, coupon_title: e.target.value }))}
                disabled={loading} />

              <Input label="Descrição do cupom" value={form.coupon_description}
                onChange={(e) => setForm((p) => ({ ...p, coupon_description: e.target.value }))}
                disabled={loading} className="md:col-span-2" />

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
        {initial.map((inf) => (
          <div key={inf.id}
            className="bg-[#141414] border border-[#1e1e1e] rounded-xl p-4 flex flex-col gap-3">
            {/* Linha 1: nome + status */}
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-white font-semibold">{inf.name}</span>
                  <span className="text-[#00ff87] text-sm">{inf.instagram_handle}</span>
                  {(() => {
                    // Dois interruptores independentes. Antes desta etiqueta, um
                    // influenciador ativo dentro de campanha desligada parecia no ar
                    // -- foi o que deixou 17 links mortos sem ninguem entender por que.
                    // Mesma regra que decide se o link abre (lib/influencer-status.ts).
                    // A campanha nao entra mais: desde 18/08/2026 ela nao derruba link.
                    const motivo = motivoLinkInativo(inf)
                    const estado = motivo
                      ? { texto: motivo, cor: 'bg-red-950 text-red-400' }
                      : { texto: 'Ativo', cor: 'bg-[#00ff87]/10 text-[#00ff87]' }
                    return (
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${estado.cor}`}>
                        {estado.texto}
                      </span>
                    )
                  })()}
                </div>
                <div className="text-gray-500 text-xs mt-0.5">
                  Campanha: {inf.campaign_name} · Código:{' '}
                  <span className="font-mono text-gray-300">{inf.coupon_code}</span>
                  {inf.partnership_ends_at && (
                    <> · Parceria até <span className="text-gray-300">{formatDate(inf.partnership_ends_at)}</span></>
                  )}
                </div>
              </div>
              {canEdit && (
                <div className="flex gap-2 flex-shrink-0">
                <button
                  onClick={() => abrirParceria(inf, 'prorrogar')}
                  className="text-xs border border-[#2a2a2a] text-gray-400 hover:text-white hover:border-[#00ff87] px-3 py-1.5 rounded-lg transition-colors"
                >
                  Prorrogar
                </button>
                <button
                  onClick={() => abrirParceria(inf, 'renovar')}
                  className="text-xs border border-[#2a2a2a] text-gray-400 hover:text-white hover:border-[#00ff87] px-3 py-1.5 rounded-lg transition-colors"
                >
                  Renovar
                </button>
                <button
                  onClick={() => openEdit(inf)}
                  className="text-xs border border-[#2a2a2a] text-gray-400 hover:text-white hover:border-[#00ff87] px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
                >
                  Editar
                </button>
                </div>
              )}
            </div>

            {/* Linha 2: métricas */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div className="bg-[#1a1a1a] rounded-lg px-3 py-2 text-center">
                <div className="text-xs text-gray-500">Cupons</div>
                <div className="text-white font-bold">{inf.total_coupons}</div>
              </div>
              <div className="bg-[#1a1a1a] rounded-lg px-3 py-2 text-center">
                <div className="text-xs text-gray-500">Vendas aprovadas</div>
                <div className="text-white font-bold">{inf.comissao.totalVendas}</div>
              </div>
              <div className="bg-[#1a1a1a] rounded-lg px-3 py-2 text-center">
                <div className="text-xs text-gray-500">Comissão gerada</div>
                <div className="text-white font-bold text-sm">{formatCurrency(inf.comissao.comissaoGerada)}</div>
              </div>
              <div className="bg-[#1a1a1a] rounded-lg px-3 py-2 text-center">
                <div className="text-xs text-gray-500">A pagar</div>
                <div className={`font-bold text-sm ${inf.comissao.comissaoAPagar > 0 ? 'text-[#00ff87]' : 'text-gray-500'}`}>
                  {formatCurrency(inf.comissao.comissaoAPagar)}
                </div>
              </div>
            </div>

            {/* O numero "a pagar" nao se sustenta sozinho: precisa dizer de que acordo saiu. */}
            <p className="text-xs text-gray-600">
              Contrato: {formatCurrency(inf.commission_per_sale)} por venda, a partir da{' '}
              {inf.commission_starts_at}ª · Fixo de {formatCurrency(inf.comissao.fixo)}{' '}
              <span className="text-gray-700">(pagamento do fixo não é controlado pelo sistema)</span>
            </p>

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
                <>
                  <button
                    onClick={() => handleToggleActive(inf)}
                    className="text-xs border border-[#2a2a2a] text-gray-400 hover:text-white px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
                  >
                    {inf.active ? 'Desativar' : 'Ativar'}
                  </button>
                  {excluindoId === inf.id ? (
                    <>
                      <button
                        onClick={() => handleDelete(inf)}
                        className="text-xs bg-red-700 text-white font-semibold px-3 py-1.5 rounded-lg hover:bg-red-600 transition-colors flex-shrink-0"
                      >
                        Confirmar exclusão
                      </button>
                      <button
                        onClick={() => setExcluindoId(null)}
                        className="text-xs border border-[#2a2a2a] text-gray-400 hover:text-white px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
                      >
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setExcluindoId(inf.id)}
                      className="text-xs border border-red-900 text-red-400 hover:bg-red-950 px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
                    >
                      Excluir
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      <ParceriaPanel
        parceria={parceria}
        form={pForm}
        setForm={setPForm}
        loading={loading}
        onSalvar={salvarParceria}
        onFechar={() => setParceria(null)}
      />
    </>
  )
}
