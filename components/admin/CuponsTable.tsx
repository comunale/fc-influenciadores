'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { formatDate, formatDateTime, formatCurrency } from '@/lib/utils'

type CouponRow = {
  id: string
  coupon_number: string
  customer_name: string
  customer_cpf: string
  customer_phone: string
  customer_email: string
  status: string
  created_at: string
  expires_at: string
  used_at: string | null
  used_by_admin: string | null
  influencers: { id: string; name: string; instagram_handle: string } | null
  campaigns: { name: string; discount_value: number; discount_type: string } | null
}

type Influencer = { id: string; name: string; instagram_handle: string }

const STATUS = {
  pending: { label: 'Pendente', color: 'text-gray-300 bg-[#1e1e1e]' },
  used: { label: 'Usado', color: 'text-[#00ff87] bg-[#00ff87]/10' },
  expired: { label: 'Expirado', color: 'text-red-400 bg-red-950' },
  cancelled: { label: 'Cancelado', color: 'text-red-400 bg-red-950' },
}

export function CuponsTable({
  coupons,
  influencers,
  filters,
}: {
  coupons: CouponRow[]
  influencers: Influencer[]
  filters: Record<string, string | undefined>
}) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  function formatCpf(cpf: string) {
    return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  }

  async function exportXLS() {
    const { utils, writeFile } = await import('xlsx')

    const headers = ['Código', 'Data', 'Cliente', 'CPF', 'Telefone', 'Email', 'Influencer', 'Status', 'Desconto', 'Validade', 'Usado em', 'Validado por']
    const rows = coupons.map((c) => [
      c.coupon_number,
      formatDateTime(c.created_at),
      c.customer_name,
      formatCpf(c.customer_cpf),
      c.customer_phone,
      c.customer_email,
      c.influencers?.instagram_handle ?? '',
      STATUS[c.status as keyof typeof STATUS]?.label ?? c.status,
      c.campaigns ? (c.campaigns.discount_type === 'fixed' ? `R$ ${c.campaigns.discount_value}` : `${c.campaigns.discount_value}%`) : '',
      formatDate(c.expires_at),
      c.used_at ? formatDateTime(c.used_at) : '',
      c.used_by_admin ?? '',
    ])

    const ws = utils.aoa_to_sheet([headers, ...rows])

    // Larguras de coluna
    ws['!cols'] = [14, 18, 24, 16, 16, 28, 18, 12, 12, 14, 18, 20].map((w) => ({ wch: w }))

    const wb = utils.book_new()
    utils.book_append_sheet(wb, ws, 'Cupons')
    writeFile(wb, `cupons-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  return (
    <>
      {/* Cabeçalho */}
      <div className="flex items-center justify-between mb-5 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">Cupons</h1>
          <p className="text-gray-500 text-sm mt-0.5">{coupons.length} resultado{coupons.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={exportXLS}
          className="flex items-center gap-2 text-sm border border-[#2a2a2a] text-gray-300 hover:text-white hover:border-[#00ff87] px-4 py-2 rounded-lg transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Exportar XLS
        </button>
      </div>

      {/* Filtros */}
      <form ref={formRef} className="flex flex-wrap gap-2 mb-5">
        <input
          name="q"
          defaultValue={filters.q}
          placeholder="Buscar por nome, CPF, código, email..."
          className="flex-1 min-w-52 h-10 px-4 rounded-lg border border-[#2a2a2a] bg-[#1e1e1e] text-white text-sm placeholder:text-gray-500 focus:border-[#00ff87] focus:outline-none"
        />
        <select
          name="status"
          defaultValue={filters.status}
          className="h-10 px-3 rounded-lg border border-[#2a2a2a] bg-[#1e1e1e] text-white text-sm focus:border-[#00ff87] focus:outline-none"
        >
          <option value="">Todos os status</option>
          <option value="pending">Pendente</option>
          <option value="used">Usado</option>
          <option value="expired">Expirado</option>
          <option value="cancelled">Cancelado</option>
        </select>
        <select
          name="influencer_id"
          defaultValue={filters.influencer_id}
          className="h-10 px-3 rounded-lg border border-[#2a2a2a] bg-[#1e1e1e] text-white text-sm focus:border-[#00ff87] focus:outline-none"
        >
          <option value="">Todos os influencers</option>
          {influencers.map((i) => (
            <option key={i.id} value={i.id}>{i.instagram_handle}</option>
          ))}
        </select>
        <div className="flex items-center gap-2">
          <input
            name="from"
            type="date"
            defaultValue={filters.from}
            className="h-10 px-3 rounded-lg border border-[#2a2a2a] bg-[#1e1e1e] text-white text-sm focus:border-[#00ff87] focus:outline-none"
          />
          <span className="text-gray-500 text-sm">até</span>
          <input
            name="to"
            type="date"
            defaultValue={filters.to}
            className="h-10 px-3 rounded-lg border border-[#2a2a2a] bg-[#1e1e1e] text-white text-sm focus:border-[#00ff87] focus:outline-none"
          />
        </div>
        <button
          type="submit"
          className="h-10 px-5 bg-[#00ff87] text-black text-sm font-semibold rounded-lg hover:bg-[#00cc6a]"
        >
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

      {/* Tabela */}
      <div className="bg-[#141414] border border-[#1e1e1e] rounded-xl overflow-hidden">
        {coupons.length === 0 ? (
          <div className="py-16 text-center text-gray-500">Nenhum cupom encontrado.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1e1e1e] text-left">
                  {['Código', 'Data', 'Cliente', 'Influencer', 'Status', 'Desconto'].map((h) => (
                    <th key={h} className="px-4 py-3 text-gray-500 font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {coupons.map((c) => {
                  const st = STATUS[c.status as keyof typeof STATUS] ?? STATUS.pending
                  const isExpanded = expanded === c.id
                  return (
                    <>
                      <tr
                        key={c.id}
                        onClick={() => setExpanded(isExpanded ? null : c.id)}
                        className="border-b border-[#1a1a1a] hover:bg-[#1a1a1a] cursor-pointer transition-colors"
                      >
                        <td className="px-4 py-3 font-mono text-[#00ff87] font-bold whitespace-nowrap">{c.coupon_number}</td>
                        <td className="px-4 py-3 text-gray-400 whitespace-nowrap">{formatDate(c.created_at)}</td>
                        <td className="px-4 py-3">
                          <div className="text-white font-medium">{c.customer_name}</div>
                          <div className="text-gray-500 text-xs">{c.customer_email}</div>
                        </td>
                        <td className="px-4 py-3 text-gray-300 whitespace-nowrap">
                          {c.influencers?.instagram_handle ?? '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${st.color}`}>
                            {st.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[#00ff87] font-bold whitespace-nowrap">
                          {c.campaigns
                            ? c.campaigns.discount_type === 'fixed'
                              ? formatCurrency(c.campaigns.discount_value)
                              : `${c.campaigns.discount_value}%`
                            : '—'}
                        </td>
                      </tr>

                      {/* Linha expandida com detalhes completos */}
                      {isExpanded && (
                        <tr key={`${c.id}-detail`} className="bg-[#111111] border-b border-[#1e1e1e]">
                          <td colSpan={6} className="px-4 py-4">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                              <div>
                                <div className="text-gray-500 mb-0.5">CPF</div>
                                <div className="text-white font-mono">{formatCpf(c.customer_cpf)}</div>
                              </div>
                              <div>
                                <div className="text-gray-500 mb-0.5">Telefone</div>
                                <div className="text-white">{c.customer_phone}</div>
                              </div>
                              <div>
                                <div className="text-gray-500 mb-0.5">Válido até</div>
                                <div className="text-white">{formatDate(c.expires_at)}</div>
                              </div>
                              <div>
                                <div className="text-gray-500 mb-0.5">Influencer</div>
                                <div className="text-white">{c.influencers?.name ?? '—'}</div>
                              </div>
                              {c.used_at && (
                                <div>
                                  <div className="text-gray-500 mb-0.5">Usado em</div>
                                  <div className="text-white">{formatDateTime(c.used_at)}</div>
                                </div>
                              )}
                              {c.used_by_admin && (
                                <div>
                                  <div className="text-gray-500 mb-0.5">Validado por</div>
                                  <div className="text-white">{c.used_by_admin}</div>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
