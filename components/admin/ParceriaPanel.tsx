'use client'

import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

/**
 * Painel de Prorrogar e Renovar parceria.
 *
 * PRORROGAR mantém a negociação e só estende o prazo.
 * RENOVAR muda a negociação a partir de agora.
 *
 * Em nenhuma das duas o link muda — era o requisito que derrubou a alternativa
 * de criar campanha nova a cada renovação, já que o link está na bio e no story
 * do influenciador.
 */
export type ParceriaForm = {
  ends_at: string
  discount_value: string
  validity_days: string
  commission_per_sale: string
  commission_starts_at: string
  zerar_contagem: boolean
}

export function ParceriaPanel({
  parceria,
  form,
  setForm,
  loading,
  onSalvar,
  onFechar,
}: {
  parceria: { inf: { instagram_handle: string }; acao: 'prorrogar' | 'renovar' } | null
  form: ParceriaForm
  setForm: React.Dispatch<React.SetStateAction<ParceriaForm>>
  loading: boolean
  onSalvar: () => void
  onFechar: () => void
}) {
  if (!parceria) return null
  const renovando = parceria.acao === 'renovar'

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-4 bg-black/70">
      <div className="bg-[#141414] border border-[#1e1e1e] rounded-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1e1e1e]">
          <div>
            <h2 className="text-white font-semibold text-lg">
              {renovando ? 'Renovar parceria' : 'Prorrogar parceria'}
            </h2>
            <p className="text-gray-500 text-xs mt-0.5">{parceria.inf.instagram_handle}</p>
          </div>
          <button onClick={onFechar} className="text-gray-500 hover:text-white text-xl">✕</button>
        </div>

        <div className="p-6 flex flex-col gap-4">
          <p className="text-xs text-gray-500">
            {renovando
              ? 'Muda a negociação a partir de agora. O link não muda, e os cupons já gerados mantêm os valores antigos.'
              : 'Mantém a negociação atual e só estende o prazo. O link não muda.'}
          </p>

          <Input
            label="Parceria até (vazio = sem prazo)"
            type="date"
            value={form.ends_at}
            onChange={(e) => setForm((p) => ({ ...p, ends_at: e.target.value }))}
            disabled={loading}
          />

          {renovando && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Desconto" type="number" value={form.discount_value}
                  onChange={(e) => setForm((p) => ({ ...p, discount_value: e.target.value }))}
                  disabled={loading} />
                <Input label="Validade (dias)" type="number" value={form.validity_days}
                  onChange={(e) => setForm((p) => ({ ...p, validity_days: e.target.value }))}
                  disabled={loading} />
                <Input label="Comissão por venda" type="number" value={form.commission_per_sale}
                  onChange={(e) => setForm((p) => ({ ...p, commission_per_sale: e.target.value }))}
                  disabled={loading} />
                <Input label="A partir da venda nº" type="number" value={form.commission_starts_at}
                  onChange={(e) => setForm((p) => ({ ...p, commission_starts_at: e.target.value }))}
                  disabled={loading} />
              </div>

              {/* Zerar ou não a contagem depende do que foi combinado caso a caso.
                  Por isso é escolha aqui, e não regra fixa no código. */}
              <label className="flex items-start gap-2 text-sm text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.zerar_contagem}
                  onChange={(e) => setForm((p) => ({ ...p, zerar_contagem: e.target.checked }))}
                  className="accent-[#00ff87] w-4 h-4 mt-0.5"
                  disabled={loading}
                />
                <span>
                  Recomeçar a contagem de vendas
                  <span className="block text-xs text-gray-500">
                    Marcando, a próxima venda volta a ser a nº 1 do acordo novo.
                    Desmarcado, a contagem continua da parceria inteira.
                  </span>
                </span>
              </label>
            </>
          )}

          <div className="flex gap-3 pt-1">
            <Button onClick={onSalvar} loading={loading} className="flex-1">
              {renovando ? 'Renovar' : 'Prorrogar'}
            </Button>
            <Button variant="outline" onClick={onFechar} disabled={loading}>
              Cancelar
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
