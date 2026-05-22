import { createClient } from '@/lib/supabase/server'
import { ParticipantesTable } from '@/components/admin/ParticipantesTable'

interface SearchParams {
  q?: string
  influencer_id?: string
  status?: string
  [key: string]: string | undefined
}

export default async function ParticipantesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const supabase = await createClient()

  const [couponsRes, influencersRes] = await Promise.all([
    supabase
      .from('coupons')
      .select('*, influencers(id, name, instagram_handle), campaigns(name, discount_value, discount_type)')
      .order('created_at', { ascending: false })
      .limit(500),
    supabase.from('influencers').select('id, name, instagram_handle').order('name'),
  ])

  let rows = couponsRes.data || []

  if (params.status) rows = rows.filter((c) => c.status === params.status)
  if (params.influencer_id) rows = rows.filter((c) => (c.influencers as { id: string } | null)?.id === params.influencer_id)
  if (params.q) {
    const q = params.q.toLowerCase()
    rows = rows.filter((c) =>
      c.customer_name.toLowerCase().includes(q) ||
      c.customer_cpf.includes(q) ||
      c.customer_email.toLowerCase().includes(q) ||
      c.customer_phone.includes(q) ||
      c.coupon_number.toLowerCase().includes(q)
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <ParticipantesTable
        rows={rows as Parameters<typeof ParticipantesTable>[0]['rows']}
        influencers={influencersRes.data || []}
        filters={params}
      />
    </div>
  )
}
