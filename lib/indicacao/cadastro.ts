import { validateCPF } from '@/lib/validators/cpf'
import { validarCelular } from '@/lib/validators/telefone'
import { maiorDeIdade, IDADE_MINIMA } from '@/lib/indicacao/regras'

/**
 * A validação do formulário do Programa de Indicação, separada da rota.
 *
 * Vive aqui, e não dentro de `app/api/indicacao/cadastro/route.ts`, para ser
 * testável sem subir o Next e sem tocar no banco. A rota chama esta função
 * antes de qualquer escrita.
 */

export const SEXOS = ['F', 'M', 'outro'] as const
export type Sexo = (typeof SEXOS)[number]

export const SENHA_MINIMA = 8

export type DadosDeCadastro = {
  nome: string
  /** Só dígitos. */
  cpf: string
  /** Só dígitos, sem o +55. */
  telefone: string
  sexo: Sexo
  /** ISO curto, YYYY-MM-DD. */
  dataNascimento: string
  senha: string
  aceiteComunicacoes: boolean
}

export type ResultadoDaValidacao =
  | { ok: true; dados: DadosDeCadastro }
  | { ok: false; erro: string }

function texto(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

/**
 * Uma recusa por vez, na ordem em que a pessoa preenche o formulário.
 *
 * Devolver a primeira é de propósito: a tela já valida campo a campo, e a lista
 * inteira aqui só apareceria para quem driblou a tela — para esse, uma frase
 * basta.
 *
 * O aceite dos TERMOS é obrigatório; o de COMUNICAÇÕES não, e ausente vale
 * como false. Exigir consentimento de publicidade para participar tornaria o
 * consentimento não-livre, e sob a LGPD um consentimento não-livre não vale.
 */
export function validarCadastro(body: unknown, hoje: Date = new Date()): ResultadoDaValidacao {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, erro: 'Envie os dados do cadastro.' }
  }

  const b = body as Record<string, unknown>

  const nome = texto(b.nome).trim()
  if (nome.length < 3) return { ok: false, erro: 'Informe seu nome completo.' }

  const cpf = texto(b.cpf).replace(/\D/g, '')
  if (!validateCPF(cpf)) return { ok: false, erro: 'CPF inválido.' }

  const dataNascimento = texto(b.data_nascimento).slice(0, 10)
  if (!maiorDeIdade(dataNascimento, hoje)) {
    return {
      ok: false,
      erro: `É preciso ter ${IDADE_MINIMA} anos para participar do programa.`,
    }
  }

  const fone = validarCelular(texto(b.telefone))
  if (!fone.ok) return { ok: false, erro: fone.motivo }

  const sexo = texto(b.sexo)
  if (!(SEXOS as readonly string[]).includes(sexo)) {
    return { ok: false, erro: 'Selecione uma opção no campo sexo.' }
  }

  const senha = texto(b.senha)
  if (senha.length < SENHA_MINIMA) {
    return { ok: false, erro: `A senha precisa de pelo menos ${SENHA_MINIMA} caracteres.` }
  }

  if (b.aceite_termos !== true) {
    return { ok: false, erro: 'É preciso aceitar os termos do programa para participar.' }
  }

  return {
    ok: true,
    dados: {
      nome,
      cpf,
      telefone: fone.digitos,
      sexo: sexo as Sexo,
      dataNascimento,
      senha,
      aceiteComunicacoes: b.aceite_comunicacoes === true,
    },
  }
}
