import { tetoAtingido } from '@/lib/indicacao/regras'

/**
 * O link da pessoa está valendo?
 *
 * Duas razões para não estar, e a ordem entre elas é decisão de produto:
 * quem foi encerrado pela empresa NÃO deve ouvir falar de limite. Dizer
 * "você chegou no limite de 10" a quem foi desligado manda a pessoa esperar o
 * mês virar, e ela nunca volta a gerar.
 */

export type EstadoDoIndicador = {
  ativo: boolean
  teto_usos: number | null
}

export type PodeGerar = { ok: true } | { ok: false; erro: string }

export const VALOR_DO_DESCONTO = 300
export const VALOR_DO_PREMIO = 200
export const NOME_DA_CAMPANHA = 'Programa de Indicação'

export function podeGerar(indicador: EstadoDoIndicador, usos: number): PodeGerar {
  if (!indicador.ativo) {
    return {
      ok: false,
      erro: 'Este benefício foi encerrado pela FoxCycles e o link não gera mais cupom.',
    }
  }

  if (tetoAtingido(usos, indicador.teto_usos)) {
    return {
      ok: false,
      erro: `Este link chegou ao limite de ${indicador.teto_usos} indicações usadas.`,
    }
  }

  return { ok: true }
}
