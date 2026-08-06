'use client'

import type { Seller } from './SellerManagement'

// O vendedor escolhe o próprio nome, sem senha e sem PIN — decisão do César
// por velocidade no balcão. É rastro, não prova: nada impede escolher o nome
// de um colega. Serve para revelar padrão.
export function SellerSelect({
  sellers,
  value,
  onChange,
  disabled,
  showStore,
}: {
  sellers: Seller[]
  value: string
  onChange: (id: string) => void
  disabled?: boolean
  showStore?: boolean
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-gray-300">Quem está atendendo? *</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || sellers.length === 0}
        required
        className="h-14 w-full rounded-xl border border-[#2a2a2a] bg-[#1e1e1e] px-4 text-white text-base focus:border-[#00ff87] focus:outline-none focus:ring-1 focus:ring-[#00ff87] disabled:opacity-50"
      >
        <option value="">Selecione o vendedor…</option>
        {sellers.map((s) => (
          <option key={s.id} value={s.id}>
            {showStore ? `${s.name} — ${s.store_name}` : s.name}
          </option>
        ))}
      </select>
      {sellers.length === 0 && (
        <p className="text-red-400 text-xs">
          Nenhum vendedor cadastrado para esta loja. Peça ao administrador para cadastrar
          em Configurações → Vendedores.
        </p>
      )}
    </div>
  )
}
