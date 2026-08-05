import { requireRole, createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { Role } from '@/lib/auth/roles'
import type { Database } from '@/lib/supabase/types'

type CouponUpdate = Database['public']['Tables']['coupons']['Update']

// Quais colunas cada papel pode escrever. O banco repete essa regra no trigger:
// se as duas discordarem, o banco vence e a API devolve 500 — o que é o certo.
const FIELDS_BY_ROLE: Record<Role, string[]> = {
  admin: ['status', 'customer_name', 'customer_phone', 'customer_email', 'customer_cpf',
          'verified', 'paid', 'invoice_number'],
  finance: ['verified', 'paid', 'invoice_number'],
  moderator: [],
}

// DELETE — exclui um ou mais cupons
export async function DELETE(request: Request) {
  const auth = await requireRole(['admin'])
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { ids } = await request.json().catch(() => ({ ids: [] }))
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'ids[] obrigatório' }, { status: 400 })
  }

  const supabase = await createClient()
  const { error: dbErr } = await supabase.from('coupons').delete().in('id', ids)
  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })

  return NextResponse.json({ deleted: ids.length })
}

// PATCH — edita dados de um cupom, respeitando o que o papel pode escrever
export async function PATCH(request: Request) {
  const auth = await requireRole(['admin', 'finance'])
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await request.json().catch(() => ({}))
  const { id, ...data } = body
  if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })

  const allowed = FIELDS_BY_ROLE[auth.role]
  const update: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(data)) {
    if (!allowed.includes(key)) continue
    if (key === 'verified' || key === 'paid') {
      update[key] = Boolean(value)
    } else {
      update[key] = String(value).trim()
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nenhum campo permitido para o seu perfil.' }, { status: 400 })
  }

  const supabase = await createClient()

  // NF obrigatória para conferir. O banco tem a mesma constraint; esta checagem
  // existe para devolver uma mensagem legível em vez do erro cru do Postgres.
  if (update.verified === true) {
    const nf = typeof update.invoice_number === 'string' ? update.invoice_number.trim() : ''
    if (!nf) {
      const { data: atual } = await supabase
        .from('coupons').select('invoice_number').eq('id', id).single()
      if (!atual?.invoice_number?.trim()) {
        return NextResponse.json(
          { error: 'Informe o número da NF antes de marcar como conferido.' },
          { status: 400 }
        )
      }
    }
  }

  // Carimbo de quem e quando — nunca vem do cliente.
  const now = new Date().toISOString()
  if ('verified' in update) {
    update.verified_at = update.verified ? now : null
    update.verified_by = update.verified ? auth.name : null
  }
  if ('paid' in update) {
    update.paid_at = update.paid ? now : null
    update.paid_by = update.paid ? auth.name : null
  }

  const { error: dbErr } = await supabase
    .from('coupons')
    .update(update as CouponUpdate)
    .eq('id', id)
  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
