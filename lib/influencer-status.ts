import { parceriaVigente, type Parceria } from './partnership'

/**
 * Quando o link do influenciador abre.
 *
 * A regra mudou de dono duas vezes, e vale saber por quê:
 *  - até 18/08/2026 dependia da CAMPANHA, o que derrubava todos os
 *    influenciadores dela de uma vez -- naquele dia deixou 17 de 18 links
 *    mortos, com todos marcados como ativos e nada na tela explicando;
 *  - depois passou a depender do influenciador;
 *  - agora depende da PARCERIA, que é onde o prazo realmente vive.
 *
 * A checagem acontece quando alguém abre o link. Não depende de rotina agendada.
 */
export function linkAtivo(inf: { active: boolean }, parceria: Parceria | null): boolean {
  return inf.active && parceriaVigente(parceria) && contratoEmDia(parceria)
}

/**
 * O contrato foi aceito, ou esta parceria e isenta?
 *
 * Isento e o que existia antes do contrato existir: desligar link que ja esta em
 * bio e story para cobrar assinatura retroativa quebraria divulgacao no ar por
 * decisao nossa. A trava vale para link NOVO.
 *
 * Parceria sem `contract_required` definido conta como isenta -- e o caso de
 * dado antigo, e recusar link por causa de coluna ausente seria pior do que o
 * problema que a trava resolve.
 */
export function contratoEmDia(p: Parceria | null): boolean {
  if (!p) return false
  if (p.contract_required === false || p.contract_required === undefined) return true
  return !!p.contract_accepted_at
}

/** Por que o link não abre. Usado para explicar na tela do admin. */
export function motivoLinkInativo(
  inf: { active: boolean },
  parceria: Parceria | null
): string | null {
  if (!inf.active) return 'Influencer inativo'
  if (!parceria) return 'Sem parceria'
  if (parceria.status !== 'ativa') return 'Parceria encerrada'
  if (parceria.ends_at && parceria.ends_at < new Date().toISOString().slice(0, 10)) {
    return 'Parceria vencida'
  }
  if (!contratoEmDia(parceria)) return 'Contrato não aceito'
  return null
}

/**
 * A parceria vence nos próximos `dias`?
 *
 * Vive aqui, e não na página, porque `Date.now()` durante a renderização de um
 * Server Component é barrado pela regra de função impura do React.
 */
export function venceEmAte(p: Parceria | null, dias: number): boolean {
  if (!p?.ends_at || p.status !== 'ativa') return false
  const hoje = new Date()
  const limite = new Date(hoje.getTime() + dias * 86400000).toISOString().slice(0, 10)
  return p.ends_at >= hoje.toISOString().slice(0, 10) && p.ends_at <= limite
}
