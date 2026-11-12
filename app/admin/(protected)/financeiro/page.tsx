import { createClient, getUserRole } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { periodoSugerido, hojeNoBalcao } from '@/lib/settlements/periodo'
import { ListaDeLancamentos } from '@/components/admin/financeiro/ListaDeLancamentos'
import type { GrupoDoInfluenciador, Lancamento } from '@/components/admin/financeiro/tipos'

type ParceriaLinha = {
  id: string
  status: string
  starts_at: string
  ends_at: string | null
  payment_schedule: string
  commission_per_sale: number
  influencers: { id: string; name: string; instagram_handle: string | null } | null
  settlements: Lancamento[]
}

export default async function FinanceiroPage() {
  // Só admin e financeiro. O layout confere apenas que há alguém logado; as
  // rotas e a RLS repetem esta mesma regra.
  const role = await getUserRole()
  if (role !== 'admin' && role !== 'finance') redirect('/admin/validar')

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('partnerships')
    .select(
      `id, status, starts_at, ends_at, payment_schedule, commission_per_sale,
       influencers(id, name, instagram_handle),
       settlements(id, tipo, status, periodo_de, periodo_ate, valor, paid_at, forma, identificador, created_at, created_by,
         settlement_items(id, valor, coupons(coupon_number, customer_name, used_at)))`
    )
    .order('starts_at', { ascending: false })

  // Cupons pagos fora de lancamento, por influenciador: o portal os soma em
  // "Ja pago" e a soma dos lancamentos nao, entao a tela diz que existem.
  const { data: pagos } = await supabase
    .from('coupons')
    .select('influencer_id, settlement_items(id)')
    .eq('paid', true)
  const foraDeLancamento = new Map<string, number>()
  for (const c of (pagos ?? []) as unknown as { influencer_id: string; settlement_items: unknown }[]) {
    const emLancamento = Array.isArray(c.settlement_items) ? c.settlement_items.length > 0 : Boolean(c.settlement_items)
    if (!emLancamento) foraDeLancamento.set(c.influencer_id, (foraDeLancamento.get(c.influencer_id) ?? 0) + 1)
  }

  const hoje = hojeNoBalcao(new Date())
  const porInfluenciador = new Map<string, GrupoDoInfluenciador>()
  for (const p of (data ?? []) as unknown as ParceriaLinha[]) {
    if (!p.influencers) continue
    const grupo = porInfluenciador.get(p.influencers.id) ?? {
      influencer: p.influencers,
      pagosForaDeLancamento: foraDeLancamento.get(p.influencers.id) ?? 0,
      parcerias: [],
    }
    grupo.parcerias.push({
      id: p.id,
      status: p.status,
      starts_at: p.starts_at,
      ends_at: p.ends_at,
      payment_schedule: p.payment_schedule,
      commission_per_sale: p.commission_per_sale,
      sugerido: periodoSugerido(
        p.payment_schedule === 'fim' ? 'fim' : 'mensal',
        { starts_at: p.starts_at, ends_at: p.ends_at, status: p.status === 'encerrada' ? 'encerrada' : 'ativa' },
        hoje
      ),
      lancamentos: [...(p.settlements ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at)),
    })
    porInfluenciador.set(p.influencers.id, grupo)
  }
  const grupos = [...porInfluenciador.values()].sort((a, b) => a.influencer.name.localeCompare(b.influencer.name))

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 flex flex-col gap-6">
      <div>
        <h1 className="text-white font-bold text-2xl">Financeiro</h1>
        <p className="text-gray-500 text-sm mt-1">
          Fechamentos de comissão por influenciador. Fechar congela os cupons do período; pagar registra o pagamento e não tem volta.
        </p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-400 bg-red-950/40 border border-red-900 rounded-lg px-3 py-2">
          Não foi possível carregar os lançamentos. Atualize a página.
        </p>
      )}
      <ListaDeLancamentos grupos={grupos} />
    </div>
  )
}
