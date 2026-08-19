import { createAdminClient } from '@/lib/supabase/server'
import { preencher, type DadosDoContrato, type Preenchimento } from './preencher'

/**
 * Monta o contrato de uma parceria a partir do que o sistema sabe.
 *
 * Roda no servidor com service role de proposito: junta dados de tabelas que
 * nem o admin nem o influenciador alcancam de uma vez so. O texto resultante
 * nunca vem do navegador -- nem o do Cesar, nem o dele.
 */

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

const EXTENSO_DIAS: Record<number, string> = {
  7: 'sete', 15: 'quinze', 30: 'trinta', 45: 'quarenta e cinco',
  60: 'sessenta', 90: 'noventa', 120: 'cento e vinte', 180: 'cento e oitenta',
  365: 'trezentos e sessenta e cinco',
}

/** "19/08/2026". Data do banco vem como AAAA-MM-DD, sem fuso. */
function dia(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

/** "19 de agosto de 2026", como se escreve no fecho de um contrato. */
function porExtensoData(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split('-')
  return `${Number(d)} de ${MESES[Number(m) - 1]} de ${a}`
}

/**
 * "60 (sessenta) dias". Parceria sem data de fim vira prazo indeterminado --
 * dizer isso e melhor do que deixar a clausula do prazo em branco.
 */
function duracao(starts: string, ends: string | null): string {
  if (!ends) return 'prazo indeterminado'
  const de = new Date(starts + 'T12:00:00')
  const ate = new Date(ends + 'T12:00:00')
  const dias = Math.round((ate.getTime() - de.getTime()) / 86400000)
  const escrito = EXTENSO_DIAS[dias]
  return escrito ? `${dias} (${escrito}) dias` : `${dias} dias`
}

export type ContratoMontado = Preenchimento & {
  templateId: string
  templateVersao: number
  imagemMeses: number
}

/**
 * Monta o texto do contrato daquela parceria.
 *
 * Devolve tambem `faltando`: quem chamou decide se manda para aceite ou pede
 * os dados antes. Nunca gera documento com marcacao sobrando -- ver
 * lib/contracts/preencher.ts.
 */
export async function montarContrato(
  partnershipId: string,
  imagemMeses = 6
): Promise<ContratoMontado | null> {
  const db = createAdminClient()

  const [{ data: parceria }, { data: modelo }] = await Promise.all([
    db.from('partnerships')
      .select('*, influencers(id, name, coupon_code)')
      .eq('id', partnershipId)
      .maybeSingle(),
    db.from('contract_templates')
      .select('id, versao, corpo')
      .eq('ativo', true)
      .order('versao', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  if (!parceria || !modelo) return null

  const inf = parceria.influencers as unknown as
    { id: string; name: string; coupon_code: string } | null
  if (!inf) return null

  const { data: pessoais } = await db
    .from('influencer_contract_data')
    .select('cpf, estado_civil, endereco, cep')
    .eq('influencer_id', inf.id)
    .maybeSingle()

  const site = process.env.NEXT_PUBLIC_SITE_URL || 'https://influenciadores.foxcycles.com.br'

  const dados: DadosDoContrato = {
    influenciador: {
      nome: inf.name,
      cpf: pessoais?.cpf ?? undefined,
      estado_civil: pessoais?.estado_civil ?? undefined,
      endereco: pessoais?.endereco ?? undefined,
      cep: pessoais?.cep ?? undefined,
      link: `${site}/c/${inf.coupon_code}`,
    },
    parceria: {
      vigencia: parceria.ends_at
        ? `${dia(parceria.starts_at)} a ${dia(parceria.ends_at)}`
        : `a partir de ${dia(parceria.starts_at)}`,
      duracao: duracao(parceria.starts_at, parceria.ends_at),
      comissao: Number(parceria.commission_per_sale),
      fee: Number(parceria.fee_amount),
    },
    contrato: {
      // A data do fecho e a de hoje enquanto o contrato nao foi aceito. No
      // aceite ela congela junto com o resto do texto.
      data: porExtensoData(new Date().toISOString()),
      imagem_meses: imagemMeses,
    },
  }

  return {
    ...preencher(modelo.corpo, dados),
    templateId: modelo.id,
    templateVersao: modelo.versao,
    imagemMeses,
  }
}

/**
 * Garante que a parceria tem contrato, e mantem o texto em dia enquanto ele
 * ainda nao foi aceito.
 *
 * Contrato ACEITO nunca e tocado: o texto congelado e a prova, e regerar
 * apagaria exatamente o que o aceite serve para provar.
 */
export async function sincronizarContrato(partnershipId: string): Promise<void> {
  const db = createAdminClient()

  const { data: atual } = await db
    .from('contracts')
    .select('id, status')
    .eq('partnership_id', partnershipId)
    .maybeSingle()

  if (atual && (atual.status === 'aceito' || atual.status === 'descumprido')) return

  const montado = await montarContrato(partnershipId, 6)
  if (!montado) return

  if (atual) {
    await db.from('contracts')
      .update({ corpo: montado.corpo, template_id: montado.templateId,
                template_versao: montado.templateVersao })
      .eq('id', atual.id)
    return
  }

  await db.from('contracts').insert({
    partnership_id: partnershipId,
    template_id: montado.templateId,
    template_versao: montado.templateVersao,
    corpo: montado.corpo,
    // Nasce aguardando: o influenciador precisa preencher os dados dele antes
    // de o texto ficar completo, e e no portal que ele faz isso.
    status: 'aguardando',
    imagem_meses: montado.imagemMeses,
  })
}
