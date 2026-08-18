'use client'

import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

/**
 * Formulario de criar e editar influencer.
 *
 * Desde 18/08/2026 ele carrega os TERMOS (desconto, validade, textos), que
 * desceram da campanha para o influencer. A campanha virou modelo: escolher uma
 * preenche os campos, mas eles passam a ser deste influencer.
 */
export type InfluencerFormState = {
  campaign_id: string
  name: string
  instagram_handle: string
  coupon_code: string
  fee_amount: string
  commission_per_sale: string
  commission_starts_at: string
  active: boolean
  discount_type: string
  discount_value: string
  validity_days: string
  coupon_title: string
  coupon_description: string
}

export type CampanhaModelo = {
  id: string
  name: string
  discount_type: string
  discount_value: number
  validity_days: number
  coupon_title: string
  coupon_description: string
}

export function InfluencerForm({
  editando,
  form,
  setForm,
  campaigns,
  loading,
  onSalvar,
  onFechar,
  onHandleChange,
}: {
  editando: boolean
  form: InfluencerFormState
  setForm: React.Dispatch<React.SetStateAction<InfluencerFormState>>
  campaigns: CampanhaModelo[]
  loading: boolean
  onSalvar: (e: React.FormEvent) => void
  onFechar: () => void
  onHandleChange: (v: string) => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-4 bg-black/60">
      <div className="bg-[#141414] border border-[#1e1e1e] rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1e1e1e]">
          <h2 className="text-white font-semibold text-lg">
            {editando ? 'Editar Influencer' : 'Novo Influencer'}
          </h2>
          <button onClick={onFechar} className="text-gray-500 hover:text-white text-xl">✕</button>
        </div>

        <form onSubmit={onSalvar} className="p-6 flex flex-col gap-4">
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
            onChange={(e) => onHandleChange(e.target.value)}
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

          {editando && (
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={form.active}
                onChange={(e) => setForm((p) => ({ ...p, active: e.target.checked }))}
                className="accent-[#00ff87] w-4 h-4" />
              <span className="text-sm text-gray-300">Ativo</span>
            </label>
          )}

          <div className="flex gap-3 pt-2">
            <Button type="submit" loading={loading} className="flex-1">
              {editando ? 'Salvar alterações' : 'Criar Influencer'}
            </Button>
            <Button type="button" variant="outline" onClick={onFechar} disabled={loading}>
              Cancelar
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
