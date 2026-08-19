/**
 * Valor por extenso, do jeito que se escreve em contrato.
 *
 * Existe porque escrever "quinhentos reais" a mao e onde nasce divergencia
 * entre numero e texto -- e quando os dois discordam, e o extenso que costuma
 * prevalecer. Gerado pelo sistema, os dois nunca discordam.
 *
 * Modulo puro, sem dependencia.
 */

const ATE_DEZENOVE = [
  'zero', 'um', 'dois', 'tres', 'quatro', 'cinco', 'seis', 'sete', 'oito',
  'nove', 'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis',
  'dezessete', 'dezoito', 'dezenove',
]

const DEZENAS = [
  '', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta',
  'oitenta', 'noventa',
]

const CENTENAS = [
  '', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos',
  'seiscentos', 'setecentos', 'oitocentos', 'novecentos',
]

/** 1 a 999. */
function ateNovecentos(n: number): string {
  if (n < 20) return ATE_DEZENOVE[n]
  if (n < 100) {
    const d = Math.floor(n / 10)
    const u = n % 10
    return u === 0 ? DEZENAS[d] : `${DEZENAS[d]} e ${ATE_DEZENOVE[u]}`
  }
  if (n === 100) return 'cem'
  const c = Math.floor(n / 100)
  const resto = n % 100
  return resto === 0 ? CENTENAS[c] : `${CENTENAS[c]} e ${ateNovecentos(resto)}`
}

/**
 * O "e" entre grupos segue o uso, nao a matematica: "mil e quinhentos", mas
 * "mil duzentos e trinta e quatro". Entra quando o resto e menor que cem ou e
 * centena redonda.
 */
function juntar(grupo: string, resto: number, textoResto: string): string {
  if (resto === 0) return grupo
  const usaE = resto < 100 || resto % 100 === 0
  return `${grupo}${usaE ? ' e ' : ' '}${textoResto}`
}

function inteiroPorExtenso(n: number): string {
  if (n === 0) return 'zero'
  if (n < 1000) return ateNovecentos(n)

  if (n < 1_000_000) {
    const milhares = Math.floor(n / 1000)
    const resto = n % 1000
    const grupo = milhares === 1 ? 'mil' : `${ateNovecentos(milhares)} mil`
    return juntar(grupo, resto, ateNovecentos(resto))
  }

  const milhoes = Math.floor(n / 1_000_000)
  const resto = n % 1_000_000
  const grupo = milhoes === 1 ? 'um milhao' : `${ateNovecentos(milhoes)} milhoes`
  return juntar(grupo, resto, inteiroPorExtenso(resto))
}

/**
 * "quinhentos reais", "tres mil reais", "um real e cinquenta centavos".
 *
 * Arredonda para centavos antes de escrever: um valor com fracao de centavo
 * geraria um extenso que nao bate com o numero impresso ao lado.
 */
export function porExtenso(valor: number): string {
  const negativo = valor < 0
  const centavosTotais = Math.round(Math.abs(valor) * 100)
  const reais = Math.floor(centavosTotais / 100)
  const centavos = centavosTotais % 100

  const partes: string[] = []
  if (reais > 0 || centavos === 0) {
    partes.push(`${inteiroPorExtenso(reais)} ${reais === 1 ? 'real' : 'reais'}`)
  }
  if (centavos > 0) {
    partes.push(`${inteiroPorExtenso(centavos)} ${centavos === 1 ? 'centavo' : 'centavos'}`)
  }

  const texto = partes.join(' e ')
  return negativo ? `menos ${texto}` : texto
}
