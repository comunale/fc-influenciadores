/**
 * A mensagem que o César manda para o influenciador entrar no portal.
 *
 * Existe porque o projeto NÃO envia e-mail -- foi descartado em agosto. O
 * convite vai pelo WhatsApp, e até 02/10/2026 o César tinha que montar o texto
 * de cabeça: o endereço do portal não aparecia em tela nenhuma do admin.
 *
 * Módulo puro, sem React e sem banco, para o texto ser testável.
 */

export type Convite = {
  nome: string
  email: string
  /** Só existe no momento em que o acesso é criado ou a senha é redefinida. */
  senha?: string
  site?: string
  /** Há contrato esperando aceite? Muda o que ele precisa fazer lá dentro. */
  contratoPendente?: boolean
}

const PADRAO = 'https://influenciadores.foxcycles.com.br'

/** Só o primeiro nome: a mensagem é pessoal, não um comunicado. */
function primeiroNome(nome: string): string {
  const limpo = (nome ?? '').trim()
  return limpo ? limpo.split(/\s+/)[0] : ''
}

export function enderecoDoPortal(site = PADRAO): string {
  return `${site}/portal/login`
}

export function montarConvite({
  nome, email, senha, site = PADRAO, contratoPendente = false,
}: Convite): string {
  const linhas: string[] = []

  const quem = primeiroNome(nome)
  linhas.push(quem ? `Oi, ${quem}! Tudo certo?` : 'Oi! Tudo certo?')
  linhas.push('')
  linhas.push(
    'Criei seu acesso ao portal da FoxCycles. É lá que você acompanha os cupons ' +
    'gerados pelo seu link, as vendas e a sua comissão.'
  )
  linhas.push('')
  linhas.push(enderecoDoPortal(site))
  linhas.push(`E-mail: ${email}`)
  if (senha) linhas.push(`Senha: ${senha}`)
  linhas.push('')

  if (contratoPendente) {
    // O passo que trava tudo: sem aceite, o link dela não liga. Dizer isso aqui
    // evita a conversa de "mandei o link e não funciona".
    linhas.push(
      'Ao entrar, você vai encontrar o contrato da nossa parceria. Preencha seus ' +
      'dados, leia com calma e, se estiver tudo certo, aceite — o seu link de ' +
      'divulgação é liberado na hora.'
    )
  } else {
    linhas.push('Qualquer dúvida é só chamar.')
  }

  if (senha) {
    linhas.push('')
    linhas.push('Recomendo trocar a senha no primeiro acesso, na aba Senha.')
  }

  return linhas.join('\n')
}
