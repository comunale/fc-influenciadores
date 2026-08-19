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
    // Lê contrato para saber se pode pagar. Não edita — a página de um
    // contrato só abre para admin.
    { path: '/admin/contratos' },
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
  // O portal do influenciador é uma área separada, não uma versão reduzida do
  // admin. Quem é de dentro não tem o que fazer lá, e quem é de fora não sai de lá.
  const isPortalRoute = pathname.startsWith('/portal') && pathname !== '/portal/login'
  const isLoginPage = pathname === '/admin/login' || pathname === '/portal/login'

  // Não autenticado → login da área correspondente (preserva destino via ?next=)
  if ((isAdminRoute || isPortalRoute) && !user) {
    const next = encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search)
    const login = isPortalRoute ? '/portal/login' : '/admin/login'
    return NextResponse.redirect(new URL(`${login}?next=${next}`, request.url))
  }

  if ((isAdminRoute || isPortalRoute || isLoginPage) && user) {
    const { data: profile } = await supabase
      .from('admin_profiles')
      .select('role, active')
      .eq('id', user.id)
      .single()

    const ehInfluencer = profile?.role === 'influencer'
    const casa = ehInfluencer
      ? '/portal'
      : ALLOWED_BY_ROLE[profile?.role ?? '']?.[0]?.path ?? '/admin'

    // Perfil inativo ou ausente → desloga na porta por onde entrou
    if (profile && !profile.active) {
      await supabase.auth.signOut()
      return NextResponse.redirect(
        new URL(ehInfluencer ? '/portal/login' : '/admin/login', request.url)
      )
    }

    // Já logado numa tela de login.
    //
    // O influenciador vai direto para o portal, de qualquer uma das duas portas.
    // O usuário interno também, quando erra a porta do próprio admin.
    //
    // Mas um interno que abre /portal/login NÃO é expulso: normalmente é o
    // próprio César querendo entrar como influenciador para conferir o portal, e
    // devolvê-lo ao admin sem explicação parece um bug do sistema. A página
    // conta o que está acontecendo e oferece sair.
    if (isLoginPage) {
      if (ehInfluencer) return NextResponse.redirect(new URL('/portal', request.url))
      if (pathname === '/admin/login') return NextResponse.redirect(new URL(casa, request.url))
    }

    // A trava cruzada: cada um na sua área.
    if (ehInfluencer && isAdminRoute) {
      return NextResponse.redirect(new URL('/portal', request.url))
    }
    if (!ehInfluencer && isPortalRoute) {
      return NextResponse.redirect(new URL(casa, request.url))
    }

    // Papéis internos não-admin só entram nas rotas da sua lista
    if (isAdminRoute && profile?.role && profile.role !== 'admin') {
      if (!isAllowed(profile.role, pathname)) {
        return NextResponse.redirect(new URL(casa, request.url))
      }
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/admin/:path*', '/portal/:path*', '/c/:path*'],
}
