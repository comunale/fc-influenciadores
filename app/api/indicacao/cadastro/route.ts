import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { checkRateLimit, getClientIp, COUPON_RULES } from '@/lib/rate-limit'
import { validarCadastro } from '@/lib/indicacao/cadastro'
import { emailSinteticoDoCpf, gerarCodigoDeIndicacao, mesmoCpf } from '@/lib/indicacao/regras'
import { parceriaAtiva, parceriaVigente, type Parceria } from '@/lib/partnership'

const UNIQUE_VIOLATION = '23505'
const TENTATIVAS_DE_CODIGO = 5

/**
 * Autocadastro no Programa de Indicação.
 *
 * É a primeira porta pública deste sistema que cria CONTA. Por isso, três
 * cuidados que as outras rotas públicas não precisam ter:
 *
 *  - rate limit por IP antes de qualquer trabalho, como em /api/coupons;
 *  - `auth.admin.createUser` com a chave de serviço, nunca `signUp` — o
 *    caminho do signUp dependia de RLS frouxa e foi escalada de privilégio em
 *    03/11/2026 (ver migration 030 e /api/admin/create-user);
 *  - se qualquer passo depois do createUser falhar, o usuário do Auth é
 *    apagado. Conta no Auth sem perfil é exatamente o estado que a brecha de
 *    03/11 soube explorar — e, de quebra, impediria a pessoa de tentar de novo,
 *    porque o e-mail sintético do CPF dela já estaria tomado.
 */
