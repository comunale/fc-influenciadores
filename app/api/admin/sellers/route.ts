import { requireRole, createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// GET — lista os vendedores que quem chamou pode ver.
// Admin e financeiro veem todos; lojista só os da própria loja.
export async function GET() {
  const auth = await requireRole(['admin', 'finance', 'moderator'])
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const supabase = await createClient()

  let query = supabase
    .from('sellers')
    .select('id, name, store_name, active, created_at')
    .order('store_name')
    .order('name')

  if (auth.role === 'moderator') {
    const { data: profile } = await supabase
      .from('admin_profiles')
      .select('store_name')
      .eq('id', auth.userId)
      .single()

    // Lojista sem loja no perfil não pode ver a lista inteira: devolve vazio.
    if (!profile?.store_name) return NextResponse.json({ sellers: [] })
    query = query.eq('store_name', profile.store_name)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ sellers: data ?? [] })
}

// POST — cria um vendedor. Só admin.
export async function POST(request: Request) {
  const auth = await requireRole(['admin'])
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await request.json().catch(() => ({}))
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const storeName = typeof body.store_name === 'string' ? body.store_name.trim() : ''

  if (!name) return NextResponse.json({ error: 'Nome é obrigatório.' }, { status: 400 })
  if (!storeName) return NextResponse.json({ error: 'Loja é obrigatória.' }, { status: 400 })

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sellers')
    .insert({ name, store_name: storeName })
    .select('id, name, store_name, active, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ seller: data }, { status: 201 })
}

// PATCH — renomeia, troca de loja ou ativa/desativa. Só admin.
// Não existe DELETE de propósito: excluir levaria junto o histórico de
// quem validou o quê. Renomear corrige o nome em todo o histórico.
export async function PATCH(request: Request) {
  const auth = await requireRole(['admin'])
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await request.json().catch(() => ({}))
  const id = typeof body.id === 'string' ? body.id : ''
  if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })

  const update: { name?: string; store_name?: string; active?: boolean } = {}

  if (typeof body.name === 'string') {
    const name = body.name.trim()
    if (!name) return NextResponse.json({ error: 'Nome não pode ficar vazio.' }, { status: 400 })
    update.name = name
  }
  if (typeof body.store_name === 'string') {
    const storeName = body.store_name.trim()
    if (!storeName) return NextResponse.json({ error: 'Loja não pode ficar vazia.' }, { status: 400 })
    update.store_name = storeName
  }
  if (typeof body.active === 'boolean') {
    update.active = body.active
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nada para atualizar.' }, { status: 400 })
  }

  const supabase = await createClient()
  const { error } = await supabase.from('sellers').update(update).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
