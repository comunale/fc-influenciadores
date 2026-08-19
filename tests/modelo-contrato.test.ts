import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { preencher, camposDoModelo } from '@/lib/contracts/preencher'

/**
 * Le o modelo do contrato do proprio arquivo de migration e conferere que ele
 * gera um documento completo.
 *
 * Existe porque contrato com {{cpf}} sobrando no meio, e um humano assinando
 * embaixo, e o pior desfecho que este modulo pode produzir. Um campo digitado
 * errado -- {{influenciador.nome_completo}} em vez de {{influenciador.nome}} --
 * passa despercebido na leitura e so aparece na hora de gerar.
 */
const sql = readFileSync('db/migrations/023_modelo_inicial_do_contrato.sql', 'utf8')
const MODELO = sql.split('$modelo$')[1]

const completo = {
  influenciador: {
    nome: 'Caio Santos', cpf: '123.456.789-00', estado_civil: 'solteiro',
    endereco: 'Rua das Flores, 100, Campinas/SP', cep: '13000-000',
    link: 'https://influenciadores.foxcycles.com.br/c/CAIIUXO300',
  },
  parceria: {
    vigencia: '19/08/2026 a 18/10/2026', duracao: '60 (sessenta) dias',
    comissao: 500, fee: 500,
  },
  contrato: { data: '19 de agosto de 2026', imagem_meses: 6 },
}

describe('modelo do contrato', () => {
  it('o arquivo tem o modelo entre as marcas', () => {
    expect(MODELO).toBeTruthy()
    expect(MODELO).toContain('CONTRATO DE LICENÇA DE USO DE IMAGEM')
  })

  it('nao pede nenhum campo que o sistema nao saiba preencher', () => {
    const conhecidos = [
      'influenciador.nome', 'influenciador.cpf', 'influenciador.estado_civil',
      'influenciador.endereco', 'influenciador.cep', 'influenciador.link',
      'parceria.vigencia', 'parceria.duracao',
      'parceria.comissao', 'parceria.comissao_extenso',
      'parceria.fee', 'parceria.fee_extenso',
      'contrato.data', 'contrato.imagem_meses', 'contrato.imagem_meses_extenso',
    ]
    for (const campo of camposDoModelo(MODELO)) {
      expect(conhecidos, `campo desconhecido no modelo: ${campo}`).toContain(campo)
    }
  })

  it('com todos os dados, nao sobra marcacao nenhuma', () => {
    const r = preencher(MODELO, completo)
    expect(r.faltando).toEqual([])
    expect(r.corpo).not.toMatch(/\{\{|\}\}/)
  })

  it('com fee, tem a bonificacao fixa e a regra de restituicao', () => {
    const r = preencher(MODELO, completo)
    expect(r.corpo).toContain('Bonificação Fixa')
    expect(r.corpo).toContain('R$ 500,00 (quinhentos reais)')
    expect(r.corpo).toContain('deverá ser restituída à LICENCIADA')
  })

  it('sem fee, a bonificacao fixa some do contrato inteiro', () => {
    // O caso do @caiiuxo. Sem isto o contrato dele teria uma clausula dizendo
    // "R$ 0,00 (zero reais)" e um paragrafo mandando restituir nada.
    const r = preencher(MODELO, { ...completo, parceria: { ...completo.parceria, fee: 0 } })
    expect(r.faltando).toEqual([])
    expect(r.corpo).not.toContain('Bonificação Fixa')
    expect(r.corpo).not.toContain('restituída')
    expect(r.corpo).not.toContain('R$ 0,00')
    // E a comissao continua la.
    expect(r.corpo).toContain('Bonificação por Desempenho')
  })

  it('descreve a validacao em DUAS etapas', () => {
    // A correcao que mais importa: o texto antigo dizia que a equipe de vendas
    // fazia a "validacao final", e no sistema ela faz so a primeira metade.
    const r = preencher(MODELO, completo)
    expect(r.corpo).toContain('duas etapas')
    expect(r.corpo).toContain('setor financeiro da LICENCIADA confere a venda contra a respectiva nota fiscal')
  })

  it('nao elege o print como o mecanismo do cupom', () => {
    const r = preencher(MODELO, completo)
    expect(r.corpo).not.toMatch(/print de tela/i)
    expect(r.corpo).toContain('cupom é identificado por número próprio')
  })

  it('diz que os dados dos clientes nao sao do influenciador', () => {
    const r = preencher(MODELO, completo)
    expect(r.corpo).toContain('não recebe, não acessa e não detém qualquer direito sobre esses dados')
  })

  it('fixa o prazo de imagem sem "ate"', () => {
    const r = preencher(MODELO, completo)
    expect(r.corpo).toContain('será de 6 (seis) meses')
    expect(r.corpo).not.toMatch(/será de até/)
  })

  it('a comissao da venda feita continua devida no descumprimento', () => {
    const r = preencher(MODELO, completo)
    expect(r.corpo).toContain('permanecem devidas')
  })
})
