import { describe, test, expect } from 'vitest'
import {
  emailSinteticoDoCpf,
  maiorDeIdade,
  gerarCodigoDeIndicacao,
  tetoAtingido,
  resumoDoIndicador,
  resumoDasIndicacoes,
  mesmoCpf,
  destinoSeguro,
  type CupomDoIndicador,
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
      { status: 'used', verified: true, commission_per_sale: 200, premiado_em: null },
      { status: 'used', verified: false, commission_per_sale: 200, premiado_em: null },
      { status: 'pending', verified: false, commission_per_sale: 200, premiado_em: null },
    ])
    expect(r).toEqual({ cupons: 3, naFila: 3, usos: 2, premiados: 1, aReceber: 200, jaPremiado: 0 })
  })

  test('a receber soma o valor gravado no cupom, nao um 200 fixo', () => {
    const r = resumoDoIndicador([
      { status: 'used', verified: true, commission_per_sale: 150, premiado_em: null },
    ])
    expect(r.aReceber).toBe(150)
  })

  test('premio nulo conta como zero e nao como NaN', () => {
    const r = resumoDoIndicador([
      { status: 'used', verified: true, commission_per_sale: null, premiado_em: null },
    ])
    expect(r.aReceber).toBe(0)
    expect(r.premiados).toBe(1)
  })

  test('lista vazia da tudo zero', () => {
    expect(resumoDoIndicador([])).toEqual({
      cupons: 0, naFila: 0, usos: 0, premiados: 0, aReceber: 0, jaPremiado: 0,
    })
  })

  // Um cupom conferido que ainda nao foi usado nao existe no fluxo, mas se
  // existir nao pode ser premiado: o premio e por venda, e a venda e o uso.
  test('verified sem used nao e premiado', () => {
    const r = resumoDoIndicador([
      { status: 'cancelled', verified: true, commission_per_sale: 200, premiado_em: null },
    ])
    expect(r).toEqual({ cupons: 1, naFila: 0, usos: 0, premiados: 0, aReceber: 0, jaPremiado: 0 })
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
      premiado_em: null,
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
    expect(r).toEqual({ cupons: 3, naFila: 3, usos: 2, premiados: 1, aReceber: 200, jaPremiado: 0 })
  })

  test('lista vazia da tudo zero', () => {
    expect(resumoDasIndicacoes([])).toEqual({
      cupons: 0, naFila: 0, usos: 0, premiados: 0, aReceber: 0, jaPremiado: 0,
    })
  })
})

// ---------------------------------------------------------------------------
// Achados da revisão de 18/11/2026. Cada teste abaixo reproduz um defeito que
// a revisão independente encontrou, e que os testes anteriores não pegavam.
// ---------------------------------------------------------------------------

describe('o prêmio já pago não volta a aparecer como a receber (crítico 1)', () => {
  function cupom(over: Partial<CupomDoIndicador> = {}): CupomDoIndicador {
    return { status: 'used', verified: true, commission_per_sale: 200, premiado_em: null, ...over }
  }

  test('o que foi premiado sai de aReceber e entra em jaPremiado', () => {
    const r = resumoDoIndicador([
      cupom({ premiado_em: '2026-11-30T12:00:00Z' }),
      cupom(),
    ])
    expect(r.aReceber).toBe(200)
    expect(r.jaPremiado).toBe(200)
    expect(r.premiados).toBe(2)
  })

  // O defeito exato: cinco vendas pagas em novembro voltavam a somar em
  // dezembro, e a pessoa pedia o dinheiro de novo.
  test('tudo premiado: aReceber zera', () => {
    const r = resumoDoIndicador([
      cupom({ premiado_em: '2026-11-30T12:00:00Z' }),
      cupom({ premiado_em: '2026-11-30T12:00:00Z' }),
    ])
    expect(r.aReceber).toBe(0)
    expect(r.jaPremiado).toBe(400)
  })
})

