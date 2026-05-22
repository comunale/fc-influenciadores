'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { formatDate, formatDateTime } from '@/lib/utils'

type Row = {
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
  pending:   { label: 'Pendente',  color: 'text-gray-300 bg-[#1e1e1e]' },
  used:      { label: 'Usado',     color: 'text-[#00ff87] bg-[#00ff87]/10' },
  expired:   { label: 'Expirado',  color: 'text-red-400 bg-red-950' },
  cancelled: { label: 'Cancelado', color: 'text-red-400 bg-red-950' },
}

interface EditForm {
  status: string
  customer_name: string
  customer_email: string
  customer_phone: string
  customer_cpf: string
}

export function ParticipantesTable({
  rows,
  influencers,
  filters,
}: {
  rows: Row[]
  influencers: Influencer[]
  filters: Record<string, string | undefined>
}) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)
  const [editing, setEditing]   = useState<Row | null>(null)
  const [editForm, setEditForm] = useState<EditForm | null>(null)
  const [saving, setSaving]     = useState(false)

  function formatCpf(cpf: string) {
    return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  }

  // ── seleção ──────────────────────────────────────────────────────────────────

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected(selected.size === rows.length ? new Set() : new Set(rows.map((r) => r.id)))
  }

  // ── exclusão ──────────────────────────────────────────────────────────────────

  async function deleteRows(ids: string[]) {
    if (!ids.length) return
    setDeleting(true)
    try {
      const res = await fetch('/api/admin/coupons', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Erro ao excluir.'); return }
      toast.success(`${ids.length} participante(s) excluído(s).`)
      setSelected(new Set())
      router.refresh()
    } catch {
      toast.error('Erro de conexão.')
    } finally {
      setDeleting(false)
    }
  }

  function confirmDelete(ids: string[], label: string) {
    if (!window.confirm(`Excluir ${label}? Esta ação não pode ser desfeita.`)) return
    deleteRows(ids)
  }

  // ── edição ────────────────────────────────────────────────────────────────────

  function openEdit(r: Row) {
    setEditing(r)
    setEditForm({
      status:         r.status,
      customer_name:  r.customer_name,
      customer_email: r.customer_email,
      customer_phone: r.customer_phone,
      customer_cpf:   r.customer_cpf,
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
      toast.success('Participante atualizado.')
      setEditing(null)
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

    const headers = ['Nome', 'CPF', 'Telefone', 'E-mail', 'Influencer', 'Código cupom', 'Status', 'Cadastrado em', 'Válido até', 'Usado em']
    const data = rows.map((r) => [
      r.customer_name,
      formatCpf(r.customer_cpf),
      r.customer_phone,
      r.customer_email,
      r.influencers?.instagram_handle ?? '',
      r.coupon_number,
      STATUS[r.status as keyof typeof STATUS]?.label ?? r.status,
      formatDateTime(r.created_at),
      formatDate(r.expires_at),
      r.used_at ? formatDateTime(r.used_at) : '',
    ])

    const ws = utils.aoa_to_sheet([headers, ...data])

    // Larguras de coluna
    ws['!cols'] = [28, 16, 16, 32, 20, 14, 12, 20, 14, 20].map((w) => ({ wch: w }))

    // Cabeçalho fixo (freeze primeira linha)
    ws['!freeze'] = { xSplit: 0, ySplit: 1 }

    // Filtro automático
    ws['!autofilter'] = { ref: ws['!ref'] ?? 'A1' }

    const wb = utils.book_new()
    utils.book_append_sheet(wb, ws, 'Participantes')
    writeFile(wb, `participantes-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  // ── render ────────────────────────────────────────────────────────────────────

  const allSelected = rows.length > 0 && selected.size === rows.length

  return (
    <>
      {/* Cabeçalho */}
      <div className="flex items-center justify-between mb-5 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">Participantes</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {rows.length} cadastro{rows.length !== 1 ? 's' : ''} — dados de quem gerou cupom
          </p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          {selected.size > 0 && (
            <button
              onClick={() => confirmDelete(Array.from(selected), `${selected.size} participante(s) selecionado(s)`)}
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
          placeholder="Buscar por nome, CPF, email, telefone..."
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
        <button type="submit" className="h-10 px-5 bg-[#00ff87] text-black text-sm font-semibold rounded-lg hover:bg-[#00cc6a]">
          Filtrar
        </button>
        {Object.values(filters).some(Boolean) && (
          <button type="button"
            onClick={() => { formRef.current?.reset(); router.push('/admin/participantes') }}
            className="h-10 px-4 border border-[#2a2a2a] text-gray-400 hover:text-white text-sm rounded-lg transition-colors">
            Limpar
          </button>
        )}
      </form>

      {/* Tabela */}
      <div className="bg-[#141414] border border-[#1e1e1e] rounded-xl overflow-hidden">
        {rows.length === 0 ? (
          <div className="py-16 text-center text-gray-500">Nenhum participante encontrado.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1e1e1e] text-left">
                  <th className="px-4 py-3 w-10">
                    <input type="checkbox" checked={allSelected} onChange={toggleAll}
                      className="accent-[#00ff87] w-4 h-4 cursor-pointer" />
                  </th>
                  {['Nome', 'CPF', 'Telefone', 'E-mail', 'Influencer', 'Cupom', 'Status', 'Cadastro', ''].map((h) => (
                    <th key={h} className="px-4 py-3 text-gray-500 font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const st = STATUS[r.status as keyof typeof STATUS] ?? STATUS.pending
                  const isChecked = selected.has(r.id)
                  return (
                    <tr key={r.id} className={`border-b border-[#1a1a1a] hover:bg-[#1a1a1a] transition-colors ${isChecked ? 'bg-[#1a1a1a]' : ''}`}>
                      <td className="px-4 py-3">
                        <input type="checkbox" checked={isChecked} onChange={() => toggleOne(r.id)}
                          className="accent-[#00ff87] w-4 h-4 cursor-pointer" />
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-white font-medium">{r.customer_name}</div>
                      </td>
                      <td className="px-4 py-3 font-mono text-gray-300 whitespace-nowrap text-xs">
                        {formatCpf(r.customer_cpf)}
                      </td>
                      <td className="px-4 py-3 text-gray-300 whitespace-nowrap">{r.customer_phone}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{r.customer_email}</td>
                      <td className="px-4 py-3 text-gray-300 whitespace-nowrap">
                        {r.influencers?.instagram_handle ?? '—'}
                      </td>
                      <td className="px-4 py-3 font-mono text-[#00ff87] text-xs font-bold whitespace-nowrap">
                        {r.coupon_number}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${st.color}`}>
                          {st.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">
                        {formatDate(r.created_at)}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <div className="flex gap-1">
                          <button
                            onClick={() => openEdit(r)}
                            className="text-xs px-2.5 py-1 rounded-md border border-[#2a2a2a] text-gray-400 hover:text-white hover:border-[#00ff87] transition-colors"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => confirmDelete([r.id], `o participante ${r.customer_name}`)}
                            disabled={deleting}
                            className="text-xs px-2.5 py-1 rounded-md border border-red-900 text-red-400 hover:bg-red-950 transition-colors disabled:opacity-50"
                          >
                            Excluir
                          </button>
                        </div>
                      </td>
                    </tr>
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
                <h2 className="text-white font-semibold text-lg">Editar Participante</h2>
                <p className="text-gray-500 text-xs mt-0.5">{editing.coupon_number}</p>
              </div>
              <button onClick={() => setEditing(null)} className="text-gray-500 hover:text-white text-xl">✕</button>
            </div>

            <form onSubmit={handleSaveEdit} className="p-6 flex flex-col gap-4">
              <div>
                <label className="text-sm text-gray-300 block mb-1.5">Status do cupom</label>
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
              <div>
                <label className="text-sm text-gray-300 block mb-1.5">Nome</label>
                <input type="text" value={editForm.customer_name} required disabled={saving}
                  onChange={(e) => setEditForm((p) => p ? { ...p, customer_name: e.target.value } : p)}
                  className="w-full h-11 px-4 rounded-lg border border-[#2a2a2a] bg-[#1e1e1e] text-white text-sm focus:border-[#00ff87] focus:outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm text-gray-300 block mb-1.5">Telefone</label>
                  <input type="text" value={editForm.customer_phone} disabled={saving}
                    onChange={(e) => setEditForm((p) => p ? { ...p, customer_phone: e.target.value } : p)}
                    className="w-full h-11 px-4 rounded-lg border border-[#2a2a2a] bg-[#1e1e1e] text-white text-sm focus:border-[#00ff87] focus:outline-none" />
                </div>
                <div>
                  <label className="text-sm text-gray-300 block mb-1.5">CPF</label>
                  <input type="text" value={editForm.customer_cpf} maxLength={11} disabled={saving}
                    onChange={(e) => setEditForm((p) => p ? { ...p, customer_cpf: e.target.value.replace(/\D/g, '') } : p)}
                    className="w-full h-11 px-4 rounded-lg border border-[#2a2a2a] bg-[#1e1e1e] text-white text-sm font-mono focus:border-[#00ff87] focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="text-sm text-gray-300 block mb-1.5">E-mail</label>
                <input type="email" value={editForm.customer_email} disabled={saving}
                  onChange={(e) => setEditForm((p) => p ? { ...p, customer_email: e.target.value } : p)}
                  className="w-full h-11 px-4 rounded-lg border border-[#2a2a2a] bg-[#1e1e1e] text-white text-sm focus:border-[#00ff87] focus:outline-none" />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="submit" disabled={saving}
                  className="flex-1 h-11 bg-[#00ff87] text-black font-semibold rounded-lg hover:bg-[#00e67a] disabled:opacity-60 transition-colors">
                  {saving ? 'Salvando...' : 'Salvar'}
                </button>
                <button type="button" onClick={() => setEditing(null)} disabled={saving}
                  className="px-5 h-11 border border-[#2a2a2a] text-gray-400 hover:text-white rounded-lg transition-colors">
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
