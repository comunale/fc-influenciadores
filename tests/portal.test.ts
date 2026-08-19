import { describe, it, expect } from 'vitest'
import { primeiroNome, montarPortal, type CupomDoPortal } from '@/lib/portal'
import type { Parceria } from '@/lib/partnership'

function parceria(id: string, over: Partial<Parceria & { portal_visible: boolean }> = {}) {
  return {
    id, status: 'ativa', starts_at: '2026-08-01', ends_at: '2026-09-30',
    fee_amount: 0, fee_timing: 'inicio', commission_per_sale: 500,
    commission_starts_at: 1, commission_counts_from: 'parceria',
    payment_schedule: 'fim', discount_type: 'fixed', discount_value: 300,
    validity_days: 30, coupon_title: null, coupon_description: null,
    portal_visible: true, ...over,
  }
}

function cupom(id: string, over: Partial<CupomDoPortal> = {}): CupomDoPortal {
  return {
    id, created_at: '2026-08-10T12:00:00Z', verified: true, paid: false,
    commission_per_sale: 500, partnership_id: 'p1',
    customer_name: 'Marcos Ribeiro Silva', coupon_number: 'FOX-1', status: 'used', ...over,
  }
}

describe('primeiroNome', () => {
  it('devolve so o primeiro termo', () => {
    expect(primeiroNome('Marcos Ribeiro Silva')).toBe('Marcos')
    expect(primeiroNome('Ana Paula Souza')).toBe('Ana')
  })

  it('nao vaza sobrenome em nenhuma forma de escrita', () => {
    // Espaco duplo, espaco na ponta, nome em caixa alta -- tudo que vem de
    // formulario preenchido as pressas no balcao.
    expect(primeiroNome('  Joao   Pedro  ')).toBe('Joao')
    expect(primeiroNome('MARIA DA SILVA')).toBe('MARIA')
  })

  it('aguenta nome vazio, nulo ou so espaco', () => {
    expect(primeiroNome(null)).toBe('Cliente')
    expect(primeiroNome(undefined)).toBe('Cliente')
    expect(primeiroNome('   ')).toBe('Cliente')
  })

  it('nome de um termo so continua inteiro', () => {
    expect(primeiroNome('Madonna')).toBe('Madonna')
  })
})

describe('montarPortal', () => {
  it('parceria invisivel vira linha fechada: sem vendas e sem valores', () => {
    // A regra que protege o que ja foi pago por fora.
    const r = montarPortal([parceria('p1', { portal_visible: false })], [cupom('c1')])
    expect(r[0].visivel).toBe(false)
    expect(r[0].vendas).toEqual([])
    expect(r[0].resumo).toBeNull()
  })

  it('parceria visivel traz resumo e vendas', () => {
    const r = montarPortal([parceria('p1')], [cupom('c1'), cupom('c2')])
    expect(r[0].visivel).toBe(true)
    expect(r[0].vendas).toHaveLength(2)
    expect(r[0].resumo?.comissaoGerada).toBe(1000)
  })

  it('venda nao aprovada pelo financeiro aparece, mas nao gera comissao', () => {
    const r = montarPortal([parceria('p1')], [
      cupom('c1'),
      cupom('c2', { verified: false }),
    ])
    expect(r[0].vendas).toHaveLength(2)
    expect(r[0].vendas.find((v) => v.id === 'c2')?.aprovada).toBe(false)
    expect(r[0].resumo?.comissaoGerada).toBe(500)
  })

  it('a venda so expoe primeiro nome, data e situacao', () => {
    const r = montarPortal([parceria('p1')], [cupom('c1')])
    expect(r[0].vendas[0]).toEqual({
      id: 'c1', primeiro_nome: 'Marcos', data: '2026-08-10T12:00:00Z', aprovada: true,
    })
    // Nenhum campo de identificacao sobrou no caminho.
    const serializado = JSON.stringify(r)
    expect(serializado).not.toMatch(/Ribeiro|Silva|cpf|phone|email/i)
  })

  it('cupom de outra parceria nao entra', () => {
    const r = montarPortal([parceria('p1')], [cupom('c1'), cupom('c2', { partnership_id: 'p2' })])
    expect(r[0].vendas).toHaveLength(1)
  })

  it('marca encerrada quando o prazo passou', () => {
    const r = montarPortal([parceria('p1', { ends_at: '2026-08-18' })], [], '2026-08-19')
    expect(r[0].encerrada).toBe(true)
  })

  it('vale ate o dia combinado, inclusive', () => {
    const r = montarPortal([parceria('p1', { ends_at: '2026-08-19' })], [], '2026-08-19')
    expect(r[0].encerrada).toBe(false)
  })

  it('parceria sem prazo nao esta encerrada', () => {
    const r = montarPortal([parceria('p1', { ends_at: null })], [], '2030-01-01')
    expect(r[0].encerrada).toBe(false)
  })

  it('lista a mais recente primeiro', () => {
    const r = montarPortal([
      parceria('antiga', { starts_at: '2026-01-01' }),
      parceria('nova', { starts_at: '2026-08-01' }),
    ], [])
    expect(r.map((p) => p.id)).toEqual(['nova', 'antiga'])
  })
})