describe('o teto conta a fila, não só a venda feita (crítico 3)', () => {
  function cupom(status: string): CupomDoIndicador {
    return { status, verified: false, commission_per_sale: 200, premiado_em: null }
  }

  // O defeito exato: cupom nasce 'pending', entao gerar cupom nao movia o
  // numero que o teto olhava -- 200 cupons pendentes passavam por um teto de 10,
  // e todos viravam venda depois.
  test('pendente conta na fila do teto; usado também', () => {
    const r = resumoDoIndicador([cupom('pending'), cupom('pending'), cupom('used')])
    expect(r.naFila).toBe(3)
    expect(r.usos).toBe(1)
  })

  test('expirado e cancelado não ocupam a fila: morreram', () => {
    const r = resumoDoIndicador([cupom('expired'), cupom('cancelled'), cupom('pending')])
    expect(r.naFila).toBe(1)
  })

  test('o teto bate pela fila, antes de qualquer venda acontecer', () => {
    const fila = Array.from({ length: 10 }, () => cupom('pending'))
    const r = resumoDoIndicador(fila)
    expect(r.usos).toBe(0)
    expect(tetoAtingido(r.naFila, 10)).toBe(true)
  })
})

describe('mesmoCpf (crítico 2)', () => {
  // O defeito exato: a trava do influenciador comparava digitos com o que a
  // ficha guarda sem mascara nenhuma. Quem digitou 123.456.789-09 no portal
  // passava batido.
  test('com e sem máscara são o mesmo CPF', () => {
    expect(mesmoCpf('123.456.789-09', '12345678909')).toBe(true)
    expect(mesmoCpf(' 123 456 789 09 ', '12345678909')).toBe(true)
  })

  test('CPFs diferentes continuam diferentes', () => {
    expect(mesmoCpf('123.456.789-09', '98765432100')).toBe(false)
  })

  test('nulo, vazio e lixo não casam com nada', () => {
    expect(mesmoCpf(null, '12345678909')).toBe(false)
    expect(mesmoCpf('', '')).toBe(false)
    expect(mesmoCpf('abc', 'abc')).toBe(false)
  })
})

describe('maiorDeIdade no fuso de São Paulo (importante 10)', () => {
  // O defeito exato: o runtime da Vercel e UTC, que depois das 21h no Brasil ja
  // esta no dia seguinte. Quem faz 18 anos AMANHA era aceito hoje a noite.
  test('21h30 de SP na véspera do aniversário: NÃO entra', () => {
    const vespera = new Date('2026-11-18T00:30:00Z') // 17/11 21:30 em SP
    expect(maiorDeIdade('2008-11-18', vespera)).toBe(false)
  })

  test('meia-noite e meia de SP no dia do aniversário: entra', () => {
    const noDia = new Date('2026-11-18T03:30:00Z') // 18/11 00:30 em SP
    expect(maiorDeIdade('2008-11-18', noDia)).toBe(true)
  })
})

describe('destinoSeguro (importante 7)', () => {
  // O defeito exato: ?next= sem validacao numa tela de login divulgada por
  // WhatsApp. O golpe é um link legitimo da FOX que, depois do login, joga a
  // pessoa numa pagina que pede dado bancario "para o premio".
  test('caminho interno passa', () => {
    expect(destinoSeguro('/indicador/cartao', '/indicador')).toBe('/indicador/cartao')
  })

  test('URL absoluta de outro site é descartada', () => {
    expect(destinoSeguro('https://premios.exemplo/pix', '/indicador')).toBe('/indicador')
  })

  test('barra dupla (protocol-relative) é descartada', () => {
    expect(destinoSeguro('//premios.exemplo/pix', '/indicador')).toBe('/indicador')
  })

  test('barra invertida e espaço antes da barra não driblam', () => {
    expect(destinoSeguro('\\premios.exemplo', '/indicador')).toBe('/indicador')
    expect(destinoSeguro('  //premios.exemplo', '/indicador')).toBe('/indicador')
  })

  test('nulo e vazio caem no padrão', () => {
    expect(destinoSeguro(null, '/indicador')).toBe('/indicador')
    expect(destinoSeguro('', '/indicador')).toBe('/indicador')
  })
})
