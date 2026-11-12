import { requireRole, createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { ContratoInfluencer } from '@/lib/commission'
import { intersecar, previaDoFechamento } from '@/lib/settlements/previa'
import {
  PAPEIS_DO_LIVRO,
  camposDeFechamento,
  centavos,
  recusaDeFechar,
  resumoDeExcluidos,
  somaDoLancamento,
  traduzErroDoLivro,
} from '@/lib/settlements/rotas'

/**
 * Fecha um periodo: cria o lancamento de comissao e os itens que ele quita.
 *
 * Usa o cliente da SESSAO, nunca o service_role. Com a chave de servico
 * auth.uid() e nulo e os triggers de imutabilidade da migration 031 deixariam
 * o Financeiro editar e apagar lancamento pago. Por isso tambem nao chamamos
 * settlement_pode_incluir (so service_role executa): a elegibilidade sai de
 * previaDoFechamento (a mesma funcao da tela) e o trigger settlement_items_valida e a ultima palavra.
 *
 * Ordem inegociavel: o lancamento nasce 'aberto' e SO ENTAO recebe os itens
 * (o trigger recusa item em lancamento que nao esta aberto). Pagar e outra
 * rota. Fechar NAO marca coupons.paid.
 */
export async function POST(request: Request) {
  try {
    const auth = await requireRole([...PAPEIS_DO_LIVRO])
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const campos = camposDeFechamento(await request.json().catch(() => null))
    if (!campos.ok) return NextResponse.json({ error: campos.error }, { status: 400 })
    const { partnership_id, periodo, cupom_ids } = campos

    const supabase = await createClient()

    const { data: parceria, error: erroParceria } = await supabase
      .from('partnerships')
      .select('id, influencer_id, ends_at, commission_per_sale, commission_starts_at, fee_amount, commission_counts_from')
      .eq('id', partnership_id)
      .maybeSingle()
    if (erroParceria) {
      console.error('settlements fechar: parceria', erroParceria)
      return NextResponse.json({ error: 'Não foi possível ler a parceria.' }, { status: 500 })
    }
    if (!parceria) return NextResponse.json({ error: 'Parceria não encontrada.' }, { status: 404 })

    // A posicao da venda depende de TODAS as vendas conferidas do influenciador
    // (inclusive pagas e de fora do periodo); o recorte vem depois, em previaDoFechamento.
    const { data: cupons, error: erroCupons } = await supabase
      .from('coupons')
      .select('id, status, verified, paid, created_at, commission_per_sale, partnership_id, used_at')
      .eq('influencer_id', parceria.influencer_id)
    if (erroCupons) {
      console.error('settlements fechar: cupons', erroCupons)
      return NextResponse.json({ error: 'Não foi possível ler os cupons.' }, { status: 500 })
    }

    const contratoDaParceria: ContratoInfluencer = {
      commission_per_sale: parceria.commission_per_sale,
      commission_starts_at: parceria.commission_starts_at,
      fee_amount: parceria.fee_amount,
      commission_counts_from: parceria.commission_counts_from === 'historico' ? 'historico' : 'parceria',
      partnership_id: parceria.id,
    }

    // Cupons que ja constam em algum lancamento (qualquer status). Junta por
    // cupom do influenciador para nao montar uma URL com centenas de ids.
    const { data: itensDoInfluenciador, error: erroItens } = await supabase
      .from('settlement_items')
      .select('coupon_id, coupons!inner(influencer_id)')
      .eq('coupons.influencer_id', parceria.influencer_id)
    if (erroItens) {
      console.error('settlements fechar: itens existentes', erroItens)
      return NextResponse.json({ error: 'Não foi possível conferir os lançamentos existentes.' }, { status: 500 })
    }
    const emLancamento = new Set((itensDoInfluenciador ?? []).map((i) => i.coupon_id))

    // O conjunto elegivel e SEMPRE calculado aqui, igual ao da previa da tela.
    // A lista de ids do cliente (se vier) so escolhe DENTRO dele.
    const previa = previaDoFechamento({
      cupons: cupons ?? [],
      contrato: contratoDaParceria,
      periodo,
      fimDaParceria: parceria.ends_at,
      emLancamento,
    })
    const { escolhidos: elegiveis, ignorados } = intersecar(previa, cupom_ids)
    const resumoExcluidos = resumoDeExcluidos(previa.excluidos)

    const recusa = recusaDeFechar(elegiveis)
    if (recusa) {
      return NextResponse.json({ error: recusa.error, excluidos: resumoExcluidos, ignorados }, { status: recusa.status })
    }

    // Cada item arredondado a centavos e o total e a soma dos itens ja
    // arredondados: settlements.valor bate com sum(settlement_items.valor).
    const itensDoLancamento = elegiveis.map((c) => ({ ...c, valor: centavos(c.valor) }))
    const valor = somaDoLancamento(itensDoLancamento)

    const { data: lancamento, error: erroLanc } = await supabase
      .from('settlements')
      .insert({
        partnership_id,
        tipo: 'comissao',
        status: 'aberto',
        periodo_de: periodo.de,
        periodo_ate: periodo.ate,
        valor,
        created_by: auth.name,
      })
      .select('id')
      .single()
    if (erroLanc || !lancamento) {
      console.error('settlements fechar: lancamento', erroLanc)
      const r = traduzErroDoLivro(erroLanc ?? { message: '' })
      return NextResponse.json({ error: r.error }, { status: r.status })
    }

    const { error: erroItensIns } = await supabase
      .from('settlement_items')
      .insert(itensDoLancamento.map((c) => ({ settlement_id: lancamento.id, coupon_id: c.coupon_id, valor: c.valor })))

    if (erroItensIns) {
      // Insercao em lote e atomica: nenhum item entrou. Desfaz o lancamento
      // vazio para nao deixar um 'aberto' fantasma no livro.
      const { error: erroLimpeza } = await supabase.from('settlements').delete().eq('id', lancamento.id)
      if (erroLimpeza) console.error('settlements fechar: limpeza do lancamento vazio', erroLimpeza)
      console.error('settlements fechar: itens', erroItensIns)
      const r = traduzErroDoLivro(erroItensIns)
      return NextResponse.json({ error: r.error }, { status: r.status })
    }

    return NextResponse.json({
      settlement_id: lancamento.id,
      valor,
      itens: itensDoLancamento.length,
      // O que ficou de fora e por que, para a tela nao mostrar um total menor
      // sem explicar.
      excluidos: resumoExcluidos,
      // Ids da lista que nao pertencem ao conjunto do servidor (ignorados, nunca inseridos).
      ignorados,
    })
  } catch (err) {
    console.error('settlements fechar error:', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