export async function POST(request: Request) {
  try {
    const allowed = await checkRateLimit('indicacao-cadastro', getClientIp(request), COUPON_RULES)
    if (!allowed) {
      return NextResponse.json(
        { error: 'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.' },
        { status: 429 }
      )
    }

    const validacao = validarCadastro(await request.json())
    if (!validacao.ok) {
      return NextResponse.json({ error: validacao.erro }, { status: 400 })
    }
    const dados = validacao.dados

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('indicacao/cadastro: SUPABASE_SERVICE_ROLE_KEY não configurada')
      return NextResponse.json(
        { error: 'Cadastro indisponível neste momento. Avise marketing@foxcycles.com.br.' },
        { status: 503 }
      )
    }

    const supabase = createAdminClient()

    // Já é indicador. A mensagem manda ela ENTRAR, não tentar de novo: o CPF é
    // o login, então "já cadastrado" e "você já tem acesso" são a mesma coisa.
    const { data: existente } = await supabase
      .from('indicadores')
      .select('id')
      .eq('cpf', dados.cpf)
      .maybeSingle()

    if (existente) {
      return NextResponse.json(
        { error: 'Este CPF já está cadastrado. Entre com seu CPF e sua senha.' },
        { status: 409 }
      )
    }

    // Quem tem parceria de influenciador já ganha comissão por venda. Receber
    // também o prêmio da indicação seria pagar duas vezes a mesma venda
    // (decisão do César, 18/11).
    //
    // A checagem só alcança quem preencheu o CPF na ficha. Em 18/11/2026 isso
    // era 1 influenciador de 19 — então ela fecha o caminho honesto, não todos.
    // Compara DÍGITOS, não texto. A ficha guarda o CPF como o portal recebeu, e
    // o campo do portal não tinha máscara: quem digitou `123.456.789-09` não
    // casava com `12345678909`, e a trava não barrava ninguém — exatamente o
    // defeito silencioso que a revisão de 18/11 achou. São 19 influenciadores,
    // então trazer a coluna e comparar aqui é barato e pega os dois formatos.
    const { data: fichas } = await supabase
      .from('influencer_ficha')
      .select('influencer_id, cpf')
      .not('cpf', 'is', null)

    const ficha = (fichas ?? []).find((f) => mesmoCpf(f.cpf, dados.cpf))

    if (ficha?.influencer_id) {
      // Duas consultas, e não um join aninhado: a FK de influencer_ficha ainda
      // se chama influencer_contract_data_influencer_id_fkey, e o PostgREST não
      // encontra a relação por esse nome.
      const { data: parcerias } = await supabase
        .from('partnerships')
        .select('*')
        .eq('influencer_id', ficha.influencer_id)

      if (parceriaVigente(parceriaAtiva(parcerias as Parceria[] | null))) {
        return NextResponse.json(
          {
            error:
              'Este CPF é de um influenciador com parceria ativa. Você já recebe comissão por venda — fale com marketing@foxcycles.com.br.',
          },
          { status: 409 }
        )
      }
    }

    const email = emailSinteticoDoCpf(dados.cpf)

    const { data: novoUsuario, error: erroAuth } = await supabase.auth.admin.createUser({
      email,
      password: dados.senha,
      email_confirm: true,
    })
    if (erroAuth || !novoUsuario.user) {
      console.error('indicacao/cadastro createUser:', erroAuth)

      // O e-mail sintético já existe. Dois caminhos levam aqui, e os dois
      // precisam da MESMA frase da checagem de CPF acima:
      //
      //  - dois envios simultâneos do mesmo CPF;
      //  - uma tentativa anterior que criou o usuário, falhou depois e não
      //    conseguiu apagá-lo. Sem este ramo, essa pessoa recebia "tente
      //    novamente em instantes" para sempre, sem caminho nenhum.
      const motivo = `${erroAuth?.message ?? ''} ${erroAuth?.code ?? ''}`.toLowerCase()
      if (motivo.includes('already') || motivo.includes('exist') || motivo.includes('registered')) {
        return NextResponse.json(
          { error: 'Este CPF já está cadastrado. Entre com seu CPF e sua senha.' },
          { status: 409 }
        )
      }

      return NextResponse.json(
        { error: 'Não foi possível criar seu acesso. Tente novamente em instantes.' },
        { status: 400 }
      )
    }
    const userId = novoUsuario.user.id

    async function desfazer() {
      const { error } = await supabase.auth.admin.deleteUser(userId)
      // Se nem apagar deu, a conta fica órfã no Auth. Grita no log com o id,
      // porque sem isso ela é invisível: o CPF não existe em `indicadores` e o
      // e-mail sintético está ocupado.
      if (error) {
        console.error(
          `indicacao/cadastro: CONTA ORFA no Auth, user ${userId}, sem linha em indicadores. Apagar a mao.`,
          error
        )
      }
    }

    // O código é sorteado: colisão manda sortear outro, não falhar.
    let indicadorId: string | null = null
    let codigo = ''
    for (let i = 0; i < TENTATIVAS_DE_CODIGO; i++) {
      codigo = gerarCodigoDeIndicacao()
      const { data, error } = await supabase
        .from('indicadores')
        .insert({
          nome: dados.nome,
          cpf: dados.cpf,
          telefone: dados.telefone,
          sexo: dados.sexo,
          data_nascimento: dados.dataNascimento,
          codigo,
          aceite_termos: true,
          aceite_comunicacoes: dados.aceiteComunicacoes,
          aceite_ip: getClientIp(request),
        })
        .select('id')
        .single()

      if (!error && data) {
        indicadorId = data.id
        break
      }

      if (error?.code === UNIQUE_VIOLATION) {
        const detalhe = `${error.message} ${error.details ?? ''}`
        if (detalhe.includes('codigo')) continue // sorteia outro
        if (detalhe.includes('cpf')) {
          await desfazer()
          return NextResponse.json(
            { error: 'Este CPF já está cadastrado. Entre com seu CPF e sua senha.' },
            { status: 409 }
          )
        }
      }

      console.error('indicacao/cadastro insert indicadores:', error)
      await desfazer()
      return NextResponse.json({ error: 'Erro ao salvar seu cadastro.' }, { status: 500 })
    }

    if (!indicadorId) {
      await desfazer()
      return NextResponse.json(
        { error: 'Não foi possível gerar seu código. Tente novamente.' },
        { status: 500 }
      )
    }

    const { error: erroPerfil } = await supabase.from('admin_profiles').insert({
      id: userId,
      name: dados.nome,
      email,
      role: 'indicador',
      indicador_id: indicadorId,
      active: true,
      // A senha é escolhida por ela no próprio cadastro, então já nasce
      // definida — diferente do influenciador, que recebe uma senha do admin.
      senha_definida_at: new Date().toISOString(),
    })

    if (erroPerfil) {
      console.error('indicacao/cadastro insert perfil:', erroPerfil)
      await supabase.from('indicadores').delete().eq('id', indicadorId)
      await desfazer()
      return NextResponse.json({ error: 'Erro ao criar seu acesso.' }, { status: 500 })
    }

    return NextResponse.json({ codigo, link: `/i/${codigo}` }, { status: 201 })
  } catch (err) {
    console.error('indicacao/cadastro erro não tratado:', err)
    return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 })
  }
}
