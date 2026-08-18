import { createClient, getUserRole } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CuponsTable } from '@/components/admin/cupons/CuponsTable'
import { type CouponRow } from '@/components/admin/cupons/types'
import { can, type Role } from '@/lib/auth/roles'

interface SearchParams {
  status?: string
  influencer_id?: string
  q?: string
  from?: string
  to?: string
  conferencia?: string
  [key: string]: string | undefined
}

export default async function CuponsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const [role, supabase] = await Promise.all([getUserRole(), createClient()])

  if (!can(role, 'coupons.read')) redirect('/admin/validar')

  const [couponsRes, influencersRes] = await Promise.all([
    supabase
      .from('coupons')
      .select(
        '*, influencers(id, name, instagram_handle), campaigns(name), sellers(id, name, store_name)'
      )
      .order('created_at', { ascending: false })
      .limit(500),
    supabase.from('influencers').select('id, name, instagram_handle').order('name'),
  ])

  let coupons = (couponsRes.data || []) as unknown as CouponRow[]

  if (params.status) coupons = coupons.filter((c) => c.status === params.status)
  if (params.influencer_id) coupons = coupons.filter((c) => c.influencers?.id === params.influencer_id)

  if (params.q) {
    const q = params.q.toLowerCase()
    coupons = coupons.filter((c) =>
      c.customer_name.toLowerCase().includes(q) ||
      c.customer_cpf.includes(q) ||
      c.coupon_number.toLowerCase().includes(q) ||
      c.customer_email.toLowerCase().includes(q) ||
      (c.invoice_number ?? '').toLowerCase().includes(q)
    )
  }

  // Filtro de conferência: é como o Financeiro encontra o que falta fazer.
  if (params.conferencia === 'pendente') coupons = coupons.filter((c) => !c.verified)
  if (params.conferencia === 'conferido') coupons = coupons.filter((c) => c.verified)
  if (params.conferencia === 'a_pagar') coupons = coupons.filter((c) => c.verified && !c.paid)
  if (params.conferencia === 'pago') coupons = coupons.filter((c) => c.paid)

  if (params.from) coupons = coupons.filter((c) => new Date(c.created_at) >= new Date(params.from!))
  if (params.to) coupons = coupons.filter((c) => new Date(c.created_at) <= new Date(params.to! + 'T23:59:59'))

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <CuponsTable
        coupons={coupons}
        influencers={influencersRes.data || []}
        filters={params}
        role={role as Role}
      />
    </div>
  )
}
