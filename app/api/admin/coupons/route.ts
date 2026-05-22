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

  const allowed = ['status', 'customer_name', 'customer_phone', 'customer_email', 'customer_cpf']
  const update: Record<string, string> = {}
  for (const key of allowed) {
    if (data[key] !== undefined) update[key] = String(data[key]).trim()
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nenhum campo válido para atualizar' }, { status: 400 })
  }

  const { error: dbErr } = await supabase.from('coupons').update(update).eq('id', id)
  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
