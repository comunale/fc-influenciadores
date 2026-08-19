/**
 * Preenche o modelo do contrato com os dados da parceria.
 *
 * Substituicao de texto, nao geracao. O Cesar ofereceu conectar uma IA para
 * redigir; recusamos de proposito em 19/08. A prova do aceite depende de
 * conseguirmos afirmar "este e exatamente o texto que ele aceitou", e um modelo
 * de linguagem produz variacao sutil a cada chamada -- justamente numa clausula
 * de pagamento e onde a variacao sutil vira problema.
 *
 * Modulo puro: sem banco, sem React, sem data do sistema.
 */

import { porExtenso } from './extenso'

/** O que o modelo pode citar. Achatado em `grupo.campo` na hora de trocar. */
export type DadosDoContrato = {
  influenciador?: {
    nome?: string
    cpf?: string
    estado_civil?: string
    endereco?: string
    cep?: string
    link?: string
  }
  parceria?: {
    vigencia?: string
    comissao?: number
    fee?: number
  }
  contrato?: {
    data?: string
    imagem_meses?: number
  }
}

// O toLocaleString poe um espaco NAO SEPARAVEL entre "R$" e o numero. Some numa
// tela e atrapalha em contrato: e um caractere invisivel que quebra busca,
// copia e comparacao de texto. Trocado por espaco comum.
const dinheiro = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    .replace(new RegExp(String.fromCharCode(0x00a0), 'g'), ' ')

/**
 * Achata os dados em `grupo.campo`. Valores em dinheiro viram DUAS entradas --
 * `parceria.comissao` e `parceria.comissao_extenso` -- para o modelo poder
 * escrever "R$ 500,00 (quinhentos reais)" como manda o costume.
 */
function achatar(d: DadosDoContrato): Record<string, string> {
  const m: Record<string, string> = {}

  for (const [campo, valor] of Object.entries(d.influenciador ?? {})) {
    if (valor != null && String(valor).trim() !== '') m[`influenciador.${campo}`] = String(valor)
  }

  const p = d.parceria ?? {}
  if (p.vigencia) m['parceria.vigencia'] = p.vigencia
  if (p.comissao != null) {
    m['parceria.comissao'] = dinheiro(p.comissao)
    m['parceria.comissao_extenso'] = porExtenso(p.comissao)
  }
  if (p.fee != null) {
    m['parceria.fee'] = dinheiro(p.fee)
    m['parceria.fee_extenso'] = porExtenso(p.fee)
  }

  const c = d.contrato ?? {}
  if (c.data) m['contrato.data'] = c.data
  if (c.imagem_meses != null) {
    m['contrato.imagem_meses'] = String(c.imagem_meses)
    m['contrato.imagem_meses_extenso'] = INTEIRO[c.imagem_meses] ?? String(c.imagem_meses)
  }

  return m
}

/** Meses por extenso, para "6 (seis) meses". Prazos de contrato sao curtos. */
const INTEIRO: Record<number, string> = {
  1: 'um', 2: 'dois', 3: 'tres', 4: 'quatro', 5: 'cinco', 6: 'seis',
  7: 'sete', 8: 'oito', 9: 'nove', 10: 'dez', 11: 'onze', 12: 'doze',
  18: 'dezoito', 24: 'vinte e quatro', 36: 'trinta e seis',
}

const MARCACAO = /\{\{\s*([a-z_]+\.[a-z_]+)\s*\}\}/gi

export type Preenchimento = {
  corpo: string
  /** Campos que o modelo pede e os dados nao tinham. */
  faltando: string[]
}

/**
 * Troca cada `{{grupo.campo}}` pelo valor.
 *
 * O que faltar NAO e apagado nem substituido por vazio: fica na lista
 * `faltando`, e quem chamou decide. Gerar um contrato com `{{cpf}}` sobrando no
 * meio, e um humano assinando embaixo, e o pior desfecho possivel -- pior do
 * que nao gerar.
 */
export function preencher(modelo: string, dados: DadosDoContrato): Preenchimento {
  const valores = achatar(dados)
  const faltando = new Set<string>()

  const corpo = modelo.replace(MARCACAO, (inteiro, campo: string) => {
    const chave = campo.toLowerCase()
    if (chave in valores) return valores[chave]
    faltando.add(chave)
    return inteiro
  })

  return { corpo, faltando: [...faltando].sort() }
}

/** Os campos que um modelo cita, para a tela listar o que ele precisa. */
export function camposDoModelo(modelo: string): string[] {
  const achados = new Set<string>()
  for (const m of modelo.matchAll(MARCACAO)) achados.add(m[1].toLowerCase())
  return [...achados].sort()
}
