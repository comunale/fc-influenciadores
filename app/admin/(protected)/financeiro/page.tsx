import { createClient, getUserRole } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { ContratoInfluencer } from '@/lib/commission'
import { periodoSugerido, hojeNoBalcao } from '@/lib/settlements/periodo'
import { previaDoFechamento, previaParaTela, type CupomDeExibicao } from '@/lib/settlements/previa'
import { ListaDeLancamentos } from '@/components/admin/financeiro/ListaDeLancamentos'
import type { GrupoDoInfluenciador, Lancamento } from '@/components/admin/financeiro/tipos'

type ParceriaLinha = {
  id: string
  influencer_id: string
  status: string
  starts_at: string
  ends_at: string | null
  payment_schedule: string
  commission_per_sale: number
  commission_starts_at: number
  fee_amount: number
  commission_counts_from: string
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
      `id, influencer_id, status, starts_at, ends_at, payment_schedule, commission_per_sale,
       commission_starts_at, fee_amount, commission_counts_from,
       influencers(id, name, instagram_handle),
       settlements(id, tipo, status, periodo_de, periodo_ate, valor, paid_at, forma, identificador, created_at, created_by,
         settlement_items(id, coupon_id, valor, coupons(coupon_number, customer_name, used_at)))`
    )
    .order('starts_at', { ascending: false })

  const parcerias = (data ?? []) as unknown as ParceriaLinha[]

  // Os cupons de cada influenciador, para a previa do fechamento calculada AQUI
  // com as mesmas funcoes puras da rota (o navegador nao recalcula dinheiro).
  const idsDosInfluenciadores = [...new Set(parcerias.map((p) => p.influencer_id))]
  const respostas = await Promise.all(
    idsDosInfluenciadores.map((id) =>
      supabase
        .from('coupons')
        .select('id, status, verified, paid, created_at, commission_per_sale, partnership_id, used_at, coupon_number, customer_name')
        .eq('influencer_id', id)
    )
  )
  const erroNosCupons = respostas.some((r) => r.error)
  const cuponsDe = new Map<string, CupomDeExibicao[]>()
  respostas.forEach((r, i) => cuponsDe.set(idsDosInfluenciadores[i], (r.data ?? []) as unknown as CupomDeExibicao[]))

  // Cupons que ja estao em algum item de lancamento, por influenciador.
  const emLancamentoDe = new Map<string, Set<string>>()
  for (const p of parcerias) {
    const s = emLancamentoDe.get(p.influencer_id) ?? new Set<string>()
    for (const l of p.settlements ?? []) for (const i of l.settlement_items) s.add(i.coupon_id)
    emLancamentoDe.set(p.influencer_id, s)
  }

  const hoje = hojeNoBalcao(new Date())
  const porInfluenciador = new Map<string, GrupoDoInfluenciador>()
  for (const p of parcerias) {
    if (!p.influencers) continue
    const cupons = cuponsDe.get(p.influencer_id) ?? []
    const emLancamento = emLancamentoDe.get(p.influencer_id) ?? new Set<string>()

    const grupo = porInfluenciador.get(p.influencers.id) ?? {
      influencer: p.influencers,
      // Pagos (paid = true) sem item de lancamento: o portal os soma em "Ja pago".
      pagosForaDeLancamento: cupons.filter((c) => c.paid && !emLancamento.has(c.id)).length,
      parcerias: [],
    }

    // Parceria encerrada fecha a vida inteira dela (como 'fim'), qualquer que
    // seja o calendario: oferecer "o mes passado" de quem acabou em marco e
    // sempre um fechamento vazio.
    // Tambem conta como encerrada a parceria com ends_at JA PASSADO que ninguem
    // marcou como 'encerrada': sem isso ela fica sem periodo e com os cupons
    // pos-fim sem como fechar.
    const hojeIso = hoje.toISOString().slice(0, 10)
    const encerrada = p.status === 'encerrada' || (p.ends_at !== null && p.ends_at < hojeIso)
    const periodo = periodoSugerido(
      encerrada || p.payment_schedule === 'fim' ? 'fim' : 'mensal',
      { starts_at: p.starts_at, ends_at: p.ends_at, status: encerrada ? 'encerrada' : 'ativa' },
      hoje
    )
    const contrato: ContratoInfluencer = {
      commission_per_sale: p.commission_per_sale,
      commission_starts_at: p.commission_starts_at,
      fee_amount: p.fee_amount,
      commission_counts_from: p.commission_counts_from === 'historico' ? 'historico' : 'parceria',
      partnership_id: p.id,
    }
    const previa = previaDoFechamento({
      cupons,
      contrato,
      periodo,
      fimDaParceria: p.ends_at,
      emLancamento,
    })

    grupo.parcerias.push({
      id: p.id,
      status: p.status,
      starts_at: p.starts_at,
      ends_at: p.ends_at,
      payment_schedule: p.payment_schedule,
      commission_per_sale: p.commission_per_sale,
      previa: previaParaTela(previa, cupons, periodo, p.ends_at),
      encerrada,
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
      {erroNosCupons && (
        <p role="alert" className="text-sm text-red-400 bg-red-950/40 border border-red-900 rounded-lg px-3 py-2">
          Não foi possível ler os cupons de algum influenciador: as prévias e os totais de &quot;pago fora de lançamento&quot; podem estar incompletos. Atualize a página antes de fechar.
        </p>
      )}
      <ListaDeLancamentos grupos={grupos} />
    </div>
  )
}
