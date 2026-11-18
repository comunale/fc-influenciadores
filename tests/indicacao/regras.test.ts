import { describe, test, expect } from 'vitest'
import {
  emailSinteticoDoCpf,
  maiorDeIdade,
  gerarCodigoDeIndicacao,
  tetoAtingido,
  resumoDoIndicador,
  resumoDasIndicacoes,
} from '@/lib/indicacao/regras'

describe('emailSinteticoDoCpf', () => {
  test('usa so os digitos do CPF', () => {
    expect(emailSinteticoDoCpf('123.456.789-09')).toBe('12345678909@indicador.foxcycles.com.br')
  })

  test('CPF ja limpo da o mesmo resultado', () => {
    expect(emailSinteticoDoCpf('12345678909')).toBe('12345678909@indicador.foxcycles.com.br')
  })
})

describe('maiorDeIdade', () => {
  test('faz 18 anos hoje: entra', () => {
    expect(maiorDeIdade('2008-11-18', new Date('2026-11-18T12:00:00Z'))).toBe(true)
  })

  test('faz 18 anos amanha: nao entra', () => {
    expect(maiorDeIdade('2008-11-19', new Date('2026-11-18T12:00:00Z'))).toBe(false)
  })

  test('faz 18 anos mes que vem: nao entra', () => {
    expect(maiorDeIdade('2008-12-01', new Date('2026-11-18T12:00:00Z'))).toBe(false)
  })

  test('adulto de sobra: entra', () => {
    expect(maiorDeIdade('1980-03-10', new Date('2026-11-18T12:00:00Z'))).toBe(true)
  })

  // O fuso do Brasil fica atras de UTC. Com new Date('2008-11-18') interpretado
  // em UTC e um `hoje` local, a conta erra por um dia justamente em quem faz
  // aniversario hoje -- que e o caso que importa.
  test('meia-noite local no dia do aniversario: entra', () => {
    expect(maiorDeIdade('2008-11-18', new Date('2026-11-18T00:30:00-03:00'))).toBe(true)
  })

  test('data vazia nao e maior de idade', () => {
    expect(maiorDeIdade('', new Date('2026-11-18T12:00:00Z'))).toBe(false)
  })
})

describe('gerarCodigoDeIndicacao', () => {
  test('comeca com IND- e tem 6 caracteres depois', () => {
    expect(gerarCodigoDeIndicacao()).toMatch(/^IND-[A-HJ-NP-Z2-9]{6}$/)
  })

  test('dois codigos seguidos nao sao iguais', () => {
    expect(gerarCodigoDeIndicacao()).not.toBe(gerarCodigoDeIndicacao())
  })
})

describe('tetoAtingido', () => {
  test('teto nulo nunca atinge', () => {
    expect(tetoAtingido(999, null)).toBe(false)
  })

  test('atinge no igual, nao so no maior', () => {
    expect(tetoAtingido(10, 10)).toBe(true)
    expect(tetoAtingido(9, 10)).toBe(false)
  })

  test('passou do teto tambem atinge', () => {
    expect(tetoAtingido(11, 10)).toBe(true)
  })
})

describe('resumoDoIndicador', () => {
  test('usos conta used; a receber conta used E verified', () => {
    const r = resumoDoIndicador([
      { status: 'used', verified: true, commission_per_sale: 200 },
      { status: 'used', verified: false, commission_per_sale: 200 },
      { status: 'pending', verified: false, commission_per_sale: 200 },
    ])
    expect(r).toEqual({ cupons: 3, usos: 2, premiados: 1, aReceber: 200 })
  })

  test('a receber soma o valor gravado no cupom, nao um 200 fixo', () => {
    const r = resumoDoIndicador([{ status: 'used', verified: true, commission_per_sale: 150 }])
    expect(r.aReceber).toBe(150)
  })

  test('premio nulo conta como zero e nao como NaN', () => {
    const r = resumoDoIndicador([{ status: 'used', verified: true, commission_per_sale: null }])
    expect(r.aReceber).toBe(0)
    expect(r.premiados).toBe(1)
  })

  test('lista vazia da tudo zero', () => {
    expect(resumoDoIndicador([])).toEqual({ cupons: 0, usos: 0, premiados: 0, aReceber: 0 })
  })

  // Um cupom conferido que ainda nao foi usado nao existe no fluxo, mas se
  // existir nao pode ser premiado: o premio e por venda, e a venda e o uso.
  test('verified sem used nao e premiado', () => {
    const r = resumoDoIndicador([
      { status: 'cancelled', verified: true, commission_per_sale: 200 },
    ])
    expect(r).toEqual({ cupons: 1, usos: 0, premiados: 0, aReceber: 0 })
  })
})

describe('resumoDasIndicacoes', () => {
  function linha(over: Record<string, unknown> = {}) {
    return {
      coupon_number: 'FOX-AAAAAA',
      primeiro_nome: 'Jose',
      status: 'used',
      verified: true,
      premio: 200,
      criado_em: '2026-11-18T12:00:00Z',
      usado_em: '2026-11-18T13:00:00Z',
      ...over,
    }
  }

  // Se a coluna `premio` do SQL for renomeada, este teste quebra. Sem ele, a
  // area da pessoa passaria a mostrar R$ 0 a receber, calada.
  test('le o premio da coluna premio, nao de commission_per_sale', () => {
    expect(resumoDasIndicacoes([linha()]).aReceber).toBe(200)
  })

  test('mesma regra do resumo: usos conta used, a receber conta used E verified', () => {
    const r = resumoDasIndicacoes([
      linha(),
      linha({ verified: false }),
      linha({ status: 'pending', verified: false, usado_em: null }),
    ])
    expect(r).toEqual({ cupons: 3, usos: 2, premiados: 1, aReceber: 200 })
  })

  test('lista vazia da tudo zero', () => {
    expect(resumoDasIndicacoes([])).toEqual({ cupons: 0, usos: 0, premiados: 0, aReceber: 0 })
  })
})
