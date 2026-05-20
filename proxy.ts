import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Rotas que moderadores NÃO podem acessar
const MODERATOR_BLOCKED = [
  '/admin',               // dashboard (exact)
  '/admin/influencers',
  '/admin/campanhas',
  '/admin/configuracoes',
]

export async function proxy(request: NextRequest) {
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

  // Não autenticado → login
  if (isAdminRoute && !user) {
    return NextResponse.redirect(new URL('/admin/login', request.url))
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
      const blocked = MODERATOR_BLOCKED.some(
        (p) => pathname === p || pathname.startsWith(p + '/')
      )
      if (blocked) {
        return NextResponse.redirect(new URL('/admin/validar', request.url))
      }
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/admin/:path*'],
}
