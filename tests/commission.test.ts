import { describe, it, expect } from 'vitest'
import { calcularComissao, type VendaParaComissao } from '@/lib/commission'

const contrato = {
  commission_per_sale: 500, commission_starts_at: 2, fee_amount: 500,
  commission_counts_from: 'parceria' as const, partnership_id: 'p1',
}

function venda(id: string, dia: string, opts: Partial<VendaParaComissao> = {}): VendaParaComissao {
  return { id, created_at: `2026-06-${dia}T12:00:00Z`, verified: true, paid: false, commission_per_sale: null, partnership_id: 'p1', ...opts }
}

describe('calcularComissao', () => {
  it('sem vendas, nao deve nada', () => {
    const r = calcularComissao(contrato, [])
    expect(r).toMatchObject({ totalVendas: 0, vendasQueContam: 0, comissaoGerada: 0, comissaoAPagar: 0 })
  })

  it('so conta cupom aprovado pelo financeiro', () => {
    // Confirmado pelo Cesar: "sim, o financeiro tem que aprovar".
    const r = calcularComissao(contrato, [
      venda('a', '05'),
      venda('b', '06', { verified: false }),
      venda('c', '07'),
    ])
    expect(r.totalVendas).toBe(2)
  })

  it('a primeira venda nao gera comissao quando o acordo comeca na 2a', () => {
    const r = calcularComissao(contrato, [venda('a', '05')])
    expect(r.vendasQueContam).toBe(0)
    expect(r.comissaoGerada).toBe(0)
  })

  it('da 2a venda em diante gera comissao', () => {
    const cupons = ['05', '06', '07', '08', '09', '10'].map((d, i) => venda(String(i), d))
    const r = calcularComissao(contrato, cupons)
    expect(r.totalVendas).toBe(6)
    expect(r.vendasQueContam).toBe(5)
    expect(r.comissaoGerada).toBe(2500)
  })

  it('quando o acordo comeca na 1a, todas contam', () => {
    const cupons = ['05', '06', '07'].map((d, i) => venda(String(i), d))
    const r = calcularComissao({ ...contrato, commission_starts_at: 1 }, cupons)
    expect(r.vendasQueContam).toBe(3)
    expect(r.comissaoGerada).toBe(1500)
  })

  it('ordena por data, nao pela ordem que chegou na lista', () => {
    // A venda mais antiga ocupa a posicao 1 e fica sem comissao, mesmo tendo
    // chegado por ultimo na lista.
    const r = calcularComissao(contrato, [venda('novo', '20'), venda('antigo', '01')])
    expect(r.vendasQueContam).toBe(1)
    expect(r.comissaoGerada).toBe(500)
  })

  it('separa o que ja foi pago do que falta pagar', () => {
    const cupons = [venda('a', '05'), venda('b', '06', { paid: true }), venda('c', '07')]
    const r = calcularComissao(contrato, cupons)
    expect(r.comissaoGerada).toBe(1000)
    expect(r.comissaoPaga).toBe(500)
    expect(r.comissaoAPagar).toBe(500)
  })

  it('cupom pago que nao chegou a gerar comissao nao vira credito', () => {
    // A 1a venda nao gera comissao. Se estiver marcada como paga, isso nao pode
    // virar valor negativo nem abater o que ainda falta.
    const r = calcularComissao(contrato, [venda('a', '05', { paid: true }), venda('b', '06')])
    expect(r.comissaoGerada).toBe(500)
    expect(r.comissaoPaga).toBe(0)
    expect(r.comissaoAPagar).toBe(500)
  })

  it('o fixo e informado a parte, nunca somado no que falta pagar', () => {
    // Nao existe campo que registre se o fixo ja foi pago. Somar seria chutar.
    const r = calcularComissao(contrato, [venda('a', '05'), venda('b', '06')])
    expect(r.fixo).toBe(500)
    expect(r.comissaoAPagar).toBe(500)
  })

  it('commission_starts_at zero ou ausente vale como 1', () => {
    const r = calcularComissao({ ...contrato, commission_starts_at: 0 }, [venda('a', '05')])
    expect(r.vendasQueContam).toBe(1)
  })
it('usa o valor gravado no cupom, nao o valor atual do contrato', () => {
    // Renovou de 500 para 900. As vendas antigas continuam valendo 500 -- e o
    // que impede uma renovacao de reescrever comissao ja paga.
    const r = calcularComissao({ ...contrato, commission_per_sale: 900, commission_starts_at: 1 }, [
      venda('a', '05', { commission_per_sale: 500 }),
      venda('b', '06', { commission_per_sale: 500 }),
      venda('c', '20', { commission_per_sale: 900 }),
    ])
    expect(r.comissaoGerada).toBe(1900)
  })

  it('cupom sem retrato cai no valor do contrato', () => {
    const r = calcularComissao({ ...contrato, commission_starts_at: 1 }, [
      venda('a', '05', { commission_per_sale: null }),
    ])
    expect(r.comissaoGerada).toBe(500)
  })

  it('contando pela parceria, so as vendas dela contam', () => {
    // Renovou: as vendas da parceria anterior nao contam nem para a posicao
    // nem para o dinheiro.
    const r = calcularComissao(
      { ...contrato, commission_counts_from: 'parceria', partnership_id: 'p2' },
      [
        venda('velha', '05', { partnership_id: 'p1' }),
        venda('nova1', '20', { partnership_id: 'p2' }),
        venda('nova2', '21', { partnership_id: 'p2' }),
      ]
    )
    expect(r.totalVendas).toBe(2)
    expect(r.vendasQueContam).toBe(1)
    expect(r.comissaoGerada).toBe(500)
  })

  it('contando pelo historico, as vendas antigas tambem contam', () => {
    const r = calcularComissao(
      { ...contrato, commission_counts_from: 'historico', partnership_id: 'p2' },
      [
        venda('velha', '05', { partnership_id: 'p1' }),
        venda('nova', '20', { partnership_id: 'p2' }),
      ]
    )
    expect(r.totalVendas).toBe(2)
    expect(r.vendasQueContam).toBe(1)
  })
})
