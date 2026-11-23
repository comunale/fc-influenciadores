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
    // Programa de Indicacao: o Financeiro edita teto, encerra beneficio e
    // exporta quem tem a receber (decisao 9 da spec de 17/11).
    { path: '/admin/indicadores' },
    { path: '/admin/financeiro' },
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
  //
  // SÓ em produção. Deployment de preview mora num `*.vercel.app` por desenho:
  // sem este `if`, abrir qualquer rota do matcher num preview manda a pessoa
  // para o domínio oficial, que está rodando OUTRA versão do código — e a
  // página que ela queria testar aparece como 404. Descoberto em 23/11/2026,
  // ao subir o preview do Programa de Indicação.
  const emProducao = process.env.VERCEL_ENV === 'production' || !process.env.VERCEL_ENV
  const customDomain = process.env.NEXT_PUBLIC_SITE_URL
    ? new URL(process.env.NEXT_PUBLIC_SITE_URL).hostname
    : null
  const currentHost = request.headers.get('host') || ''
  if (emProducao && customDomain && currentHost !== customDomain && currentHost.includes('vercel.app')) {
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
  // A área de quem indica (Programa de Indicação) é uma TERCEIRA área, nem
  // admin nem portal: os termos são do programa, não de uma parceria.
  const isIndicadorRoute =
    pathname.startsWith('/indicador') && pathname !== '/indicador/login'
  const isLoginPage =
    pathname === '/admin/login' ||
    pathname === '/portal/login' ||
    pathname === '/indicador/login'

  // Não autenticado → login da área correspondente (preserva destino via ?next=)
  if ((isAdminRoute || isPortalRoute || isIndicadorRoute) && !user) {
    const next = encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search)
    const login = isPortalRoute
      ? '/portal/login'
      : isIndicadorRoute
        ? '/indicador/login'
        : '/admin/login'
    return NextResponse.redirect(new URL(`${login}?next=${next}`, request.url))
  }

  if ((isAdminRoute || isPortalRoute || isIndicadorRoute || isLoginPage) && user) {
    const { data: profile } = await supabase
      .from('admin_profiles')
      .select('role, active, senha_definida_at')
      .eq('id', user.id)
      .single()

    const ehInfluencer = profile?.role === 'influencer'
    const ehIndicador = profile?.role === 'indicador'
    const casa = ehInfluencer
      ? '/portal'
      : ehIndicador
        ? '/indicador'
        : ALLOWED_BY_ROLE[profile?.role ?? '']?.[0]?.path ?? '/admin'
    const portaDeEntrada = ehInfluencer
      ? '/portal/login'
      : ehIndicador
        ? '/indicador/login'
        : '/admin/login'

    // Perfil inativo ou ausente → desloga na porta por onde entrou
    if (profile && !profile.active) {
      await supabase.auth.signOut()
      return NextResponse.redirect(new URL(portaDeEntrada, request.url))
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
      if (ehInfluencer || ehIndicador) return NextResponse.redirect(new URL(casa, request.url))
      if (pathname === '/admin/login') return NextResponse.redirect(new URL(casa, request.url))
    }

    // A trava cruzada: cada um na sua área.
    if ((ehInfluencer || ehIndicador) && isAdminRoute) {
      return NextResponse.redirect(new URL(casa, request.url))
    }
    if (ehIndicador && isPortalRoute) {
      return NextResponse.redirect(new URL('/indicador', request.url))
    }
    // Quem não é indicador não tem o que fazer na área de quem indica -- nem o
    // influenciador, que tem a dele.
    if (!ehIndicador && isIndicadorRoute) {
      return NextResponse.redirect(new URL(casa, request.url))
    }

    // Senha ainda é a que o admin gerou e mandou por WhatsApp: o portal fica
    // fechado até ele definir a dele — contrato incluído. Não é sobre a força
    // da senha, é sobre a assinatura: um aceite dado com uma senha que o
    // contratante também conhece é um aceite que se contesta sozinho.
    //
    // Mora aqui, e não no layout, porque o layout não recebe o caminho e
    // redirecionaria a própria tela de senha para si mesma.
    if (
      ehInfluencer && isPortalRoute &&
      !profile?.senha_definida_at &&
      !pathname.startsWith('/portal/senha')
    ) {
      return NextResponse.redirect(new URL('/portal/senha', request.url))
    }
    if (!ehInfluencer && !ehIndicador && isPortalRoute) {
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
  // /c, /i e /indique entram pelo redirect de dominio legado (vercel.app -> dominio
  // customizado): sao links compartilhados por WhatsApp, e o 301 precisa valer
  // neles, nao so nas areas logadas.
  matcher: [
    '/admin/:path*',
    '/portal/:path*',
    '/indicador/:path*',
    '/c/:path*',
    '/i/:path*',
    '/indique',
  ],
}
