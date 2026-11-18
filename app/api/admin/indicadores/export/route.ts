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

export async function GET(request: Request) {
  const auth = await requireRole(['admin', 'finance'])
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const supabase = await createClient()

  // Por padrão, só o que FALTA pagar. Até 18/11/2026 esta rota trazia toda
  // venda conferida, sempre: cinco prêmios pagos em novembro reapareciam em
  // dezembro na mesma planilha, com o total somando os dois meses.
  const todos = new URL(request.url).searchParams.get('todos') === '1'

  let query = supabase
    .from('coupons')
    .select(
      `coupon_number, customer_name, customer_cpf, customer_phone, used_at, invoice_number,
       commission_per_sale, indicacao_premiado_em, indicacao_premiado_por,
       indicadores(nome, cpf, telefone, codigo),
       sellers(name, store_name)`
    )
    .not('indicador_id', 'is', null)
    .eq('status', 'used')
    .eq('verified', true)

  if (!todos) query = query.is('indicacao_premiado_em', null)

  const { data, error } = await query.order('used_at', { ascending: true })

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
      c.indicacao_premiado_em ? formatDateTime(c.indicacao_premiado_em) : '',
      c.indicacao_premiado_por ?? '',
    ]
  })

  // Soma só o que NÃO foi pago: numa exportação com ?todos=1 o rodapé não pode
  // dizer "a pagar" sobre linha que já foi paga.
  const total = (data ?? []).reduce(
    (s, c) => s + (c.indicacao_premiado_em ? 0 : Number(c.commission_per_sale ?? 0)),
    0
  )

  const sheet = XLSX.utils.aoa_to_sheet([
    HEADERS,
    ...linhas,
    // O total fecha a planilha para quem vai pagar conferir a soma sem fórmula.
    [],
    ['TOTAL A PAGAR', '', '', '', '', '', '', '', '', '', '', '', total, '', ''],
  ])
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, todos ? 'Todas' : 'A premiar')

  const buffer = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  const hoje = new Date().toISOString().slice(0, 10)
  const sufixo = todos ? 'completo' : 'a-pagar'

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="indicacoes-${sufixo}-${hoje}.xlsx"`,
      // Dado de cliente não fica em cache de proxy nenhum.
      'Cache-Control': 'no-store',
    },
  })
}
