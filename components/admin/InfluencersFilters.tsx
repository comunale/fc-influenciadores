'use client'

import { useRef } from 'react'
import { useRouter } from 'next/navigation'

const CAMPO = 'h-10 px-3 rounded-lg border border-[#2a2a2a] bg-[#1e1e1e] text-white text-sm focus:border-[#00ff87] focus:outline-none'

export function InfluencersFilters({
  campaigns,
  filters,
  total,
  mostrando,
}: {
  campaigns: { id: string; name: string }[]
  filters: Record<string, string | undefined>
  total: number
  mostrando: number
}) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const temFiltro = Object.values(filters).some(Boolean)

  return (
    <form ref={formRef} className="flex flex-wrap gap-2 mb-4 items-center">
      <input
        name="q"
        defaultValue={filters.q}
        placeholder="Buscar por nome, @ ou código..."
        className={`${CAMPO} flex-1 min-w-52 px-4 placeholder:text-gray-500`}
      />

      {/* Usa a mesma regra que decide se o link abre — ver lib/influencer-status.ts */}
      <select name="estado" defaultValue={filters.estado} className={CAMPO}>
        <option value="">Todos os estados</option>
        <option value="ativo">Ativos</option>
        <option value="inativo">Inativos</option>
        <option value="encerrada">Parceria encerrada</option>
      </select>

      <select name="campaign_id" defaultValue={filters.campaign_id} className={CAMPO}>
        <option value="">Todas as campanhas</option>
        {campaigns.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>

      {/* A pergunta do Financeiro: de quem eu ainda devo? */}
      <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer px-2">
        <input
          type="checkbox"
          name="a_pagar"
          value="1"
          defaultChecked={filters.a_pagar === '1'}
          className="accent-[#00ff87] w-4 h-4"
        />
        Só com comissão a pagar
      </label>

      <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer px-2">
        <input
          type="checkbox"
          name="vencendo"
          value="1"
          defaultChecked={filters.vencendo === '1'}
          className="accent-[#00ff87] w-4 h-4"
        />
        Vencendo em 30 dias
      </label>

      <button type="submit" className="h-10 px-5 bg-[#00ff87] text-black text-sm font-semibold rounded-lg hover:bg-[#00cc6a]">
        Filtrar
      </button>

      {temFiltro && (
        <button
          type="button"
          onClick={() => { formRef.current?.reset(); router.push('/admin/influencers') }}
          className="h-10 px-4 border border-[#2a2a2a] text-gray-400 hover:text-white text-sm rounded-lg transition-colors"
        >
          Limpar
        </button>
      )}

      <span className="text-xs text-gray-500 ml-auto">
        {temFiltro ? `${mostrando} de ${total}` : `${total} influencer${total !== 1 ? 's' : ''}`}
      </span>
    </form>
  )
}
