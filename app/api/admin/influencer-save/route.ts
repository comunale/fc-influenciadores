import { requireRole, createClient } from '@/lib/supabase/server'
import { mensagemDeErro } from '@/lib/db-errors'
import { NextResponse } from 'next/server'
import type { Database } from '@/lib/supabase/types'

// O arquivo de tipos deste projeto é enxuto e não traz os utilitários do
// Supabase; o caminho longo é o que existe.
type Update<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update']

/**
 * Salva a ficha do influenciador INTEIRA, numa chamada.
 *
 * "Editar é editar. Edita tudo." -- o César, em 02/10/2026, olhando um sistema
 * em que configurar uma pessoa exigia passar por seis telas e nenhuma salvava
 * tudo.
 *
 * Os dados de uma pessoa moram em quatro tabelas, por razões de segurança que
 * continuam valendo: `influencers` é lida por todo papel interno, a ficha e o
 * bancário são só de admin e Financeiro. Essa separação é do BANCO -- não tem
 * por que vazar para a tela.
 *
 * O que NÃO entra aqui, de propósito:
 *  - renovar parceria, que encerra uma e abre outra. Não é editar, é um evento,
 *    e tem regra própria de histórico.
 *  - acesso ao portal, que é conta de autenticação, não campo de cadastro.
 */

const CAMPOS_FICHA = [
  'cpf', 'estado_civil', 'endereco', 'cep',
  'telefone', 'cidade', 'nicho', 'seguidores', 'observacoes',
] as const

const CAMPOS_BANCO = [
  'payment_method', 'pix_key', 'bank_name', 'bank_agency',
  'bank_account', 'payment_document', 'payment_notes',
] as const

const CAMPOS_ACORDO = [
  'fee_amount', 'fee_timing', 'commission_per_sale', 'commission_starts_at',
  'payment_schedule', 'discount_type', 'discount_value', 'validity_days',
  'coupon_title', 'coupon_description', 'ends_at',
] as const

const NUMERICOS = new Set([
  'seguidores', 'fee_amount', 'commission_per_sale',
  'commission_starts_at', 'discount_value', 'validity_days',
])

/** Texto vira null quando vazio; número vira número, e texto no lugar de número é erro. */
function limpar(campo: string, v: unknown): string | number | null | undefined {
  if (v === undefined) return undefined
  if (NUMERICOS.has(campo)) {
    if (v === '' || v === null) return null
    const n = Number(v)
    if (Number.isNaN(n)) throw new Error(`O campo ${campo} precisa ser um número.`)
    return n
  }
  return typeof v === 'string' ? v.trim() || null : null
}

function recolher(corpo: Record<string, unknown>, campos: readonly string[]) {
  const saida: Record<string, string | number | null> = {}
  for (const c of campos) {
    if (!(c in corpo)) continue
    const v = limpar(c, corpo[c])
    if (v !== undefined) saida[c] = v
  }
  return saida
}

export async function POST(request: Request) {
  try {
    const auth = await requireRole(['admin'])
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const corpo = await request.json()
    const { influencer_id, parceria_id, pessoa } = corpo
    if (!influencer_id) {
      return NextResponse.json({ error: 'Influenciador é obrigatório.' }, { status: 400 })
    }

    const supabase = await createClient()

    // 1) A pessoa, na tabela que todo papel interno lê.
    if (pessoa && typeof pessoa === 'object') {
      const p = pessoa as Record<string, unknown>
      const dados: Record<string, string | boolean> = {}
      if (typeof p.name === 'string' && p.name.trim()) dados.name = p.name.trim()
      if (typeof p.instagram_handle === 'string' && p.instagram_handle.trim()) {
        dados.instagram_handle = p.instagram_handle.trim()
      }
      if (typeof p.coupon_code === 'string' && p.coupon_code.trim()) {
        dados.coupon_code = p.coupon_code.trim().toUpperCase()
      }
      if (typeof p.active === 'boolean') dados.active = p.active

      if (Object.keys(dados).length) {
        const { error } = await supabase.from('influencers')
          .update(dados as Update<'influencers'>).eq('id', influencer_id)
        if (error) {
          return NextResponse.json({ error: mensagemDeErro(error.message) }, { status: 400 })
        }
      }
    }

    // 2) A ficha privada: contato, qualificação, observações.
    const ficha = recolher(corpo, CAMPOS_FICHA)
    if (Object.keys(ficha).length) {
      const { error } = await supabase.from('influencer_ficha').upsert(
        { influencer_id, ...ficha, updated_at: new Date().toISOString() },
        { onConflict: 'influencer_id' }
      )
      if (error) return NextResponse.json({ error: mensagemDeErro(error.message) }, { status: 400 })
    }

    // 3) O bancário.
    const banco = recolher(corpo, CAMPOS_BANCO)
    if (Object.keys(banco).length) {
      const { error } = await supabase.from('influencer_payment_info').upsert(
        { influencer_id, ...banco, updated_at: new Date().toISOString(), updated_by: auth.userId },
        { onConflict: 'influencer_id' }
      )
      if (error) return NextResponse.json({ error: mensagemDeErro(error.message) }, { status: 400 })
    }

    // 4) Os termos do acordo, na parceria ATIVA. Alterar aqui muda o combinado
    //    daqui para a frente; os cupons já gerados guardam o retrato do que
    //    valia quando nasceram e não são tocados (migration 008).
    if (parceria_id) {
      const acordo = recolher(corpo, CAMPOS_ACORDO)
      if (Object.keys(acordo).length) {
        const { error } = await supabase.from('partnerships')
          .update(acordo as Update<'partnerships'>).eq('id', parceria_id)
        if (error) {
          return NextResponse.json({ error: mensagemDeErro(error.message) }, { status: 400 })
        }
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro interno.'
    console.error('influencer-save error:', err)
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
