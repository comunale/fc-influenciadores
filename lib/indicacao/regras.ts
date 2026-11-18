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

/** Onde a loja fica, e portanto onde "hoje" acontece. */
const FUSO_DA_LOJA = 'America/Sao_Paulo'

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

/** Só os dígitos, ou string vazia. */
function digitos(v: string | null | undefined): string {
  return (v ?? '').replace(/\D/g, '')
}

/**
 * Dois CPFs são a mesma pessoa?
 *
 * Compara DÍGITOS, nunca texto. A ficha do influenciador guarda o CPF como o
 * portal recebeu, sem máscara nenhuma, então `'123.456.789-09'` e
 * `'12345678909'` convivem na mesma coluna. Em 18/11/2026 a trava que impede um
 * influenciador com parceria de entrar no programa comparava texto cru: quem
 * tivesse digitado o CPF com pontos passava batido, e ninguém era avisado.
 *
 * CPF precisa ter 11 dígitos para casar: `mesmoCpf('abc','abc')` é falso, e não
 * verdadeiro por as duas strings serem iguais depois de virarem vazias.
 */
export function mesmoCpf(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = digitos(a)
  const y = digitos(b)
  return x.length === 11 && x === y
}

/**
 * Tem 18 anos completos, pelo calendário de onde a loja está.
 *
 * Compara datas CIVIS (ano, mês, dia) como número: fazer
 * `new Date('2008-11-18')` -- que o JavaScript lê em UTC -- e comparar com um
 * `hoje` local erra por um dia, e erra exatamente em quem faz aniversário hoje.
 *
 * E o "hoje" é resolvido em `America/Sao_Paulo`, não no fuso do servidor. O
 * runtime da Vercel é UTC, que depois das 21h no Brasil já está no dia
 * seguinte: sem isto, quem faz 18 anos AMANHÃ se cadastra hoje à noite.
 */
export function maiorDeIdade(dataNascimento: string, hoje: Date = new Date()): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dataNascimento)
  if (!m) return false

  // en-CA dá YYYY-MM-DD, que é exatamente a forma que se compara como número.
  const hojeNaLoja = new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO_DA_LOJA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(hoje)

  const [ano, mes, dia] = hojeNaLoja.split('-').map(Number)

  const nascimento = Number(m[1]) * 10000 + Number(m[2]) * 100 + Number(m[3])
  const limite = (ano - IDADE_MINIMA) * 10000 + mes * 100 + dia

  return nascimento <= limite
}

/** O código do link dela: /i/IND-XXXXXX. Mesmo alfabeto dos cupons. */
export function gerarCodigoDeIndicacao(): string {
  return generateCouponNumber('IND')
}

/**
 * Para onde mandar a pessoa depois do login, sem deixar ninguém escolher.
 *
 * `?next=` sem validação numa tela de login é redirecionamento aberto. Na porta
 * do Programa de Indicação isso é pior que de costume: o link é divulgado por
 * WhatsApp, então um endereço legítimo da FOX, com TLS da FOX e formulário de
 * verdade, pode largar a pessoa logada numa página que pede dado bancário "para
 * receber o prêmio".
 *
 * Só caminho interno passa: começa com uma barra, e não com duas (que é
 * endereço de outro site), nem com barra invertida (que alguns navegadores
 * normalizam para duas).
 */
export function destinoSeguro(next: string | null | undefined, padrao: string): string {
  const bruto = (next ?? '').trim()
  if (!bruto.startsWith('/')) return padrao
  if (bruto.startsWith('//') || bruto.startsWith('/\\')) return padrao
  return bruto
}

/**
 * Bateu o teto. Teto nulo = sem teto, e é como o cadastro nasce (decisão 15).
 *
 * Atinge no IGUAL: teto 10 com 10 na fila já está cheio. Se fosse só no maior, a
 * pessoa conseguiria o 11º.
 */
export function tetoAtingido(naFila: number, teto: number | null): boolean {
  if (teto === null) return false
  return naFila >= teto
}

export type CupomDoIndicador = {
  status: string
  verified: boolean
  commission_per_sale: number | null
  /** Quando o César pagou o prêmio deste cupom. Nulo = ainda deve. */
  premiado_em: string | null
}

export type ResumoDoIndicador = {
  /** Cupons gerados pelo link dela, de qualquer status. */
  cupons: number
  /**
   * Cupons VIVOS: pendentes ou já usados. É o que o teto conta.
   *
   * Contar só os usados foi um defeito achado na revisão de 18/11: cupom nasce
   * `pending`, então gerar cupom não movia o número que o teto olhava. Com teto
   * 10, duzentos cupons pendentes passavam, e os duzentos viravam venda depois
   * — R$ 40.000 contra um limite de R$ 2.000.
   */
  naFila: number
  /** Vendas que aconteceram. */
  usos: number
  /** Vendas com nota fiscal conferida: é o que vira prêmio. */
  premiados: number
  /** Soma dos prêmios conferidos e AINDA NÃO pagos, em reais. */
  aReceber: number
  /** Soma dos prêmios que o César já pagou, em reais. */
  jaPremiado: number
}

/** Cupom que ainda ocupa lugar: morto (expirado, cancelado) não ocupa. */
const VIVOS = new Set(['pending', 'used'])

/**
 * O que a pessoa vê no painel, e o que o César exporta.
 *
 * Três contas diferentes de propósito:
 *
 *  - `naFila` é o que o teto limita, e conta ANTES da venda: é o compromisso
 *    que a FOX já assumiu ao deixar o cupom nascer.
 *  - `usos` é a venda feita.
 *  - `aReceber` só conta venda com NF conferida (decisão do César, 18/11) e
 *    AINDA NÃO paga. Sem o `premiado_em`, uma venda paga em novembro voltava a
 *    somar em dezembro e a pessoa pedia o dinheiro de novo.
 *
 * O valor vem de `commission_per_sale` do próprio cupom, que é o retrato do que
 * o programa valia quando aquele cupom nasceu -- não de um 200 fixo no código.
 */
export function resumoDoIndicador(cupons: CupomDoIndicador[]): ResumoDoIndicador {
  const usados = cupons.filter((c) => c.status === 'used')
  const premiados = usados.filter((c) => c.verified)
  const soma = (lista: CupomDoIndicador[]) =>
    lista.reduce((s, c) => s + (c.commission_per_sale ?? 0), 0)

  return {
    cupons: cupons.length,
    naFila: cupons.filter((c) => VIVOS.has(c.status)).length,
    usos: usados.length,
    premiados: premiados.length,
    aReceber: soma(premiados.filter((c) => c.premiado_em === null)),
    jaPremiado: soma(premiados.filter((c) => c.premiado_em !== null)),
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
  premiado_em: string | null
  criado_em: string
  usado_em: string | null
}

export function resumoDasIndicacoes(linhas: LinhaDaIndicacao[]): ResumoDoIndicador {
  return resumoDoIndicador(
    linhas.map((l) => ({
      status: l.status,
      verified: l.verified,
      commission_per_sale: l.premio,
      premiado_em: l.premiado_em,
    }))
  )
}
