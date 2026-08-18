'use client'

import { useRef } from 'react'
import { useRouter } from 'next/navigation'
import { type InfluencerOption } from './types'

const INPUT = 'h-10 px-3 rounded-lg border border-[#2a2a2a] bg-[#1e1e1e] text-white text-sm focus:border-[#00ff87] focus:outline-none'

export function CuponsFilters({
  influencers,
  filters,
}: {
  influencers: InfluencerOption[]
  filters: Record<string, string | undefined>
}) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)

  return (
    <form ref={formRef} className="flex flex-wrap gap-2 mb-5">
      <input
        name="q"
        defaultValue={filters.q}
        placeholder="Buscar por nome, CPF, código, email, NF..."
        className={`${INPUT} flex-1 min-w-52 px-4 placeholder:text-gray-500`}
      />

      <select name="status" defaultValue={filters.status} className={INPUT}>
        <option value="">Todos os status</option>
        <option value="pending">Pendente</option>
        <option value="used">Usado</option>
        <option value="expired">Expirado</option>
        <option value="cancelled">Cancelado</option>
      </select>

      <select name="influencer_id" defaultValue={filters.influencer_id} className={INPUT}>
        <option value="">Todos os influencers</option>
        {influencers.map((i) => (
          <option key={i.id} value={i.id}>{i.instagram_handle}</option>
        ))}
      </select>

      {/* Filtros de conferencia: e como o Financeiro acha o que falta fazer. */}
      <select name="conferencia" defaultValue={filters.conferencia} className={INPUT}>
        <option value="">Conferência: todas</option>
        <option value="pendente">A conferir</option>
        <option value="conferido">Conferidos</option>
        <option value="a_pagar">Conferidos e não pagos</option>
        <option value="pago">Pagos</option>
      </select>

      <div className="flex items-center gap-2">
        <input name="from" type="date" defaultValue={filters.from} className={INPUT} />
        <span className="text-gray-500 text-sm">até</span>
        <input name="to" type="date" defaultValue={filters.to} className={INPUT} />
      </div>

      <button type="submit" className="h-10 px-5 bg-[#00ff87] text-black text-sm font-semibold rounded-lg hover:bg-[#00cc6a]">
        Filtrar
      </button>

      {Object.values(filters).some(Boolean) && (
        <button
          type="button"
          onClick={() => { formRef.current?.reset(); router.push('/admin/cupons') }}
          className="h-10 px-4 border border-[#2a2a2a] text-gray-400 hover:text-white text-sm rounded-lg transition-colors"
        >
          Limpar
        </button>
      )}
    </form>
  )
}
