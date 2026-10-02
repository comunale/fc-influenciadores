import { describe, it, expect } from 'vitest'
import { montarConvite, enderecoDoPortal } from '@/lib/portal/convite'

const base = { nome: 'Marianne Gimenes', email: 'mari@exemplo.com' }

describe('enderecoDoPortal', () => {
  it('aponta para a entrada do influenciador, nao a do admin', () => {
    expect(enderecoDoPortal()).toBe('https://influenciadores.foxcycles.com.br/portal/login')
  })
})

describe('montarConvite', () => {
  it('trata a pessoa pelo primeiro nome', () => {
    expect(montarConvite(base)).toContain('Oi, Marianne!')
  })

  it('leva o endereco do portal e o e-mail', () => {
    const t = montarConvite(base)
    expect(t).toContain('/portal/login')
    expect(t).toContain('mari@exemplo.com')
  })

  it('leva a senha so quando ela existe', () => {
    expect(montarConvite({ ...base, senha: 'Fox123456!' })).toContain('Senha: Fox123456!')
    expect(montarConvite(base)).not.toContain('Senha:')
  })

  it('so sugere trocar a senha quando mandou uma', () => {
    expect(montarConvite({ ...base, senha: 'x' })).toContain('trocar a senha')
    expect(montarConvite(base)).not.toContain('trocar a senha')
  })

  it('explica o contrato quando ha um esperando', () => {
    // O passo que trava tudo: sem aceite o link dela nao liga.
    const t = montarConvite({ ...base, contratoPendente: true })
    expect(t).toContain('contrato')
    expect(t).toContain('liberado na hora')
  })

  it('nao fala de contrato quando nao ha', () => {
    expect(montarConvite(base)).not.toContain('contrato')
  })

  it('aguenta nome vazio sem escrever "Oi, !"', () => {
    expect(montarConvite({ ...base, nome: '   ' })).toContain('Oi! Tudo certo?')
  })

  it('respeita um site diferente do padrao', () => {
    expect(montarConvite({ ...base, site: 'https://teste.local' }))
      .toContain('https://teste.local/portal/login')
  })
})
