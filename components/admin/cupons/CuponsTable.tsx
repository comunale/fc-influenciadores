'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { can, type Role } from '@/lib/auth/roles'
import { type CouponRow, type InfluencerOption } from './types'
import { CuponsFilters } from './CuponsFilters'
import { CuponsRowItem } from './CuponsRow'
import { exportCuponsXLS } from './exportCupons'

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
  role,
  noLimite = false,
}: {
  coupons: CouponRow[]
  influencers: InfluencerOption[]
  filters: Record<string, string | undefined>
  role: Role
  /** A lista bateu no teto e pode haver mais — dizer, nunca truncar em silêncio. */
  noLimite?: boolean
}) {
  const router = useRouter()

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)
  const [editing, setEditing] = useState<CouponRow | null>(null)
  const [editForm, setEditForm] = useState<EditForm | null>(null)
  const [saving, setSaving] = useState(false)

  const podeExcluir = can(role, 'coupons.delete')
  // O Lojista só lê: as colunas financeiras não fazem sentido para ele e são
  // metade da largura da tabela.
  const podeConferir = can(role, 'coupons.verify')
  const podeEditar = can(role, 'coupons.edit')
  const temAcoes = podeEditar || podeExcluir

  // 12 colunas criavam barra de rolagem horizontal. Influencer e Vendedor viraram
  // uma coluna só, e o desconto entrou embaixo do status. O que saiu daqui
  // continua na linha expandida.
  const COLUNAS = podeConferir
    ? ['Código', 'Data', 'Cliente', 'Origem', 'Status', 'NF', 'Conferido', 'Pago']
    : ['Código', 'Data', 'Cliente', 'Origem', 'Status']

  const colSpan = COLUNAS.length + (podeExcluir ? 1 : 0) + (temAcoes ? 1 : 0)

  const allSelected = coupons.length > 0 && selected.size === coupons.length
  const someSelected = selected.size > 0

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(coupons.map((c) => c.id)))
  }

  async function deleteCoupons(ids: string[]) {
    setDeleting(true)
    try {
      const res = await fetch('/api/admin/coupons', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Erro ao excluir.')
        return
      }
      toast.success(`${ids.length} cupom(ns) excluído(s).`)
      setSelected(new Set())
      router.refresh()
    } catch {
      toast.error('Erro de conexão.')
    } finally {
      setDeleting(false)
    }
  }

  function confirmDelete(ids: string[], label: string) {
    if (!confirm(`Excluir ${label}? Esta ação não pode ser desfeita.`)) return
    deleteCoupons(ids)
  }

  function openEdit(c: CouponRow) {
    setEditing(c)
    setEditForm({
      status: c.status,
      customer_name: c.customer_name,
      customer_email: c.customer_email,
      customer_phone: c.customer_phone,
      customer_cpf: c.customer_cpf,
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
      if (!res.ok) {
        toast.error(data.error || 'Erro ao salvar.')
        return
      }
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


  return (
    <>
      <div className="flex items-center justify-between mb-5 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">Cupons</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {coupons.length} resultado{coupons.length !== 1 ? 's' : ''}
            {noLimite && (
              <span className="text-yellow-500"> · mostrando os mais recentes, filtre para ver o resto</span>
            )}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          {podeExcluir && someSelected && (
            <button
              onClick={() => confirmDelete(Array.from(selected), `${selected.size} cupom(ns) selecionado(s)`)}
              disabled={deleting}
              className="flex items-center gap-2 text-sm border border-red-800 text-red-400 hover:bg-red-950 px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              Excluir {selected.size} selecionado{selected.size !== 1 ? 's' : ''}
            </button>
          )}
          <button
            onClick={() => exportCuponsXLS(coupons)}
            className="flex items-center gap-2 text-sm border border-[#2a2a2a] text-gray-300 hover:text-white hover:border-[#00ff87] px-4 py-2 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Exportar XLS
          </button>
        </div>
      </div>

      <CuponsFilters influencers={influencers} filters={filters} />

      <div className="bg-[#141414] border border-[#1e1e1e] rounded-xl overflow-hidden">
        {coupons.length === 0 ? (
          <div className="py-16 text-center text-gray-500">Nenhum cupom encontrado.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1e1e1e] text-left">
                  {podeExcluir && (
                    <th className="px-4 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleAll}
                        className="accent-[#00ff87] w-4 h-4 cursor-pointer"
                      />
                    </th>
                  )}
                  {COLUNAS.map((h) => (
                    <th key={h} className="px-4 py-3 text-gray-500 font-medium whitespace-nowrap">{h}</th>
                  ))}
                  {temAcoes && <th className="px-3 py-3" />}
                </tr>
              </thead>
              <tbody>
                {coupons.map((c) => (
                  <CuponsRowItem
                    key={c.id}
                    c={c}
                    role={role}
                    colSpan={colSpan}
                    selected={selected.has(c.id)}
                    onToggleSelect={toggleOne}
                    onEdit={openEdit}
                    onDelete={confirmDelete}
                    deleting={deleting}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

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
              <div>
                <label className="text-sm text-gray-300 block mb-1.5">Status</label>
                <select
                  value={editForm.status}
                  onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                  className="w-full h-11 px-3 rounded-lg border border-[#2a2a2a] bg-[#1e1e1e] text-white text-sm focus:border-[#00ff87] focus:outline-none"
                >
                  <option value="pending">Pendente</option>
                  <option value="used">Usado</option>
                  <option value="expired">Expirado</option>
                  <option value="cancelled">Cancelado</option>
                </select>
              </div>

              {(['customer_name', 'customer_email', 'customer_phone', 'customer_cpf'] as const).map((campo) => (
                <div key={campo}>
                  <label className="text-sm text-gray-300 block mb-1.5">
                    {campo === 'customer_name' ? 'Nome' :
                     campo === 'customer_email' ? 'E-mail' :
                     campo === 'customer_phone' ? 'Telefone' : 'CPF'}
                  </label>
                  <input
                    value={editForm[campo]}
                    onChange={(e) => setEditForm({ ...editForm, [campo]: e.target.value })}
                    className="w-full h-11 px-3 rounded-lg border border-[#2a2a2a] bg-[#1e1e1e] text-white text-sm focus:border-[#00ff87] focus:outline-none"
                  />
                </div>
              ))}

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 h-11 bg-[#00ff87] text-black font-semibold rounded-lg hover:bg-[#00cc6a] disabled:opacity-50"
                >
                  {saving ? 'Salvando...' : 'Salvar'}
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="h-11 px-5 border border-[#2a2a2a] text-gray-300 rounded-lg hover:text-white"
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
