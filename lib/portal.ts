/**
 * O que o influenciador enxerga no portal dele.
 *
 * Modulo puro: sem banco e sem React. Existe para a regra de exposicao poder ser
 * testada sozinha -- e essa e a regra mais delicada do sistema, porque e a
 * primeira vez que alguem de fora da FoxCycles ve dado daqui.
 *
 * Duas decisoes do Cesar em 19/08 moram aqui:
 *
 * 1. Ele ve o PRIMEIRO NOME do cliente e nada mais. O corte acontece no
 *    servidor, antes de virar resposta -- cortar na tela deixaria o nome
 *    completo no HTML, ao alcance de quem abrisse o inspetor.
 * 2. Parceria antiga aparece como linha fechada, sem numero nenhum. Os valores
 *    vieram de planilha e ja foram acertados por fora; mostra-los criaria
 *    cobranca sobre o que ja foi pago.
 */

import { calcularComissao, type ResumoComissao, type VendaParaComissao } from './commission'
import type { Parceria } from './partnership'

/**
 * Uma venda, como o portal a recebe.
 *
 * Vem da funcao portal_vendas() (migration 017), nao da tabela: o influenciador
 * nao alcanca `coupons`. Note o que NAO existe aqui -- cpf, telefone, email,
 * numero do cupom. E o nome ja chega cortado pelo SQL.
 */
export type CupomDoPortal = VendaParaComissao & {
  primeiro_nome: string
}

export type VendaNoPortal = {
  id: string
  /** So o primeiro termo do nome. O sobrenome nunca sai do servidor. */
  primeiro_nome: string
  data: string
  /** Aprovada pelo Financeiro. So o que esta aprovado gera comissao. */
  aprovada: boolean
}

export type ParceriaNoPortal = {
  id: string
  starts_at: string
  ends_at: string | null
  encerrada: boolean
  /** Falso = linha fechada: sem vendas e sem valores. */
  visivel: boolean
  resumo: ResumoComissao | null
  vendas: VendaNoPortal[]
}

/**
 * O primeiro termo do nome, e so ele.
 *
 * "Marcos Ribeiro Silva" -> "Marcos". Nome vazio vira "Cliente": o portal
 * precisa escrever alguma coisa na linha, e inventar um vazio confunde mais do
 * que ajuda.
 */
export function primeiroNome(nome: string | null | undefined): string {
  const limpo = (nome ?? '').trim()
  if (!limpo) return 'Cliente'
  return limpo.split(/\s+/)[0]
}

/** Uma parceria e seus cupons, do jeito que o portal mostra. */
export function montarPortal(
  parcerias: (Parceria & { portal_visible: boolean })[],
  cupons: CupomDoPortal[],
  hoje: string = new Date().toISOString().slice(0, 10)
): ParceriaNoPortal[] {
  return [...parcerias]
    .sort((a, b) => b.starts_at.localeCompare(a.starts_at))
    .map((p) => {
      const encerrada = p.status !== 'ativa' || (!!p.ends_at && p.ends_at < hoje)

      // Linha fechada: sai daqui sem nenhum numero. Nao basta a tela nao
      // desenhar -- o dado nao pode nem entrar na resposta.
      if (!p.portal_visible) {
        return { id: p.id, starts_at: p.starts_at, ends_at: p.ends_at, encerrada,
                 visivel: false, resumo: null, vendas: [] }
      }

      const daParceria = cupons.filter((c) => c.partnership_id === p.id)

      const resumo = calcularComissao(
        {
          commission_per_sale: p.commission_per_sale,
          commission_starts_at: p.commission_starts_at,
          fee_amount: p.fee_amount,
          commission_counts_from: p.commission_counts_from as 'parceria' | 'historico',
          partnership_id: p.id,
        },
        daParceria
      )

      const vendas = [...daParceria]
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map((c) => ({
          id: c.id,
          // Ja vem cortado do banco. Cortar de novo nao custa nada e mantem a
          // garantia se a consulta um dia mudar.
          primeiro_nome: primeiroNome(c.primeiro_nome),
          data: c.created_at,
          aprovada: c.verified,
        }))

      return { id: p.id, starts_at: p.starts_at, ends_at: p.ends_at, encerrada,
               visivel: true, resumo, vendas }
    })
}
