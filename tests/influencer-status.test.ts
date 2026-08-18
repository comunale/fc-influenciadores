import { describe, it, expect } from 'vitest'
import { linkAtivo, motivoLinkInativo } from '@/lib/influencer-status'

const hoje = new Date().toISOString().slice(0, 10)
const ontem = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
const amanha = new Date(Date.now() + 86400000).toISOString().slice(0, 10)

describe('linkAtivo', () => {
  it('abre quando o influencer esta ativo e nao tem prazo', () => {
    // O caso mais comum, e o que a migracao de 18/08 deixou para todo mundo.
    expect(linkAtivo({ active: true, partnership_ends_at: null })).toBe(true)
  })

  it('abre quando o prazo e no futuro', () => {
    expect(linkAtivo({ active: true, partnership_ends_at: amanha })).toBe(true)
  })

  it('abre no ultimo dia da parceria', () => {
    // A parceria vale ATE o dia combinado, inclusive. Fechar no proprio dia
    // seria tirar um dia de quem negociou.
    expect(linkAtivo({ active: true, partnership_ends_at: hoje })).toBe(true)
  })

  it('fecha quando o prazo passou', () => {
    expect(linkAtivo({ active: true, partnership_ends_at: ontem })).toBe(false)
  })

  it('fecha quando o influencer esta inativo, mesmo dentro do prazo', () => {
    expect(linkAtivo({ active: false, partnership_ends_at: amanha })).toBe(false)
  })

  it('fecha quando o influencer esta inativo e nao tem prazo', () => {
    expect(linkAtivo({ active: false, partnership_ends_at: null })).toBe(false)
  })

  it('nao depende da campanha', () => {
    // A regressao que motivou a mudanca: em 18/08 a campanha desativada deixou
    // 17 de 18 links mortos com todos os influencers ativos. A funcao nem
    // recebe campanha -- nao ha como isso voltar a acontecer.
    expect(linkAtivo({ active: true, partnership_ends_at: null })).toBe(true)
  })
})

describe('motivoLinkInativo', () => {
  it('nao da motivo quando o link esta no ar', () => {
    expect(motivoLinkInativo({ active: true, partnership_ends_at: null })).toBeNull()
    expect(motivoLinkInativo({ active: true, partnership_ends_at: amanha })).toBeNull()
  })

  it('inativo tem precedencia sobre prazo vencido', () => {
    expect(motivoLinkInativo({ active: false, partnership_ends_at: ontem })).toBe('Influencer inativo')
  })

  it('explica o prazo vencido', () => {
    expect(motivoLinkInativo({ active: true, partnership_ends_at: ontem })).toBe('Parceria encerrada')
  })
})
