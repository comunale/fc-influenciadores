import { createClient, getUserRole } from '@/lib/supabase/server'
import { CuponsTable } from '@/components/admin/CuponsTable'

interface SearchParams {
  status?: string
  influencer_id?: string
  q?: string
  from?: string
  to?: string
  [key: string]: string | undefined
}

export default async function CuponsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const [role, supabase] = await Promise.all([getUserRole(), createClient()])

  const [couponsRes, influencersRes] = await Promise.all([
    supabase
      .from('coupons')
      .select('*, influencers(id, name, instagram_handle), campaigns(name, discount_value, discount_type)')
      .order('created_at', { ascending: false })
      .limit(500),
    supabase.from('influencers').select('id, name, instagram_handle').order('name'),
  ])

  let coupons = couponsRes.data || []

  // Filtros server-side
  if (params.status) coupons = coupons.filter((c) => c.status === params.status)
  if (params.influencer_id) coupons = coupons.filter((c) => (c.influencers as { id: string } | null)?.id === params.influencer_id)
  if (params.q) {
    const q = params.q.toLowerCase()
    coupons = coupons.filter((c) =>
      c.customer_name.toLowerCase().includes(q) ||
      c.customer_cpf.includes(q) ||
      c.coupon_number.toLowerCase().includes(q) ||
      c.customer_email.toLowerCase().includes(q)
    )
  }
  if (params.from) coupons = coupons.filter((c) => new Date(c.created_at) >= new Date(params.from!))
  if (params.to) coupons = coupons.filter((c) => new Date(c.created_at) <= new Date(params.to! + 'T23:59:59'))

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <CuponsTable
        coupons={coupons as Parameters<typeof CuponsTable>[0]['coupons']}
        influencers={influencersRes.data || []}
        filters={params}
        canEdit={role === 'admin'}
      />
    </div>
  )
}
