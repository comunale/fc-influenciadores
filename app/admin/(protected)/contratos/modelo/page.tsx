import { createClient, getUserRole } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ModeloEditor } from '@/components/admin/contratos/ModeloEditor'

export const dynamic = 'force-dynamic'

export default async function ModeloPage() {
  const [role, supabase] = await Promise.all([getUserRole(), createClient()])
  if (role !== 'admin') redirect('/admin')

  const { data: modelo } = await supabase
    .from('contract_templates')
    .select('id, versao, titulo, corpo')
    .eq('ativo', true)
    .order('versao', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: versoes } = await supabase
    .from('contract_templates')
    .select('versao, created_at')
    .order('versao', { ascending: false })

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 flex flex-col gap-6">
      <Link href="/admin/contratos" className="text-gray-500 hover:text-white text-sm">
        ← Contratos
      </Link>

      <div>
        <h1 className="text-white font-bold text-2xl">Modelo do contrato</h1>
        <p className="text-gray-500 text-sm mt-1">
          Vale para contratos novos. Contrato já aceito guarda o texto de quando
          foi assinado e não muda.
        </p>
      </div>

      <ModeloEditor
        inicial={modelo ?? null}
        versoes={(versoes ?? []) as { versao: number; created_at: string }[]}
      />
    </div>
  )
}
