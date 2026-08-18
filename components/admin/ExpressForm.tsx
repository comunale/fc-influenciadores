'use client'

import { Button } from '@/components/ui/button'
import { formatCPF, formatPhone } from '@/lib/validators/cpf'
import { SellerSelect } from './SellerSelect'
import type { Seller } from './SellerManagement'

/**
 * Cadastro express no balcão — só admin, como saída de emergência.
 *
 * O Lojista perdeu este formulário em 18/08/2026 e passou a ver o QR do
 * influenciador: era este caminho que permitia criar um cliente sozinho, em
 * vinte segundos, sem nenhuma evidência de que a indicação existiu.
 *
 * Fica para o caso do cliente estar sem celular, sem bateria ou sem internet —
 * exceção que exige uma ligação para o admin, e esse atrito é intencional.
 */
export function ExpressForm({
  influencer, form, setForm, sellers, sellerId, setSellerId,
  showStore, erro, saving, onSubmit, onVoltar, descontoLabel, validityDays,
}: {
  influencer: { instagram_handle: string; coupon_code: string; name: string }
  form: { name: string; cpf: string; phone: string; email: string }
  setForm: React.Dispatch<React.SetStateAction<{ name: string; cpf: string; phone: string; email: string }>>
  sellers: Seller[]
  sellerId: string
  setSellerId: (v: string) => void
  showStore: boolean
  erro: string
  saving: boolean
  onSubmit: (e: React.FormEvent) => void
  onVoltar: () => void
  descontoLabel: string
  validityDays: number
}) {
  return (
        <div className="flex flex-col gap-4">
          {/* Card do influencer */}
          <div className="bg-[#141414] border border-[#00ff87]/30 rounded-xl p-5">
            <div className="text-xs text-[#00ff87] font-bold uppercase tracking-wider mb-2">
              Cadastro Rápido — Indicado por
            </div>
            <div className="text-white font-bold text-xl">
              @{influencer.instagram_handle || influencer.coupon_code.toLowerCase()}
            </div>
            {influencer.name && (
              <div className="text-gray-400 text-sm mt-0.5">{influencer.name}</div>
            )}
            <div className="mt-4 pt-3 border-t border-[#2a2a2a] flex gap-8">
              <div>
                <div className="text-xs text-gray-500">Desconto</div>
                <div className="text-[#00ff87] font-black text-2xl">
                  {descontoLabel}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Validade do cupom</div>
                <div className="text-white font-semibold">{validityDays} dias</div>
              </div>
            </div>
          </div>

          {/* Formulário */}
          <form onSubmit={onSubmit} className="flex flex-col gap-3">
            <h3 className="text-white font-semibold text-sm uppercase tracking-wider">Dados do cliente</h3>

            <input
              type="text"
              placeholder="Nome completo *"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              required
              disabled={saving}
              className="h-14 w-full rounded-xl border border-[#2a2a2a] bg-[#1e1e1e] px-4 text-white placeholder:text-gray-600 focus:border-[#00ff87] focus:outline-none focus:ring-1 focus:ring-[#00ff87] text-base"
            />
            <input
              type="text"
              inputMode="numeric"
              placeholder="CPF * (000.000.000-00)"
              value={form.cpf}
              onChange={(e) => setForm((p) => ({ ...p, cpf: formatCPF(e.target.value) }))}
              required
              disabled={saving}
              maxLength={14}
              className="h-14 w-full rounded-xl border border-[#2a2a2a] bg-[#1e1e1e] px-4 text-white placeholder:text-gray-600 focus:border-[#00ff87] focus:outline-none focus:ring-1 focus:ring-[#00ff87] text-base font-mono"
            />
            <input
              type="tel"
              placeholder="Telefone * (com DDD)"
              value={form.phone}
              onChange={(e) => setForm((p) => ({ ...p, phone: formatPhone(e.target.value) }))}
              required
              disabled={saving}
              className="h-14 w-full rounded-xl border border-[#2a2a2a] bg-[#1e1e1e] px-4 text-white placeholder:text-gray-600 focus:border-[#00ff87] focus:outline-none focus:ring-1 focus:ring-[#00ff87] text-base"
            />
            <input
              type="email"
              placeholder="E-mail *"
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              required
              disabled={saving}
              className="h-14 w-full rounded-xl border border-[#2a2a2a] bg-[#1e1e1e] px-4 text-white placeholder:text-gray-600 focus:border-[#00ff87] focus:outline-none focus:ring-1 focus:ring-[#00ff87] text-base"
            />

            <SellerSelect sellers={sellers} value={sellerId} onChange={setSellerId}
              disabled={saving} showStore={showStore} />

            {erro && (
              <div className="bg-red-950 border border-red-800 rounded-xl p-3 text-red-400 text-sm text-center">
                {erro}
              </div>
            )}

            <Button
              type="submit"
              size="xl"
              loading={saving}
              disabled={!sellerId}
              className="w-full font-black text-black text-lg rounded-2xl mt-1 disabled:opacity-40"
              style={{ minHeight: '72px' }}
            >
              {saving ? 'Cadastrando...' : '✓ CADASTRAR E VALIDAR CUPOM'}
            </Button>
          </form>

          <button
            onClick={onVoltar}
            className="text-gray-500 text-sm text-center hover:text-gray-300 transition-colors py-2"
          >
            ← Buscar outro
          </button>
        </div>
  )
}