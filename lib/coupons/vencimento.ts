/**
 * Quando um cupom vence, e quanto falta.
 *
 * A conta de data vive aqui, e não na página, pelo mesmo motivo que
 * `venceEmAte` em lib/influencer-status.ts: chamar `new Date()` no corpo de um
 * Server Component é função impura durante a renderização.
 *
 * Existe desde 10/10/2026, quando 35 cupons da @mariannegimenes ficaram
 * pendentes ao mesmo tempo e o César precisou saber quando correr atrás.
 */

/** Os dois prazos que a tela mostra. Sete dias é urgência; quinze é aviso. */
export const JANELAS = [7, 15] as const

/**
 * O intervalo `[agora, agora + dias]` em ISO, para filtrar no banco.
 *
 * Começa em agora, e não no início do dia: cupom que já venceu não é "vencendo",
 * é vencido -- e a rotina diária já muda o status dele.
 */
export function janelaDeVencimento(dias: number, agora: Date = new Date()): {
  de: string
  ate: string
} {
  return {
    de: agora.toISOString(),
    ate: new Date(agora.getTime() + dias * 86400000).toISOString(),
  }
}

/**
 * Dias inteiros até vencer. Negativo quer dizer que já passou.
 *
 * Arredonda para cima: um cupom que vence daqui a 30 horas vence "em 2 dias"
 * para quem lê, não em 1 -- dizer menos do que se tem faz ligar para o cliente
 * antes da hora; dizer mais faz perder a venda.
 */
export function diasAteVencer(expiraEm: string, agora: Date = new Date()): number {
  return Math.ceil((new Date(expiraEm).getTime() - agora.getTime()) / 86400000)
}
