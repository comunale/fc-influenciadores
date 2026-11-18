import { describe, test, expect } from 'vitest'
import { validarCadastro } from '@/lib/indicacao/cadastro'

/** Um corpo válido, do qual cada caso estraga um campo. */
function corpo(troca: Record<string, unknown> = {}) {
  return {
    nome: 'Maria Aparecida Souza',
    cpf: '123.456.789-09',
    telefone: '(11) 98888-7777',
    sexo: 'F',
    data_nascimento: '1990-05-20',
    senha: 'segredo123',
    aceite_termos: true,
    aceite_comunicacoes: false,
    ...troca,
  }
}

const HOJE = new Date('2026-11-18T12:00:00Z')

describe('validarCadastro', () => {
  test('corpo completo passa e devolve CPF e telefone so com digitos', () => {
    const r = validarCadastro(corpo(), HOJE)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.dados).toEqual({
      nome: 'Maria Aparecida Souza',
      cpf: '12345678909',
      telefone: '11988887777',
      sexo: 'F',
      dataNascimento: '1990-05-20',
      senha: 'segredo123',
      aceiteComunicacoes: false,
    })
  })

  test('nome curto e recusado', () => {
    const r = validarCadastro(corpo({ nome: 'Jo' }), HOJE)
    expect(r).toEqual({ ok: false, erro: 'Informe seu nome completo.' })
  })

  test('CPF invalido e recusado', () => {
    const r = validarCadastro(corpo({ cpf: '111.111.111-11' }), HOJE)
    expect(r).toEqual({ ok: false, erro: 'CPF inválido.' })
  })

  test('menor de 18 e recusado, dizendo a idade', () => {
    const r = validarCadastro(corpo({ data_nascimento: '2010-01-01' }), HOJE)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.erro).toContain('18 anos')
  })

  test('quem faz 18 anos hoje passa', () => {
    const r = validarCadastro(corpo({ data_nascimento: '2008-11-18' }), HOJE)
    expect(r.ok).toBe(true)
  })

  test('telefone quebrado e recusado com o motivo do validador', () => {
    const r = validarCadastro(corpo({ telefone: '119999999' }), HOJE)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.erro).toMatch(/celular|DDD|d[ií]gitos/i)
  })

  test('sexo fora da lista e recusado', () => {
    const r = validarCadastro(corpo({ sexo: 'X' }), HOJE)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.erro).toMatch(/sexo/i)
  })

  test('senha curta e recusada dizendo o minimo', () => {
    const r = validarCadastro(corpo({ senha: '1234567' }), HOJE)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.erro).toContain('8')
  })

  test('sem aceite dos termos e recusado', () => {
    const r = validarCadastro(corpo({ aceite_termos: false }), HOJE)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.erro).toMatch(/termos/i)
  })

  test('aceite dos termos ausente e recusado como se fosse false', () => {
    const sem = corpo()
    delete (sem as Record<string, unknown>).aceite_termos
    const r = validarCadastro(sem, HOJE)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.erro).toMatch(/termos/i)
  })

  test('aceite de comunicacoes ausente vira false, e nao recusa', () => {
    const sem = corpo()
    delete (sem as Record<string, unknown>).aceite_comunicacoes
    const r = validarCadastro(sem, HOJE)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.dados.aceiteComunicacoes).toBe(false)
  })

  test('corpo que nao e objeto e recusado em vez de estourar', () => {
    expect(validarCadastro(null, HOJE).ok).toBe(false)
    expect(validarCadastro('oi', HOJE).ok).toBe(false)
    expect(validarCadastro(undefined, HOJE).ok).toBe(false)
  })

  test('nome com espacos sobrando e aparado', () => {
    const r = validarCadastro(corpo({ nome: '  Maria Aparecida Souza  ' }), HOJE)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.dados.nome).toBe('Maria Aparecida Souza')
  })
})
