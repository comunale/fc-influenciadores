import { describe, it, expect } from 'vitest'
import { porExtenso } from '@/lib/contracts/extenso'
import { preencher, camposDoModelo } from '@/lib/contracts/preencher'

describe('porExtenso', () => {
  it('escreve os valores que este projeto usa', () => {
    expect(porExtenso(300)).toBe('trezentos reais')
    expect(porExtenso(500)).toBe('quinhentos reais')
    expect(porExtenso(3000)).toBe('tres mil reais')
  })

  it('acerta singular e zero', () => {
    expect(porExtenso(1)).toBe('um real')
    expect(porExtenso(0)).toBe('zero reais')
  })

  it('poe o "e" onde o uso pede, nao onde a matematica poria', () => {
    // "mil e quinhentos", mas "mil duzentos e trinta e quatro".
    expect(porExtenso(1500)).toBe('mil e quinhentos reais')
    expect(porExtenso(1234)).toBe('mil duzentos e trinta e quatro reais')
    expect(porExtenso(1001)).toBe('mil e um reais')
    expect(porExtenso(100)).toBe('cem reais')
    expect(porExtenso(101)).toBe('cento e um reais')
  })

  it('aguenta centavos', () => {
    expect(porExtenso(1.5)).toBe('um real e cinquenta centavos')
    expect(porExtenso(0.01)).toBe('um centavo')
  })

  it('arredonda fracao de centavo em vez de escrever o que nao cabe', () => {
    expect(porExtenso(10.004)).toBe('dez reais')
  })
})

describe('preencher', () => {
  const dados = {
    influenciador: { nome: 'Caio Santos', cpf: '123.456.789-00', estado_civil: 'solteiro',
                     endereco: 'Rua X, 10', cep: '13000-000',
                     link: 'https://influenciadores.foxcycles.com.br/c/CAIIUXO300' },
    parceria: { vigencia: '19/08/2026 a 18/10/2026', comissao: 500, fee: 0 },
    contrato: { data: '19 de agosto de 2026', imagem_meses: 6 },
  }

  it('troca cada campo pelo valor', () => {
    const r = preencher('Nome: {{influenciador.nome}}', dados)
    expect(r.corpo).toBe('Nome: Caio Santos')
    expect(r.faltando).toEqual([])
  })

  it('escreve dinheiro em numero e por extenso', () => {
    const r = preencher('{{parceria.comissao}} ({{parceria.comissao_extenso}})', dados)
    expect(r.corpo).toBe('R$ 500,00 (quinhentos reais)')
  })

  it('escreve o prazo de imagem como "6 (seis)"', () => {
    const r = preencher('{{contrato.imagem_meses}} ({{contrato.imagem_meses_extenso}}) meses', dados)
    expect(r.corpo).toBe('6 (seis) meses')
  })

  it('LISTA o que faltou e deixa a marcacao a vista', () => {
    // Contrato com {{cpf}} sobrando no meio e um humano assinando embaixo e o
    // pior desfecho possivel. Melhor nao gerar.
    const r = preencher('CPF: {{influenciador.cpf}}', { influenciador: {} })
    expect(r.faltando).toEqual(['influenciador.cpf'])
    expect(r.corpo).toContain('{{influenciador.cpf}}')
  })

  it('trata campo vazio ou so espaco como faltando', () => {
    const r = preencher('{{influenciador.cpf}}', { influenciador: { cpf: '   ' } })
    expect(r.faltando).toEqual(['influenciador.cpf'])
  })

  it('nao deixa marcacao nenhuma sobrar quando tudo esta preenchido', () => {
    const modelo = `{{influenciador.nome}}, {{influenciador.estado_civil}}, CPF
      {{influenciador.cpf}}, {{influenciador.endereco}}, CEP {{influenciador.cep}}.
      Vigencia {{parceria.vigencia}}. Comissao {{parceria.comissao}}
      ({{parceria.comissao_extenso}}). Fee {{parceria.fee}}. Link
      {{influenciador.link}}. Imagem por {{contrato.imagem_meses}} meses.
      {{contrato.data}}.`
    const r = preencher(modelo, dados)
    expect(r.faltando).toEqual([])
    expect(r.corpo).not.toMatch(/\{\{|\}\}/)
  })

  it('aceita espaco dentro da marcacao', () => {
    expect(preencher('{{ influenciador.nome }}', dados).corpo).toBe('Caio Santos')
  })

  it('lista o mesmo campo uma vez so, mesmo citado varias vezes', () => {
    const r = preencher('{{a.b}} {{a.b}} {{a.b}}', {})
    expect(r.faltando).toEqual(['a.b'])
  })
})

describe('camposDoModelo', () => {
  it('lista o que o modelo pede, para a tela mostrar', () => {
    expect(camposDoModelo('{{influenciador.nome}} e {{parceria.comissao}}'))
      .toEqual(['influenciador.nome', 'parceria.comissao'])
  })
})

describe('blocos condicionais', () => {
  const comFee = { parceria: { fee: 500, comissao: 500 } }
  const semFee = { parceria: { fee: 0, comissao: 500 } }

  it('mantem o bloco quando o valor existe', () => {
    const r = preencher('a{{#se parceria.fee}} fee {{parceria.fee}} {{/se}}b', comFee)
    expect(r.corpo).toBe('a fee R$ 500,00 b')
  })

  it('remove o bloco quando o valor e zero', () => {
    // O caso que motivou: sem isto o contrato do @caiiuxo teria uma clausula
    // dizendo "R$ 0,00 (zero reais)".
    const r = preencher('a{{#se parceria.fee}} fee {{parceria.fee}} {{/se}}b', semFee)
    expect(r.corpo).toBe('ab')
  })

  it('remove o bloco quando o campo nem existe', () => {
    expect(preencher('a{{#se parceria.fee}}x{{/se}}b', {}).corpo).toBe('ab')
  })

  it('nao cobra campo que ficou dentro de bloco removido', () => {
    // O {{parceria.fee_extenso}} sumiu junto: nao pode aparecer como faltando.
    const r = preencher('{{#se parceria.fee}}{{parceria.fee_extenso}}{{/se}}', semFee)
    expect(r.faltando).toEqual([])
    expect(r.corpo).toBe('')
  })

  it('cobra normalmente o campo que ficou dentro de bloco mantido', () => {
    const r = preencher('{{#se parceria.fee}}{{influenciador.cpf}}{{/se}}', comFee)
    expect(r.faltando).toEqual(['influenciador.cpf'])
  })
})
