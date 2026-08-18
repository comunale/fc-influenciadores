'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { formatDate, formatDateTime } from '@/lib/utils'
import { can, type Role } from '@/lib/auth/roles'
import { type CouponRow, STATUS, formatCpf, discountLabel } from './types'

export function CuponsRowItem({
  c,
  role,
  colSpan,
  selected,
  suspeito = false,
  onToggleSelect,
  onEdit,
  onDelete,
  deleting,
}: {
  c: CouponRow
  role: Role
  colSpan: number
  selected: boolean
  suspeito?: boolean
  onToggleSelect: (id: string) => void
  onEdit: (c: CouponRow) => void
  onDelete: (ids: string[], label: string) => void
  deleting: boolean
}) {
  const router = useRouter()
  const [expanded, setExpanded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [nf, setNf] = useState(c.invoice_number ?? '')
  // Espelho local de verified/paid para o clique responder na hora, sem esperar
  // a ida e volta do servidor. Se o servidor recusar, volta ao valor real.
  const [verified, setVerified] = useState(c.verified)
  const [paid, setPaid] = useState(c.paid)

  const podeExcluir = can(role, 'coupons.delete')
  const podeEditar = can(role, 'coupons.edit')
  const podeConferir = can(role, 'coupons.verify')
  const podePagar = can(role, 'coupons.pay')
  const podeNF = can(role, 'coupons.invoice')
  const temAcoes = podeEditar || podeExcluir

  const semNF = !nf.trim()
  const st = STATUS[c.status as keyof typeof STATUS] ?? STATUS.pending
  const toggle = () => setExpanded((v) => !v)

  async function patch(campos: Record<string, unknown>) {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/coupons', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: c.id, ...campos }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Erro ao salvar.')
        return false
      }
      router.refresh()
      return true
    } catch {
      toast.error('Erro de conexão.')
      return false
    } finally {
      setSaving(false)
    }
  }

  async function salvarNF() {
    const valor = nf.trim()
    if (valor === (c.invoice_number ?? '')) return

    // Apagar a NF de um cupom ja conferido quebraria a regra "sem NF nao confere".
    // Acontece no gesto natural de editar: seleciona tudo, apaga, digita o novo.
    // Em vez de deixar o banco recusar, devolve o valor e explica o caminho.
    if (!valor && verified) {
      setNf(c.invoice_number ?? '')
      toast.error('Desmarque Conferido antes de apagar a NF.')
      return
    }

    if (await patch({ invoice_number: valor })) toast.success('NF salva.')
  }

  return (
    <>
      <tr className={`border-b border-[#1a1a1a] hover:bg-[#1a1a1a] transition-colors ${selected ? 'bg-[#1a1a1a]' : ''}`}>
        {podeExcluir && (
          <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onToggleSelect(c.id)}
              className="accent-[#00ff87] w-4 h-4 cursor-pointer"
            />
          </td>
        )}

        <td className="px-4 py-3 font-mono text-[#00ff87] font-bold whitespace-nowrap cursor-pointer" onClick={toggle}>
          {c.coupon_number}
        </td>
        <td className="px-4 py-3 text-gray-400 whitespace-nowrap cursor-pointer" onClick={toggle}>
          {formatDate(c.created_at)}
        </td>
        <td className="px-4 py-3 cursor-pointer" onClick={toggle}>
          <div className="text-white font-medium">
            {c.customer_name}
            {suspeito && (
              <span
                title="Este telefone aparece em clientes com CPFs diferentes"
                className="ml-1 text-yellow-500"
              >⚠</span>
            )}
          </div>
          <div className="text-gray-500 text-xs">{c.customer_email}</div>
        </td>
        {/* Origem: quem indicou e quem vendeu. Eram duas colunas ate 18/08 e
            criavam barra horizontal -- os dois fatos continuam lado a lado. */}
        <td className="px-4 py-3 whitespace-nowrap cursor-pointer" onClick={toggle}>
          <div className="text-gray-300">{c.influencers?.instagram_handle ?? '—'}</div>
          {c.sellers?.name && (
            <div className="text-gray-500 text-xs">vend. {c.sellers.name}</div>
          )}
        </td>
        <td className="px-4 py-3 cursor-pointer" onClick={toggle}>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${st.color}`}>{st.label}</span>
          <div className="text-[#00ff87] text-xs font-bold mt-0.5">{discountLabel(c)}</div>
        </td>

        {/* NF vem ANTES de Conferido: é a ordem natural de preenchimento.
            Todo o bloco financeiro some para quem não pode conferir -- eram
            metade da largura da tabela para o Lojista, que só lê. */}
        {podeConferir && (
        <>
        <td className="px-3 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
          {podeNF ? (
            <input
              value={nf}
              onChange={(e) => setNf(e.target.value)}
              onBlur={salvarNF}
              disabled={saving}
              placeholder="—"
              className="w-24 h-8 px-2 rounded-md border border-[#2a2a2a] bg-[#1e1e1e] text-white text-xs focus:border-[#00ff87] focus:outline-none disabled:opacity-50"
            />
          ) : (
            <span className="text-gray-400 text-xs">{c.invoice_number || '—'}</span>
          )}
        </td>

        <td className="px-3 py-3 text-center" onClick={(e) => e.stopPropagation()}>
          <span title={semNF ? 'Preencha a NF antes de conferir' : undefined} className="inline-block">
          <input
            type="checkbox"
            checked={verified}
            disabled={!podeConferir || semNF || saving}
            onChange={async (e) => {
              const alvo = e.target.checked
              setVerified(alvo)
              if (!(await patch({ verified: alvo, invoice_number: nf.trim() }))) setVerified(!alvo)
              else if (!alvo) setPaid(false)
            }}
            className="accent-[#00ff87] w-4 h-4 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
          />
          </span>
          {semNF && podeConferir && (
            <div className="text-[10px] text-gray-600 mt-0.5">falta NF</div>
          )}
          {verified && c.verified_by && (
            <div className="text-[10px] text-gray-500 mt-0.5">{c.verified_by}</div>
          )}
        </td>

        <td className="px-3 py-3 text-center" onClick={(e) => e.stopPropagation()}>
          <span title={!verified ? 'Confira o cupom antes de marcar como pago' : undefined} className="inline-block">
          <input
            type="checkbox"
            checked={paid}
            disabled={!podePagar || !verified || saving}
            onChange={async (e) => {
              const alvo = e.target.checked
              setPaid(alvo)
              if (!(await patch({ paid: alvo }))) setPaid(!alvo)
            }}
            className="accent-[#00ff87] w-4 h-4 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
          />
          </span>
          {!verified && podePagar && (
            <div className="text-[10px] text-gray-600 mt-0.5">falta conferir</div>
          )}
          {paid && c.paid_at && (
            <div className="text-[10px] text-gray-500 mt-0.5">{formatDate(c.paid_at)}</div>
          )}
        </td>
        </>
        )}

        {temAcoes && (
          <td className="px-3 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
            <div className="flex gap-1">
              {podeEditar && (
                <button
                  onClick={() => onEdit(c)}
                  className="text-xs px-2.5 py-1 rounded-md border border-[#2a2a2a] text-gray-400 hover:text-white hover:border-[#00ff87] transition-colors"
                >
                  Editar
                </button>
              )}
              {podeExcluir && (
                <button
                  onClick={() => onDelete([c.id], `o cupom ${c.coupon_number}`)}
                  disabled={deleting}
                  className="text-xs px-2.5 py-1 rounded-md border border-red-900 text-red-400 hover:bg-red-950 transition-colors disabled:opacity-50"
                >
                  Excluir
                </button>
              )}
            </div>
          </td>
        )}
      </tr>

      {expanded && (
        <tr className="bg-[#111111] border-b border-[#1e1e1e]">
          <td colSpan={colSpan} className="px-4 py-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
              <Campo rotulo="CPF" valor={formatCpf(c.customer_cpf)} mono />
              <Campo rotulo="Telefone" valor={c.customer_phone} />
              <Campo rotulo="Válido até" valor={formatDate(c.expires_at)} />
              <Campo rotulo="Influencer" valor={c.influencers?.name ?? '—'} />
              {c.used_at && <Campo rotulo="Usado em" valor={formatDateTime(c.used_at)} />}
              {/* Os dois lado a lado de propósito: o login que operou o sistema
                  e o nome que a pessoa reivindicou no balcão são fatos diferentes. */}
              {c.used_by_admin && <Campo rotulo="Login que validou" valor={c.used_by_admin} />}
              {c.sellers && <Campo rotulo="Vendedor" valor={`${c.sellers.name} · ${c.sellers.store_name}`} />}
              {c.verified_at && <Campo rotulo="Conferido em" valor={formatDateTime(c.verified_at)} />}
              {c.paid_at && (
                <Campo
                  rotulo="Pago em"
                  valor={`${formatDateTime(c.paid_at)}${c.paid_by ? ` · ${c.paid_by}` : ''}`}
                />
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function Campo({ rotulo, valor, mono }: { rotulo: string; valor: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-gray-500 mb-0.5">{rotulo}</div>
      <div className={`text-white ${mono ? 'font-mono' : ''}`}>{valor}</div>
    </div>
  )
}
