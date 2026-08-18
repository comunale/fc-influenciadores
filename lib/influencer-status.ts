/**
 * Quando o link do influenciador abre.
 *
 * Ate 18/08/2026 dependia da CAMPANHA estar ativa, o que derrubava todos os
 * influenciadores dela de uma vez. Naquele dia isso deixou 17 de 18 links
 * mortos, com todo mundo marcado como ativo e nada na tela indicando o motivo.
 *
 * Agora depende so do influenciador: estar ativo e dentro do prazo. A checagem
 * acontece na hora em que alguem abre o link -- nao depende de nenhuma rotina
 * agendada rodar.
 *
 * Vive aqui, e nao dentro da pagina, porque as rotas de criacao de cupom usam
 * a mesma regra. Duas copias divergiriam, e o link abriria num fluxo e fecharia
 * no outro.
 */
export type StatusDoLink = {
  active: boolean
  partnership_ends_at: string | null
}

export function linkAtivo(inf: StatusDoLink): boolean {
  if (!inf.active) return false
  if (!inf.partnership_ends_at) return true // sem prazo definido
  // Compara so a data: a parceria vale ate o fim do dia combinado.
  return inf.partnership_ends_at >= new Date().toISOString().slice(0, 10)
}

/** Por que o link nao abre. Usado para explicar na tela do admin. */
export function motivoLinkInativo(inf: StatusDoLink): string | null {
  if (!inf.active) return 'Influencer inativo'
  if (inf.partnership_ends_at && inf.partnership_ends_at < new Date().toISOString().slice(0, 10)) {
    return 'Parceria encerrada'
  }
  return null
}
