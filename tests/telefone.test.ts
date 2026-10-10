import { describe, it, expect } from 'vitest'
import { validarCelular, mascaraCelular } from '@/lib/validators/telefone'

describe('validarCelular', () => {
  it('aceita celular com e sem mascara', () => {
    expect(validarCelular('19999998806')).toMatchObject({ ok: true, digitos: '19999998806', ddd: 19 })
    expect(validarCelular('(19) 99999-8806')).toMatchObject({ ok: true, digitos: '19999998806' })
    expect(validarCelular(' 19 9 9999 8806 ')).toMatchObject({ ok: true })
  })

  it('aceita o +55 e devolve o numero sem ele', () => {
    // A causa dos tres numeros quebrados de 08/10: a versao antiga cortava em
    // 11 digitos e guardava o lixo sem avisar ninguem.
    expect(validarCelular('+55 19 99999-8806')).toMatchObject({ ok: true, digitos: '19999998806' })
    expect(validarCelular('5519999998806')).toMatchObject({ ok: true, digitos: '19999998806' })
  })

  it('nao confunde o DDD 55 com o codigo do pais', () => {
    // Santa Maria comeca com os mesmos digitos. Tirar o 55 sempre quebraria o RS.
    expect(validarCelular('55999998806')).toMatchObject({ ok: true, digitos: '55999998806', ddd: 55 })
    expect(validarCelular('+55 55 99999-8806')).toMatchObject({ ok: true, digitos: '55999998806' })
  })

  it('recusa fixo, que nao recebe WhatsApp', () => {
    const r = validarCelular('1933334444')
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.motivo).toContain('9')
  })

  it('recusa 11 digitos sem o 9 depois do DDD', () => {
    // O formato exato dos tres que entraram quebrados.
    const r = validarCelular('55268068806')
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.motivo).toContain('celular')
  })

  it('recusa DDD que nao existe', () => {
    const r = validarCelular('20999998806')
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.motivo).toContain('20')
  })

  it('recusa numero com digitos demais', () => {
    expect(validarCelular('199999988061234').ok).toBe(false)
  })

  it('recusa numero inventado de digito repetido', () => {
    expect(validarCelular('19999999999').ok).toBe(false)
  })

  it('recusa vazio com recado util', () => {
    const r = validarCelular('')
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.motivo).toContain('DDD')
  })

  it('diz especificamente que faltou o 9 quando sao 10 digitos', () => {
    const r = validarCelular('1999998806')
    expect(r.ok === false && r.motivo).toContain('Faltou o 9')
  })
})

describe('mascaraCelular', () => {
  it('monta a mascara conforme digita', () => {
    expect(mascaraCelular('19')).toBe('19')
    expect(mascaraCelular('199999')).toBe('(19) 9999')
    expect(mascaraCelular('19999998806')).toBe('(19) 99999-8806')
  })

  it('tira o codigo do pais em vez de cortar o fim', () => {
    expect(mascaraCelular('5519999998806')).toBe('(19) 99999-8806')
  })
})
