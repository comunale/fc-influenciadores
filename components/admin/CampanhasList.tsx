'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { Campaign } from '@/lib/supabase/types'
import { mensagemDeErro } from '@/lib/db-errors'

type CampanhaComContagem = Campaign & { influencer_count?: number }

const emptyForm = {
  name: '',
  discount_value: '200',
  discount_type: 'fixed',
  validity_days: '30',
  coupon_title: '',
  coupon_description: '',
  active: true,
}

export function CampanhasList({ campaigns: initial, canEdit = false }: { campaigns: CampanhaComContagem[]; canEdit?: boolean }) {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [excluindoId, setExcluindoId] = useState<string | null>(null)
  const [editing, setEditing] = useState<Campaign | null>(null)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState(emptyForm)

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setShowForm(true)
  }

  function openEdit(c: Campaign) {
    setEditing(c)
    setForm({
      name: c.name,
      discount_value: String(c.discount_value),
      discount_type: c.discount_type,
      validity_days: String(c.validity_days),
      coupon_title: c.coupon_title,
      coupon_description: c.coupon_description,
      active: c.active,
    })
    setShowForm(true)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name || !form.coupon_title) {
      toast.error('Nome e título do cupom são obrigatórios.')
      return
    }
    setLoading(true)
    const supabase = createClient()
    const payload = {
      name: form.name.trim(),
      discount_value: parseFloat(form.discount_value) || 0,
      discount_type: form.discount_type,
      validity_days: parseInt(form.validity_days) || 30,
      coupon_title: form.coupon_title.trim(),
      coupon_description: form.coupon_description.trim(),
      active: form.active,
    }

    const { error } = editing
      ? await supabase.from('campaigns').update(payload).eq('id', editing.id)
      : await supabase.from('campaigns').insert(payload)

    setLoading(false)
    if (error) { toast.error(error.message); return }
    toast.success(editing ? 'Campanha atualizada!' : 'Campanha criada!')
    setShowForm(false)
    router.refresh()
  }

  async function handleDelete(c: CampanhaComContagem) {
    const supabase = createClient()
    const { error } = await supabase.from('campaigns').delete().eq('id', c.id)
    if (error) { toast.error(mensagemDeErro(error.message, 'campanha')); return }
    toast.success(`Campanha "${c.name}" excluída.`)
    setExcluindoId(null)
    router.refresh()
  }

  async function handleToggle(c: Campaign) {
    const supabase = createClient()
    const { error } = await supabase.from('campaigns').update({ active: !c.active }).eq('id', c.id)
    if (error) { toast.error(error.message); return }
    toast.success(c.active ? 'Campanha desativada.' : 'Campanha ativada.')
    router.refresh()
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Campanhas</h1>
          <p className="text-gray-500 text-sm mt-0.5">{initial.length} campanha{initial.length !== 1 ? 's' : ''}</p>
        </div>
        {canEdit && <Button onClick={openCreate} size="sm">+ Nova Campanha</Button>}
      </div>

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-4 bg-black/60">
          <div className="bg-[#141414] border border-[#1e1e1e] rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#1e1e1e]">
              <h2 className="text-white font-semibold text-lg">
                {editing ? 'Editar Campanha' : 'Nova Campanha'}
              </h2>
              <button onClick={() => setShowForm(false)} className="text-gray-500 hover:text-white text-xl">✕</button>
            </div>

            <form onSubmit={handleSave} className="p-6 flex flex-col gap-4">
              <Input label="Nome da campanha *" value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="Ex: Reinauguração Campinas" disabled={loading} />

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm text-gray-300 block mb-1.5">Tipo de desconto</label>
                  <select
                    value={form.discount_type}
                    onChange={(e) => setForm((p) => ({ ...p, discount_type: e.target.value }))}
                    className="w-full h-12 px-4 rounded-lg border border-[#2a2a2a] bg-[#1e1e1e] text-white text-sm focus:border-[#00ff87] focus:outline-none"
                    disabled={loading}
                  >
                    <option value="fixed">Valor fixo (R$)</option>
                    <option value="percentage">Porcentagem (%)</option>
                  </select>
                </div>
                <Input
                  label={form.discount_type === 'fixed' ? 'Valor (R$)' : 'Porcentagem (%)'}
                  type="number"
                  value={form.discount_value}
                  onChange={(e) => setForm((p) => ({ ...p, discount_value: e.target.value }))}
                  disabled={loading}
                />
              </div>

              <Input label="Validade do cupom (dias)" type="number" value={form.validity_days}
                onChange={(e) => setForm((p) => ({ ...p, validity_days: e.target.value }))}
                disabled={loading} />

              <Input label="Título do cupom *" value={form.coupon_title}
                onChange={(e) => setForm((p) => ({ ...p, coupon_title: e.target.value }))}
                placeholder="Ex: R$ 200 OFF na sua FoxCycles" disabled={loading} />

              <div>
                <label className="text-sm text-gray-300 block mb-1.5">Descrição / regras</label>
                <textarea
                  value={form.coupon_description}
                  onChange={(e) => setForm((p) => ({ ...p, coupon_description: e.target.value }))}
                  rows={3}
                  placeholder="Ex: Cupom válido para qualquer moto elétrica FoxCycles..."
                  className="w-full rounded-lg border border-[#2a2a2a] bg-[#1e1e1e] px-4 py-3 text-white text-sm placeholder:text-gray-500 focus:border-[#00ff87] focus:outline-none resize-none"
                  disabled={loading}
                />
              </div>

              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={form.active}
                  onChange={(e) => setForm((p) => ({ ...p, active: e.target.checked }))}
                  className="accent-[#00ff87] w-4 h-4" />
                <span className="text-sm text-gray-300">Campanha ativa</span>
              </label>

              <div className="flex gap-3 pt-2">
                <Button type="submit" loading={loading} className="flex-1">
                  {editing ? 'Salvar alterações' : 'Criar campanha'}
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
      <div className="flex flex-col gap-4">
        {initial.map((c) => (
          <div key={c.id}
            className="bg-[#141414] border border-[#1e1e1e] rounded-xl p-5 flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h2 className="text-white font-semibold text-lg">{c.name}</h2>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                    c.active ? 'bg-[#00ff87]/10 text-[#00ff87]' : 'bg-gray-800 text-gray-400'
                  }`}>
                    {c.active ? 'Ativa' : 'Inativa'}
                  </span>
                </div>
                <p className="text-gray-400 text-sm leading-relaxed">{c.coupon_description}</p>
              </div>
              {canEdit && (
                <button
                  onClick={() => openEdit(c)}
                  className="text-xs border border-[#2a2a2a] text-gray-400 hover:text-white hover:border-[#00ff87] px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
                >
                  Editar
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              <div className="bg-[#1a1a1a] rounded-lg px-3 py-2">
                <div className="text-gray-500">Desconto</div>
                <div className="text-[#00ff87] font-bold text-base">
                  {c.discount_type === 'fixed' ? formatCurrency(c.discount_value) : `${c.discount_value}%`}
                </div>
              </div>
              <div className="bg-[#1a1a1a] rounded-lg px-3 py-2">
                <div className="text-gray-500">Validade</div>
                <div className="text-white font-bold">{c.validity_days} dias</div>
              </div>
              <div className="bg-[#1a1a1a] rounded-lg px-3 py-2">
                <div className="text-gray-500">Título do cupom</div>
                <div className="text-white truncate">{c.coupon_title}</div>
              </div>
              <div className="bg-[#1a1a1a] rounded-lg px-3 py-2">
                <div className="text-gray-500">Criada em</div>
                <div className="text-white">{formatDate(c.created_at)}</div>
              </div>
            </div>

            {canEdit && excluindoId === c.id && (
              <div className="bg-red-950/30 border border-red-900 rounded-lg p-4 flex flex-col gap-3">
                <div>
                  <p className="text-red-400 font-semibold text-sm">
                    Excluir a campanha &ldquo;{c.name}&rdquo;?
                  </p>
                  <p className="text-gray-400 text-xs mt-1 leading-relaxed">
                    {(c.influencer_count ?? 0) > 0 ? (
                      <>
                        <span className="text-red-300 font-semibold">
                          Os {c.influencer_count} influencers desta campanha serão excluídos junto
                        </span>
                        , e os links deles param de funcionar. Se a campanha já tiver cupons
                        gerados, a exclusão é recusada e nada acontece.
                      </>
                    ) : (
                      <>Esta campanha não tem influencers vinculados. Se já tiver cupons gerados,
                      a exclusão é recusada e nada acontece.</>
                    )}
                    <br />
                    Para encerrar sem perder nada, use <span className="text-gray-300">Desativar</span>.
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleDelete(c)}
                    className="text-xs bg-red-700 text-white font-semibold px-4 py-1.5 rounded-lg hover:bg-red-600 transition-colors"
                  >
                    Sim, excluir
                  </button>
                  <button
                    onClick={() => setExcluindoId(null)}
                    className="text-xs border border-[#2a2a2a] text-gray-400 hover:text-white px-4 py-1.5 rounded-lg transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {canEdit && (
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setExcluindoId(c.id)}
                  className="text-xs px-4 py-1.5 rounded-lg border border-red-900 text-red-400 hover:bg-red-950 transition-colors"
                >
                  Excluir
                </button>
                <button
                  onClick={() => handleToggle(c)}
                  className={`text-xs px-4 py-1.5 rounded-lg transition-colors border ${
                    c.active
                      ? 'border-red-800 text-red-400 hover:bg-red-950'
                      : 'border-[#00ff87]/30 text-[#00ff87] hover:bg-[#00ff87]/10'
                  }`}
                >
                  {c.active ? 'Desativar campanha' : 'Ativar campanha'}
                </button>
              </div>
            )}
          </div>
        ))}

        {initial.length === 0 && (
          <div className="text-center py-16 text-gray-500">Nenhuma campanha. Crie a primeira.</div>
        )}
      </div>
    </>
  )
}
