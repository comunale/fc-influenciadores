/**
 * Validação de celular brasileiro.
 *
 * Existe por causa de três números quebrados que entraram em 08 e 09/10/2026.
 * A causa foi `formatPhone`, que fazia `slice(0, 11)`: quem digitava com o
 * código do país -- `+55 19 99999-9999`, 13 dígitos -- tinha o número cortado em
 * silêncio, e o resto passava na validação porque ela só exigia 10 dígitos.
 *
 * O cliente não vê erro nenhum, recebe o cupom, e o número só se revela
 * inválido quando alguém tenta chamar no WhatsApp semanas depois.
 *
 * Módulo puro: sem React e sem banco.
 */

/** DDDs que existem no Brasil. O que não está aqui não existe. */
const DDDS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19,
  21, 22, 24, 27, 28,
  31, 32, 33, 34, 35, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48, 49,
  51, 53, 54, 55,
  61, 62, 63, 64, 65, 66, 67, 68, 69,
  71, 73, 74, 75, 77, 79,
  81, 82, 83, 84, 85, 86, 87, 88, 89,
  91, 92, 93, 94, 95, 96, 97, 98, 99,
])

export type Celular =
  | { ok: true; digitos: string; ddd: number }
  | { ok: false; motivo: string; digitos: string }

/**
 * Normaliza e valida um celular.
 *
 * Aceita o que a pessoa digitar: com ou sem máscara, com ou sem o +55. O que
 * NÃO aceita é fixo e número fora do padrão -- o cupom é entregue e cobrado por
 * WhatsApp, então telefone que não recebe mensagem não serve.
 */
export function validarCelular(entrada: string): Celular {
  let d = (entrada ?? '').replace(/\D/g, '')

  // Código do país: só tira se o que sobrar for um celular completo. Tirar
  // sempre quebraria o DDD 55 (Santa Maria), que começa com os mesmos dígitos.
  if (d.length === 13 && d.startsWith('55')) d = d.slice(2)
  if (d.length === 12 && d.startsWith('55')) d = d.slice(2)

  if (d.length === 0) return { ok: false, motivo: 'Informe seu WhatsApp com DDD.', digitos: d }

  if (d.length < 11) {
    return {
      ok: false,
      digitos: d,
      motivo: d.length === 10
        ? 'Faltou o 9 do celular. Use DDD + 9 + os 8 números.'
        : 'Número incompleto. Use DDD + 9 + os 8 números.',
    }
  }

  if (d.length > 11) {
    return { ok: false, digitos: d, motivo: 'Número com dígitos demais. Use DDD + 9 + os 8 números.' }
  }

  const ddd = Number(d.slice(0, 2))
  if (!DDDS.has(ddd)) {
    return { ok: false, digitos: d, motivo: `DDD ${d.slice(0, 2)} não existe. Confira os dois primeiros números.` }
  }

  // Celular brasileiro sempre tem 9 depois do DDD. Fixo não recebe WhatsApp.
  if (d[2] !== '9') {
    return { ok: false, digitos: d, motivo: 'Precisa ser um celular, com o 9 depois do DDD.' }
  }

  // Todos os dígitos iguais depois do DDD: 99999999999 e companhia.
  if (/^(\d)\1+$/.test(d.slice(2))) {
    return { ok: false, digitos: d, motivo: 'Esse número não parece real. Confira.' }
  }

  return { ok: true, digitos: d, ddd }
}

/**
 * Máscara para digitação: `(19) 99999-9999`.
 *
 * NÃO corta em 11 como a versão antiga fazia -- cortar em silêncio foi
 * exatamente o que produziu número inválido sem ninguém perceber. Quem digitar
 * o +55 vê o número inteiro, e a validação resolve.
 */
export function mascaraCelular(valor: string): string {
  let d = (valor ?? '').replace(/\D/g, '')
  if (d.length === 13 && d.startsWith('55')) d = d.slice(2)
  if (d.length > 11) d = d.slice(0, 11)

  if (d.length <= 2) return d
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

/** Onde fica cada DDD. Serve para priorizar atendimento: a loja é presencial. */
const REGIOES: Record<number, string> = {
  11: 'São Paulo capital', 12: 'São José dos Campos', 13: 'Santos', 14: 'Bauru',
  15: 'Sorocaba', 16: 'Ribeirão Preto', 17: 'São José do Rio Preto',
  18: 'Presidente Prudente', 19: 'Campinas',
  21: 'Rio de Janeiro', 22: 'Campos (RJ)', 24: 'Volta Redonda',
  27: 'Vitória', 28: 'Cachoeiro de Itapemirim',
  31: 'Belo Horizonte', 32: 'Juiz de Fora', 33: 'Governador Valadares',
  34: 'Uberlândia', 35: 'Poços de Caldas', 37: 'Divinópolis', 38: 'Montes Claros',
  41: 'Curitiba', 42: 'Ponta Grossa', 43: 'Londrina', 44: 'Maringá',
  45: 'Foz do Iguaçu', 46: 'Pato Branco', 47: 'Joinville', 48: 'Florianópolis',
  49: 'Chapecó', 51: 'Porto Alegre', 53: 'Pelotas', 54: 'Caxias do Sul',
  55: 'Santa Maria (RS)',
  61: 'Brasília', 62: 'Goiânia', 63: 'Palmas', 64: 'Rio Verde', 65: 'Cuiabá',
  66: 'Rondonópolis', 67: 'Campo Grande', 68: 'Rio Branco', 69: 'Porto Velho',
  71: 'Salvador', 73: 'Itabuna', 74: 'Juazeiro (BA)', 75: 'Feira de Santana',
  77: 'Barreiras', 79: 'Aracaju',
  81: 'Recife', 82: 'Maceió', 83: 'João Pessoa', 84: 'Natal', 85: 'Fortaleza',
  86: 'Teresina', 87: 'Petrolina', 88: 'Juazeiro do Norte', 89: 'Picos',
  91: 'Belém', 92: 'Manaus', 93: 'Santarém', 94: 'Marabá', 95: 'Boa Vista',
  96: 'Macapá', 97: 'Coari', 98: 'São Luís', 99: 'Imperatriz',
}

/**
 * A cidade do DDD, para a lista de atendimento.
 *
 * NÃO é onde a pessoa mora: gente muda de cidade e mantém o número. É pista,
 * não endereço -- e vale dizer isso a quem for usar a lista. Em 10/10/2026, dos
 * 35 cupons de uma influenciadora, 19 DDDs diferentes e só 2 da cidade da loja:
 * audiência nacional para uma oferta que exige ir à loja.
 */
export function regiaoDoDDD(telefone: string): string {
  const d = (telefone ?? '').replace(/\D/g, '')
  if (d.length < 2) return '—'
  return REGIOES[Number(d.slice(0, 2))] ?? 'outra região'
}
