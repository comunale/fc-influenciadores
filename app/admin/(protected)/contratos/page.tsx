import { createClient, getUserRole } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ContratosList } from '@/components/admin/contratos/ContratosList'

export const dynamic = 'force-dynamic'

export default async function ContratosPage() {
  const [role, supabase] = await Promise.all([getUserRole(), createClient()])

  // Admin manda; o Financeiro lê, porque precisa saber se há contrato aceito
  // antes de liberar pagamento.
  if (role !== 'admin' && role !== 'finance') redirect('/admin')

  const { data: contratos } = await supabase
    .from('contracts')
    .select('id, status, accepted_at, fee_a_restituir, created_at, partnership_id, partnerships(starts_at, ends_at, status, fee_amount, commission_per_sale, influencers(name, instagram_handle))')
    .order('created_at', { ascending: false })

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-white font-bold text-2xl">Contratos</h1>
          <p className="text-gray-500 text-sm mt-1">
            Um por parceria. O link do influenciador só liga depois do aceite.
          </p>
        </div>
        {role === 'admin' && (
          <Link
            href="/admin/contratos/modelo"
            className="text-sm border border-[#2a2a2a] text-gray-300 hover:text-white hover:border-[#00ff87] px-4 py-2 rounded-lg transition-colors"
          >
            Editar modelo
          </Link>
        )}
      </div>

      <ContratosList
        contratos={(contratos ?? []) as never[]}
        podeAgir={role === 'admin'}
      />
    </div>
  )
}
