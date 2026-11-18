import { NextResponse } from 'next/server'
import { createClient, requireRole } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'

/**
 * Teto de usos e encerramento do benefício — as duas únicas coisas que a tela
 * edita (decisão 9 da spec de 17/11).
 *
 * Usa a sessão do usuário (`createClient`), nunca o service role: é a policy
 * `indicadores_update` da migration 036 que limita isso a admin e financeiro, e
 * passar por cima dela entregaria a edição a qualquer papel. Foi exatamente o
 * que aconteceu com /api/admin/contracts, que ficou de 19/08 a 12/11 sem
 * funcionar por usar a chave de serviço num lugar que dependia de auth.uid().
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(['admin', 'finance'])
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id } = await params
  const supabase = await createClient()

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Corpo inválido.' }, { status: 400 })
  }

  const b = (body ?? {}) as Record<string, unknown>
  // Tipado pelo Update da tabela: Record<string, unknown> faz o PostgREST
  // recusar o objeto inteiro no tsc.
  const mudancas: Database['public']['Tables']['indicadores']['Update'] = {}

  if ('teto_usos' in b) {
    const v = b.teto_usos
    if (v === null) {
      mudancas.teto_usos = null
    } else if (typeof v === 'number' && Number.isInteger(v) && v > 0) {
      mudancas.teto_usos = v
    } else {
      return NextResponse.json(
        { error: 'O teto é um número inteiro maior que zero, ou nulo para sem teto.' },
        { status: 400 }
      )
    }
  }

  if ('ativo' in b) {
    if (typeof b.ativo !== 'boolean') {
      return NextResponse.json({ error: 'Situação inválida.' }, { status: 400 })
    }
    mudancas.ativo = b.ativo
    // O CHECK indicadores_encerramento_coerente exige a data junto: encerrado
    // sem data não entra no banco, e é de propósito -- "quando" é a metade da
    // informação que importa quando alguém pergunta por que o link parou.
    mudancas.encerrado_em = b.ativo ? null : new Date().toISOString()
    mudancas.encerrado_por = b.ativo ? null : auth.name
  }

  if (Object.keys(mudancas).length === 0) {
    return NextResponse.json({ error: 'Nada para alterar.' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('indicadores')
    .update(mudancas)
    .eq('id', id)
    .select('id, nome, teto_usos, ativo, encerrado_em')
    .maybeSingle()

  if (error) {
    console.error('admin/indicadores PATCH:', error)
    return NextResponse.json({ error: 'Erro ao salvar.' }, { status: 500 })
  }
  // A RLS devolve zero linhas quando o papel não alcança a tabela, e isso não
  // é erro para o PostgREST. Sem esta checagem a tela diria "salvo" sem ter
  // salvo nada.
  if (!data) {
    return NextResponse.json(
      { error: 'Indicador não encontrado, ou seu perfil não pode editar.' },
      { status: 404 }
    )
  }

  return NextResponse.json({ indicador: data })
}
