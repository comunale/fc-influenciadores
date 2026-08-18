import { createClient, getUserRole } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CuponsTable } from '@/components/admin/cupons/CuponsTable'
import { type CouponRow } from '@/components/admin/cupons/types'
import { can, type Role } from '@/lib/auth/roles'
import { telefonesSuspeitos } from '@/lib/coupons/telefone-repetido'

interface SearchParams {
  status?: string
  influencer_id?: string
  q?: string
  from?: string
  to?: string
  conferencia?: string
  [key: string]: string | undefined
}

/**
 * Quantos cupons a tela carrega de uma vez.
 *
 * Os filtros vão todos para o banco desde 18/08/2026 — antes a página buscava
 * 500 linhas com três junções e filtrava em memória, o que ficava lento assim
 * que o volume crescesse.
 */
const LIMITE = 200

export default async function CuponsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const [role, supabase] = await Promise.all([getUserRole(), createClient()])

  if (!can(role, 'coupons.read')) redirect('/admin/validar')

  let query = supabase
    .from('coupons')
    .select(
      '*, influencers(id, name, instagram_handle), campaigns(name), sellers(id, name, store_name)'
    )

  if (params.status) query = query.eq('status', params.status)
  if (params.influencer_id) query = query.eq('influencer_id', params.influencer_id)
  if (params.from) query = query.gte('created_at', params.from)
  if (params.to) query = query.lte('created_at', params.to + 'T23:59:59')

  // Filtro de conferência: é como o Financeiro acha o que falta fazer.
  if (params.conferencia === 'pendente') query = query.eq('verified', false)
  if (params.conferencia === 'conferido') query = query.eq('verified', true)
  if (params.conferencia === 'pago') query = query.eq('paid', true)
  if (params.conferencia === 'a_pagar') {
    query = query.eq('verified', true).eq('paid', false)
  }

  if (params.q) {
    // Vai montar um filtro .or() em texto: só deixa passar o que é seguro ali.
    const q = params.q.replace(/[(),*]/g, '').trim()
    if (q) {
      query = query.or(
        [
          `customer_name.ilike.%${q}%`,
          `customer_cpf.ilike.%${q}%`,
          `coupon_number.ilike.%${q}%`,
          `customer_email.ilike.%${q}%`,
          `invoice_number.ilike.%${q}%`,
        ].join(',')
      )
    }
  }

  const [couponsRes, influencersRes, todosTelefones] = await Promise.all([
    query.order('created_at', { ascending: false }).limit(LIMITE),
    supabase.from('influencers').select('id, name, instagram_handle').order('name'),
    // A base INTEIRA, não só a página: um telefone repetido entre dois cupons
    // que caem em páginas ou filtros diferentes passaria despercebido, e é
    // justamente quando a base cresce que isso importa.
    supabase.from('coupons').select('id, customer_phone, customer_cpf'),
  ])

  const coupons = (couponsRes.data || []) as unknown as CouponRow[]

  // Mesmo telefone em CPFs diferentes: o sinal de que alguém preencheu pelo
  // cliente. Marca e alerta, nunca bloqueia — ver lib/coupons/telefone-repetido.ts
  const suspeitos = telefonesSuspeitos(todosTelefones.data || [])

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <CuponsTable
        coupons={coupons}
        influencers={influencersRes.data || []}
        filters={params}
        role={role as Role}
        noLimite={coupons.length >= LIMITE}
        suspeitos={suspeitos}
      />
    </div>
  )
}
