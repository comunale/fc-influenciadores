import { describe, it, expect } from 'vitest'
import { CAMPOS_POR_PAPEL } from '@/lib/auth/campos-do-cupom'

describe('campos de cupom por papel (guarda da API)', () => {
  it('o financeiro nao escreve paid: paga por lancamento', () => {
    expect(CAMPOS_POR_PAPEL.finance).not.toContain('paid')
    expect(CAMPOS_POR_PAPEL.finance).toEqual(['verified', 'invoice_number'])
  })

  it('o admin mantem paid (decisao do dono)', () => {
    expect(CAMPOS_POR_PAPEL.admin).toContain('paid')
  })

  it('lojista e influenciador nao escrevem nada', () => {
    expect(CAMPOS_POR_PAPEL.moderator).toEqual([])
    expect(CAMPOS_POR_PAPEL.influencer).toEqual([])
  })
})
