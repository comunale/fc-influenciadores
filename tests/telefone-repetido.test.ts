import { describe, it, expect } from 'vitest'
import { telefonesSuspeitos } from '@/lib/coupons/telefone-repetido'

const c = (id: string, phone: string, cpf: string) =>
  ({ id, customer_phone: phone, customer_cpf: cpf })

describe('telefonesSuspeitos', () => {
  it('lista vazia nao acusa nada', () => {
    expect(telefonesSuspeitos([]).size).toBe(0)
  })

  it('mesmo telefone e mesmo CPF e a mesma pessoa, nao acusa', () => {
    // Acontece de verdade: a pessoa participa de duas campanhas.
    const r = telefonesSuspeitos([c('a', '19999998888', '111'), c('b', '19999998888', '111')])
    expect(r.size).toBe(0)
  })

  it('mesmo telefone com CPFs diferentes acusa os dois cupons', () => {
    // E o sinal que denuncia o vendedor que preenche pelo cliente.
    const r = telefonesSuspeitos([c('a', '19999998888', '111'), c('b', '19999998888', '222')])
    expect(r.has('a')).toBe(true)
    expect(r.has('b')).toBe(true)
  })

  it('telefones diferentes nao acusam', () => {
    const r = telefonesSuspeitos([c('a', '19999998888', '111'), c('b', '19999997777', '222')])
    expect(r.size).toBe(0)
  })

  it('telefone vazio nao acusa', () => {
    // Sem telefone nao ha sinal nenhum -- e dois vazios nao sao "o mesmo numero".
    const r = telefonesSuspeitos([c('a', '', '111'), c('b', '', '222')])
    expect(r.size).toBe(0)
  })

  it('acusa os tres quando o numero se repete tres vezes', () => {
    const r = telefonesSuspeitos([
      c('a', '19999998888', '111'),
      c('b', '19999998888', '222'),
      c('c', '19999998888', '333'),
    ])
    expect(r.size).toBe(3)
  })
})
