import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { createClient, requireRole } from '@/lib/supabase/server'
import { formatDateTime } from '@/lib/utils'

/**
 * O arquivo que sustenta a premiação.
 *
 * Uma linha por VENDA CONFERIDA a pagar — não uma linha por indicador. O César
 * paga por fora, e pagar exige saber qual venda está sendo paga: um total por
 * pessoa não se confere contra nada depois.
 *
 * O que NÃO está aqui, de propósito: nada que o sistema marque como pago. O
 * programa não escreve em `coupons.paid` — aquele campo pertence ao fechamento
 * do influenciador e tem um escritor só. Se um dia for preciso controlar o que
 * já foi premiado, isso é lançamento próprio, não um booleano emprestado.
 */
const HEADERS = [
  'Indicador',
  'CPF do indicador',
  'Telefone do indicador',
  'Código',
  'Cupom',
  'Comprador',
  'CPF do comprador',
  'Telefone do comprador',
  'Loja',
  'Vendedor',
  'Validado em',
  'NF',
  'Prêmio (R$)',
]

export async function GET() {
  const auth = await requireRole(['admin', 'finance'])
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('coupons')
    .select(
      `coupon_number, customer_name, customer_cpf, customer_phone, used_at, invoice_number,
       commission_per_sale,
       indicadores(nome, cpf, telefone, codigo),
       sellers(name, store_name)`
    )
    .not('indicador_id', 'is', null)
    .eq('status', 'used')
    .eq('verified', true)
    .order('used_at', { ascending: true })

  if (error) {
    console.error('admin/indicadores/export:', error)
    return NextResponse.json({ error: 'Erro ao montar a exportação.' }, { status: 500 })
  }

  const linhas = (data ?? []).map((c) => {
    const ind = c.indicadores as { nome: string; cpf: string; telefone: string; codigo: string } | null
    const vend = c.sellers as { name: string; store_name: string } | null
    return [
      ind?.nome ?? '',
      ind?.cpf ?? '',
      ind?.telefone ?? '',
      ind?.codigo ?? '',
      c.coupon_number,
      c.customer_name,
      c.customer_cpf,
      c.customer_phone,
      vend?.store_name ?? '',
      vend?.name ?? '',
      c.used_at ? formatDateTime(c.used_at) : '',
      c.invoice_number ?? '',
      c.commission_per_sale ?? 0,
    ]
  })

  const total = linhas.reduce((s, l) => s + Number(l[12] || 0), 0)

  const sheet = XLSX.utils.aoa_to_sheet([
    HEADERS,
    ...linhas,
    // O total fecha a planilha para quem vai pagar conferir a soma sem fórmula.
    [],
    ['TOTAL A PAGAR', '', '', '', '', '', '', '', '', '', '', '', total],
  ])
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, 'A premiar')

  const buffer = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  const hoje = new Date().toISOString().slice(0, 10)

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="indicacoes-a-premiar-${hoje}.xlsx"`,
      // Dado de cliente não fica em cache de proxy nenhum.
      'Cache-Control': 'no-store',
    },
  })
}
