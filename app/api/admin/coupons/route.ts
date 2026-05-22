import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized', status: 401, supabase: null }
  const { data: profile } = await supabase.from('admin_profiles').select('role, active').eq('id', user.id).single()
  if (!profile?.active || profile.role !== 'admin') return { error: 'Forbidden', status: 403, supabase: null }
  return { error: null, status: 200, supabase }
}

// DELETE — exclui um ou mais cupons
export async function DELETE(request: Request) {
  const { error, status, supabase } = await requireAdmin()
  if (error || !supabase) return NextResponse.json({ error }, { status })

  const { ids } = await request.json().catch(() => ({ ids: [] }))
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'ids[] obrigatório' }, { status: 400 })
  }

  const { error: dbErr } = await supabase.from('coupons').delete().in('id', ids)
  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })

  return NextResponse.json({ deleted: ids.length })
}

// PATCH — edita dados de um cupom
export async function PATCH(request: Request) {
  const { error, status, supabase } = await requireAdmin()
  if (error || !supabase) return NextResponse.json({ error }, { status })

  const body = await request.json().catch(() => ({}))
  const { id, ...data } = body
  if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })

  const update: {
    status?: string
    customer_name?: string
    customer_phone?: string
    customer_email?: string
    customer_cpf?: string
  } = {}

  if (data.status !== undefined)         update.status         = String(data.status).trim()
  if (data.customer_name !== undefined)  update.customer_name  = String(data.customer_name).trim()
  if (data.customer_phone !== undefined) update.customer_phone = String(data.customer_phone).trim()
  if (data.customer_email !== undefined) update.customer_email = String(data.customer_email).trim()
  if (data.customer_cpf !== undefined)   update.customer_cpf   = String(data.customer_cpf).trim()

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nenhum campo válido para atualizar' }, { status: 400 })
  }

  const { error: dbErr } = await supabase.from('coupons').update(update).eq('id', id)
  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
