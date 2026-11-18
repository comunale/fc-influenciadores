import { generateCouponNumber } from '@/lib/utils'

/**
 * As regras do Programa de Indicação que não precisam de banco.
 *
 * Spec: docs/superpowers/specs/2026-11-17-programa-de-indicacao-design.md
 *
 * Moram aqui, e não nas rotas, porque são as decisões que o César tomou e as
 * únicas partes testáveis sem subir Postgres.
 */

/** O domínio dos e-mails sintéticos. Não recebe e-mail: é só identidade. */
const DOMINIO_SINTETICO = 'indicador.foxcycles.com.br'

export const IDADE_MINIMA = 18

/**
 * O e-mail que o indicador tem no Supabase Auth.
 *
 * O formulário pede CPF e senha, não e-mail -- e disparo por e-mail está fora
 * deste projeto por decisão do César. Mas o Auth exige um identificador com
 * forma de e-mail, então o CPF vira um. Ninguém escreve para este endereço: a
 * recuperação de senha é manual, por marketing@foxcycles.com.br.
 */
export function emailSinteticoDoCpf(cpf: string): string {
  return `${cpf.replace(/\D/g, '')}@${DOMINIO_SINTETICO}`
}

/**
 * Tem 18 anos completos.
 *
 * Compara datas CIVIS (ano, mês, dia) como número, de propósito: fazer
 * `new Date('2008-11-18')` -- que o JavaScript lê em UTC -- e comparar com um
 * `hoje` local erra por um dia no Brasil, e erra exatamente em quem faz
 * aniversário hoje, que é o caso que decide.
 */
export function maiorDeIdade(dataNascimento: string, hoje: Date = new Date()): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dataNascimento)
  if (!m) return false

  const nascimento = Number(m[1]) * 10000 + Number(m[2]) * 100 + Number(m[3])
  const limite =
    (hoje.getFullYear() - IDADE_MINIMA) * 10000 + (hoje.getMonth() + 1) * 100 + hoje.getDate()

  return nascimento <= limite
}

/** O código do link dela: /i/IND-XXXXXX. Mesmo alfabeto dos cupons. */
export function gerarCodigoDeIndicacao(): string {
  return generateCouponNumber('IND')
}

/**
 * Bateu o teto. Teto nulo = sem teto, e é como o cadastro nasce (decisão 15).
 *
 * Atinge no IGUAL: teto 10 com 10 usos já está cheio. Se fosse só no maior, a
 * pessoa conseguiria o 11º.
 */
export function tetoAtingido(usos: number, teto: number | null): boolean {
  if (teto === null) return false
  return usos >= teto
}

export type CupomDoIndicador = {
  status: string
  verified: boolean
  commission_per_sale: number | null
}

export type ResumoDoIndicador = {
  /** Cupons gerados pelo link dela. */
  cupons: number
  /** Vendas que aconteceram -- é o que o teto conta. */
  usos: number
  /** Vendas com nota fiscal conferida -- é o que vira prêmio. */
  premiados: number
  /** Soma dos prêmios conferidos, em reais. */
  aReceber: number
}

/**
 * O que a pessoa vê no painel, e o que o César exporta.
 *
 * `usos` e `aReceber` contam coisas diferentes de propósito: o prêmio só entra
 * depois de o Financeiro conferir a NF (decisão do César, 18/11), mas o teto
 * conta a venda, que é anterior. Somar os dois na mesma conta pagaria venda não
 * conferida ou deixaria de travar venda já feita.
 *
 * O valor vem de `commission_per_sale` do próprio cupom, que é o retrato do que
 * o programa valia quando aquele cupom nasceu -- não de um 200 fixo no código.
 */
export function resumoDoIndicador(cupons: CupomDoIndicador[]): ResumoDoIndicador {
  const usados = cupons.filter((c) => c.status === 'used')
  const premiados = usados.filter((c) => c.verified)

  return {
    cupons: cupons.length,
    usos: usados.length,
    premiados: premiados.length,
    aReceber: premiados.reduce((soma, c) => soma + (c.commission_per_sale ?? 0), 0),
  }
}

/**
 * Uma linha como a função `indicacao_minhas_indicacoes()` devolve.
 *
 * O nome da coluna de prêmio é `premio` no SQL e `commission_per_sale` no
 * cupom. O adaptador abaixo existe para que uma renomeação no banco quebre um
 * TESTE, e não a tela: a falha silenciosa aqui seria a área da pessoa mostrar
 * R$ 0 a receber, que é o pior jeito de descobrir.
 */
export type LinhaDaIndicacao = {
  coupon_number: string
  primeiro_nome: string
  status: string
  verified: boolean
  premio: number | null
  criado_em: string
  usado_em: string | null
}

export function resumoDasIndicacoes(linhas: LinhaDaIndicacao[]): ResumoDoIndicador {
  return resumoDoIndicador(
    linhas.map((l) => ({
      status: l.status,
      verified: l.verified,
      commission_per_sale: l.premio,
    }))
  )
}
