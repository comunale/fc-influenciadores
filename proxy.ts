import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Sub-rotas bloqueadas para moderadores (além do dashboard /admin exato)
const MODERATOR_BLOCKED_PREFIXES = [
  '/admin/configuracoes',
  '/admin/usuarios',
]

export async function proxy(request: NextRequest) {
  // Redireciona domínio legado Vercel → domínio customizado (301 permanente)
  const customDomain = process.env.NEXT_PUBLIC_SITE_URL
    ? new URL(process.env.NEXT_PUBLIC_SITE_URL).hostname
    : null
  const currentHost = request.headers.get('host') || ''
  if (customDomain && currentHost !== customDomain && currentHost.includes('vercel.app')) {
    const target = new URL(request.url)
    target.hostname = customDomain
    target.protocol = 'https:'
    return NextResponse.redirect(target.toString(), { status: 301 })
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const { pathname } = request.nextUrl

  const isAdminRoute = pathname.startsWith('/admin') && pathname !== '/admin/login'

  // Não autenticado → login (preserva destino via ?next=)
  if (isAdminRoute && !user) {
    const next = encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search)
    return NextResponse.redirect(new URL(`/admin/login?next=${next}`, request.url))
  }

  // Já logado tentando acessar /admin/login → vai pro dashboard
  if (pathname === '/admin/login' && user) {
    return NextResponse.redirect(new URL('/admin', request.url))
  }

  // Verificar permissão de moderador
  if (isAdminRoute && user) {
    const { data: profile } = await supabase
      .from('admin_profiles')
      .select('role, active')
      .eq('id', user.id)
      .single()

    // Perfil inativo ou ausente → desloga
    if (profile && !profile.active) {
      await supabase.auth.signOut()
      return NextResponse.redirect(new URL('/admin/login', request.url))
    }

    // Moderador não pode acessar rotas de admin pleno
    if (profile?.role === 'moderator') {
      const isDashboard = pathname === '/admin'
      const isBlockedPrefix = MODERATOR_BLOCKED_PREFIXES.some(
        (p) => pathname === p || pathname.startsWith(p + '/')
      )
      if (isDashboard || isBlockedPrefix) {
        return NextResponse.redirect(new URL('/admin/validar', request.url))
      }
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/admin/:path*', '/c/:path*'],
}
