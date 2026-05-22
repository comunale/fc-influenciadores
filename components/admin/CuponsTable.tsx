'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
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
  pending:   { label: 'Pendente',   color: 'text-gray-300 bg-[#1e1e1e]' },
  used:      { label: 'Usado',      color: 'text-[#00ff87] bg-[#00ff87]/10' },
  expired:   { label: 'Expirado',   color: 'text-red-400 bg-red-950' },
  cancelled: { label: 'Cancelado',  color: 'text-red-400 bg-red-950' },
}

interface EditForm {
  status: string
  customer_name: string
  customer_email: string
  customer_phone: string
  customer_cpf: string
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

  const [expanded, setExpanded]   = useState<string | null>(null)
  const [selected, setSelected]   = useState<Set<string>>(new Set())
  const [deleting, setDeleting]   = useState(false)
  const [editing, setEditing]     = useState<CouponRow | null>(null)
  const [editForm, setEditForm]   = useState<EditForm | null>(null)
  const [saving, setSaving]       = useState(false)

  function formatCpf(cpf: string) {
    return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  }

  // ── seleção ─────────────────────────────────────────────────────────────────

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (selected.size === coupons.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(coupons.map((c) => c.id)))
    }
  }

  // ── exclusão ─────────────────────────────────────────────────────────────────

  async function deleteCoupons(ids: string[]) {
    if (ids.length === 0) return
    setDeleting(true)
    try {
      const res = await fetch('/api/admin/coupons', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Erro ao excluir.'); return }
      toast.success(`${ids.length} cupom(ns) excluído(s).`)
      setSelected(new Set())
      setExpanded(null)
      router.refresh()
    } catch {
      toast.error('Erro de conexão.')
    } finally {
      setDeleting(false)
    }
  }

  function confirmDelete(ids: string[], label: string) {
    if (!window.confirm(`Excluir ${label}? Esta ação não pode ser desfeita.`)) return
    deleteCoupons(ids)
  }

  // ── edição ────────────────────────────────────────────────────────────────────

  function openEdit(c: CouponRow) {
    setEditing(c)
    setEditForm({
      status:         c.status,
      customer_name:  c.customer_name,
      customer_email: c.customer_email,
      customer_phone: c.customer_phone,
      customer_cpf:   c.customer_cpf,
    })
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editing || !editForm) return
    setSaving(true)
    try {
      const res = await fetch('/api/admin/coupons', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editing.id, ...editForm }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Erro ao salvar.'); return }
      toast.success('Cupom atualizado.')
      setEditing(null)
      setEditForm(null)
      router.refresh()
    } catch {
      toast.error('Erro de conexão.')
    } finally {
      setSaving(false)
    }
  }

  // ── exportar XLS ──────────────────────────────────────────────────────────────

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
    ws['!cols'] = [14, 18, 24, 16, 16, 28, 18, 12, 12, 14, 18, 20].map((w) => ({ wch: w }))
    const wb = utils.book_new()
    utils.book_append_sheet(wb, ws, 'Cupons')
    writeFile(wb, `cupons-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  // ── render ────────────────────────────────────────────────────────────────────

  const allSelected = coupons.length > 0 && selected.size === coupons.length
  const someSelected = selected.size > 0

  return (
    <>
      {/* Cabeçalho */}
      <div className="flex items-center justify-between mb-5 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">Cupons</h1>
          <p className="text-gray-500 text-sm mt-0.5">{coupons.length} resultado{coupons.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          {someSelected && (
            <button
              onClick={() => confirmDelete(Array.from(selected), `${selected.size} cupom(ns) selecionado(s)`)}
              disabled={deleting}
              className="flex items-center gap-2 text-sm border border-red-800 text-red-400 hover:bg-red-950 px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Excluir {selected.size} selecionado{selected.size !== 1 ? 's' : ''}
            </button>
          )}
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
      </div>

      {/* Filtros */}
      <form ref={formRef} className="flex flex-wrap gap-2 mb-5">
        <input
          name="q"
          defaultValue={filters.q}
          placeholder="Buscar por nome, CPF, código, email..."
          className="flex-1 min-w-52 h-10 px-4 rounded-lg border border-[#2a2a2a] bg-[#1e1e1e] text-white text-sm placeholder:text-gray-500 focus:border-[#00ff87] focus:outline-none"
        />
        <select name="status" defaultValue={filters.status}
          className="h-10 px-3 rounded-lg border border-[#2a2a2a] bg-[#1e1e1e] text-white text-sm focus:border-[#00ff87] focus:outline-none">
          <option value="">Todos os status</option>
          <option value="pending">Pendente</option>
          <option value="used">Usado</option>
          <option value="expired">Expirado</option>
          <option value="cancelled">Cancelado</option>
        </select>
        <select name="influencer_id" defaultValue={filters.influencer_id}
          className="h-10 px-3 rounded-lg border border-[#2a2a2a] bg-[#1e1e1e] text-white text-sm focus:border-[#00ff87] focus:outline-none">
          <option value="">Todos os influencers</option>
          {influencers.map((i) => (
            <option key={i.id} value={i.id}>{i.instagram_handle}</option>
          ))}
        </select>
        <div className="flex items-center gap-2">
          <input name="from" type="date" defaultValue={filters.from}
            className="h-10 px-3 rounded-lg border border-[#2a2a2a] bg-[#1e1e1e] text-white text-sm focus:border-[#00ff87] focus:outline-none" />
          <span className="text-gray-500 text-sm">até</span>
          <input name="to" type="date" defaultValue={filters.to}
            className="h-10 px-3 rounded-lg border border-[#2a2a2a] bg-[#1e1e1e] text-white text-sm focus:border-[#00ff87] focus:outline-none" />
        </div>
        <button type="submit" className="h-10 px-5 bg-[#00ff87] text-black text-sm font-semibold rounded-lg hover:bg-[#00cc6a]">
          Filtrar
        </button>
        {Object.values(filters).some(Boolean) && (
          <button type="button"
            onClick={() => { formRef.current?.reset(); router.push('/admin/cupons') }}
            className="h-10 px-4 border border-[#2a2a2a] text-gray-400 hover:text-white text-sm rounded-lg transition-colors">
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
                  {/* Checkbox select-all */}
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      className="accent-[#00ff87] w-4 h-4 cursor-pointer"
                    />
                  </th>
                  {['Código', 'Data', 'Cliente', 'Influencer', 'Status', 'Desconto', ''].map((h) => (
                    <th key={h} className="px-4 py-3 text-gray-500 font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {coupons.map((c) => {
                  const st = STATUS[c.status as keyof typeof STATUS] ?? STATUS.pending
                  const isExpanded = expanded === c.id
                  const isChecked = selected.has(c.id)

                  return (
                    <>
                      <tr
                        key={c.id}
                        className={`border-b border-[#1a1a1a] hover:bg-[#1a1a1a] transition-colors ${isChecked ? 'bg-[#1a1a1a]' : ''}`}
                      >
                        {/* Checkbox individual */}
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleOne(c.id)}
                            className="accent-[#00ff87] w-4 h-4 cursor-pointer"
                          />
                        </td>
                        <td
                          className="px-4 py-3 font-mono text-[#00ff87] font-bold whitespace-nowrap cursor-pointer"
                          onClick={() => setExpanded(isExpanded ? null : c.id)}
                        >{c.coupon_number}</td>
                        <td className="px-4 py-3 text-gray-400 whitespace-nowrap cursor-pointer"
                          onClick={() => setExpanded(isExpanded ? null : c.id)}
                        >{formatDate(c.created_at)}</td>
                        <td className="px-4 py-3 cursor-pointer"
                          onClick={() => setExpanded(isExpanded ? null : c.id)}
                        >
                          <div className="text-white font-medium">{c.customer_name}</div>
                          <div className="text-gray-500 text-xs">{c.customer_email}</div>
                        </td>
                        <td className="px-4 py-3 text-gray-300 whitespace-nowrap cursor-pointer"
                          onClick={() => setExpanded(isExpanded ? null : c.id)}
                        >{c.influencers?.instagram_handle ?? '—'}</td>
                        <td className="px-4 py-3 cursor-pointer"
                          onClick={() => setExpanded(isExpanded ? null : c.id)}
                        >
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${st.color}`}>
                            {st.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[#00ff87] font-bold whitespace-nowrap cursor-pointer"
                          onClick={() => setExpanded(isExpanded ? null : c.id)}
                        >
                          {c.campaigns
                            ? c.campaigns.discount_type === 'fixed'
                              ? formatCurrency(c.campaigns.discount_value)
                              : `${c.campaigns.discount_value}%`
                            : '—'}
                        </td>
                        {/* Ações rápidas */}
                        <td className="px-3 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <div className="flex gap-1">
                            <button
                              onClick={() => openEdit(c)}
                              className="text-xs px-2.5 py-1 rounded-md border border-[#2a2a2a] text-gray-400 hover:text-white hover:border-[#00ff87] transition-colors"
                            >
                              Editar
                            </button>
                            <button
                              onClick={() => confirmDelete([c.id], `o cupom ${c.coupon_number}`)}
                              disabled={deleting}
                              className="text-xs px-2.5 py-1 rounded-md border border-red-900 text-red-400 hover:bg-red-950 transition-colors disabled:opacity-50"
                            >
                              Excluir
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Linha expandida com detalhes */}
                      {isExpanded && (
                        <tr key={`${c.id}-detail`} className="bg-[#111111] border-b border-[#1e1e1e]">
                          <td colSpan={8} className="px-4 py-4">
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

      {/* Modal de edição */}
      {editing && editForm && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-4 bg-black/70">
          <div className="bg-[#141414] border border-[#1e1e1e] rounded-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#1e1e1e]">
              <div>
                <h2 className="text-white font-semibold text-lg">Editar Cupom</h2>
                <p className="text-gray-500 text-xs font-mono mt-0.5">{editing.coupon_number}</p>
              </div>
              <button onClick={() => setEditing(null)} className="text-gray-500 hover:text-white text-xl">✕</button>
            </div>

            <form onSubmit={handleSaveEdit} className="p-6 flex flex-col gap-4">
              {/* Status */}
              <div>
                <label className="text-sm text-gray-300 block mb-1.5">Status</label>
                <select
                  value={editForm.status}
                  onChange={(e) => setEditForm((p) => p ? { ...p, status: e.target.value } : p)}
                  className="w-full h-11 px-4 rounded-lg border border-[#2a2a2a] bg-[#1e1e1e] text-white text-sm focus:border-[#00ff87] focus:outline-none"
                  disabled={saving}
                >
                  <option value="pending">Pendente</option>
                  <option value="used">Usado</option>
                  <option value="expired">Expirado</option>
                  <option value="cancelled">Cancelado</option>
                </select>
              </div>

              {/* Cliente */}
              <div>
                <label className="text-sm text-gray-300 block mb-1.5">Nome do cliente</label>
                <input
                  type="text"
                  value={editForm.customer_name}
                  onChange={(e) => setEditForm((p) => p ? { ...p, customer_name: e.target.value } : p)}
                  className="w-full h-11 px-4 rounded-lg border border-[#2a2a2a] bg-[#1e1e1e] text-white text-sm focus:border-[#00ff87] focus:outline-none"
                  disabled={saving}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm text-gray-300 block mb-1.5">Telefone</label>
                  <input
                    type="text"
                    value={editForm.customer_phone}
                    onChange={(e) => setEditForm((p) => p ? { ...p, customer_phone: e.target.value } : p)}
                    className="w-full h-11 px-4 rounded-lg border border-[#2a2a2a] bg-[#1e1e1e] text-white text-sm focus:border-[#00ff87] focus:outline-none"
                    disabled={saving}
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-300 block mb-1.5">CPF</label>
                  <input
                    type="text"
                    value={editForm.customer_cpf}
                    onChange={(e) => setEditForm((p) => p ? { ...p, customer_cpf: e.target.value.replace(/\D/g, '') } : p)}
                    maxLength={11}
                    className="w-full h-11 px-4 rounded-lg border border-[#2a2a2a] bg-[#1e1e1e] text-white text-sm font-mono focus:border-[#00ff87] focus:outline-none"
                    disabled={saving}
                  />
                </div>
              </div>

              <div>
                <label className="text-sm text-gray-300 block mb-1.5">E-mail</label>
                <input
                  type="email"
                  value={editForm.customer_email}
                  onChange={(e) => setEditForm((p) => p ? { ...p, customer_email: e.target.value } : p)}
                  className="w-full h-11 px-4 rounded-lg border border-[#2a2a2a] bg-[#1e1e1e] text-white text-sm focus:border-[#00ff87] focus:outline-none"
                  disabled={saving}
                />
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 h-11 bg-[#00ff87] text-black font-semibold rounded-lg hover:bg-[#00e67a] disabled:opacity-60 transition-colors"
                >
                  {saving ? 'Salvando...' : 'Salvar alterações'}
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  disabled={saving}
                  className="px-5 h-11 border border-[#2a2a2a] text-gray-400 hover:text-white rounded-lg transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
