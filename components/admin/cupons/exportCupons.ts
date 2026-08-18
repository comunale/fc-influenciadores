import { formatDate, formatDateTime } from '@/lib/utils'
import { type CouponRow, STATUS, formatCpf, discountLabel } from './types'

// Uniao das colunas das duas tabelas antigas (Cupons e Participantes) mais os
// campos de conferencia financeira e o vendedor do balcao.
const HEADERS = [
  'Código', 'Data', 'Cliente', 'CPF', 'Telefone', 'Email', 'Influencer',
  'Status', 'Desconto', 'Validade', 'Usado em', 'Login que validou', 'Vendedor',
  'NF', 'Conferido', 'Conferido por', 'Pago', 'Data pgto', 'Pago por',
]

const WIDTHS = [14, 18, 24, 16, 16, 28, 18, 12, 12, 14, 18, 20, 18, 16, 11, 18, 8, 18, 18]

export async function exportCuponsXLS(rows: CouponRow[]) {
  const { utils, writeFile } = await import('xlsx')

  const data = rows.map((c) => [
    c.coupon_number,
    formatDateTime(c.created_at),
    c.customer_name,
    formatCpf(c.customer_cpf),
    c.customer_phone,
    c.customer_email,
    c.influencers?.instagram_handle ?? '',
    STATUS[c.status as keyof typeof STATUS]?.label ?? c.status,
    discountLabel(c),
    formatDate(c.expires_at),
    c.used_at ? formatDateTime(c.used_at) : '',
    c.used_by_admin ?? '',
    c.sellers?.name ?? '',
    c.invoice_number ?? '',
    c.verified ? 'Sim' : 'Não',
    c.verified_by ?? '',
    c.paid ? 'Sim' : 'Não',
    c.paid_at ? formatDateTime(c.paid_at) : '',
    c.paid_by ?? '',
  ])

  const ws = utils.aoa_to_sheet([HEADERS, ...data])
  ws['!cols'] = WIDTHS.map((w) => ({ wch: w }))
  ws['!freeze'] = { xSplit: 0, ySplit: 1 }
  ws['!autofilter'] = { ref: ws['!ref'] ?? 'A1' }

  const wb = utils.book_new()
  utils.book_append_sheet(wb, ws, 'Cupons')
  writeFile(wb, `cupons-${new Date().toISOString().slice(0, 10)}.xlsx`)
}
