import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Rotas que cada papel pode acessar. A primeira entrada é o destino do
// redirect quando a rota pedida não é permitida. `exact` existe para o
// dashboard: '/admin' como prefixo casaria com '/admin/qualquer-coisa' e
// liberaria o sistema inteiro para quem só deveria ver o dashboard.
type RouteRule = { path: string; exact?: boolean }

const ALLOWED_BY_ROLE: Record<string, RouteRule[]> = {
  admin: [{ path: '/admin' }],
  finance: [
    { path: '/admin/cupons' },
    { path: '/admin', exact: true },
    { path: '/admin/influencers' },
  ],
  moderator: [
    { path: '/admin/validar' },
    { path: '/admin/cupons' },
  ],
}

function isAllowed(role: string, pathname: string): boolean {
  if (role === 'admin') return true
  const rules = ALLOWED_BY_ROLE[role] ?? []
  return rules.some((r) =>
    r.exact ? pathname === r.path : pathname === r.path || pathname.startsWith(r.path + '/')
  )
}

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

    // Papéis não-admin só entram nas rotas da sua lista
    if (profile?.role && profile.role !== 'admin') {
      if (!isAllowed(profile.role, pathname)) {
        const home = ALLOWED_BY_ROLE[profile.role]?.[0]?.path ?? '/admin/validar'
        return NextResponse.redirect(new URL(home, request.url))
      }
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/admin/:path*', '/c/:path*'],
}
