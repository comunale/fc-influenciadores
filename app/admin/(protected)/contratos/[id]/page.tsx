import { createClient, getUserRole } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ContratoView } from '@/components/admin/contratos/ContratoView'

export const dynamic = 'force-dynamic'

export default async function ContratoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [role, supabase] = await Promise.all([getUserRole(), createClient()])
  if (role !== 'admin') redirect('/admin/contratos')

  const { data: contrato } = await supabase
    .from('contracts')
    .select('*, partnerships(starts_at, ends_at, status, fee_amount, commission_per_sale, contract_required, contract_accepted_at, influencers(name, instagram_handle))')
    .eq('id', id)
    .maybeSingle()

  if (!contrato) notFound()

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 flex flex-col gap-6">
      <Link href="/admin/contratos" className="text-gray-500 hover:text-white text-sm">
        ← Contratos
      </Link>
      <ContratoView contrato={contrato as never} />
    </div>
  )
}
