'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'
import { FoxLogo } from '@/components/FoxLogo'

interface AdminNavProps {
  userEmail: string
  userName: string
  userRole: string
}

const navItems = [
  {
    href: '/admin/validar',
    label: 'Validar Cupom',
    shortLabel: 'Validar',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    roles: ['admin', 'store'],
  },
  {
    href: '/admin',
    label: 'Dashboard',
    shortLabel: 'Dashboard',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
      </svg>
    ),
    roles: ['admin'],
  },
  {
    href: '/admin/cupons',
    label: 'Cupons',
    shortLabel: 'Cupons',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
      </svg>
    ),
    roles: ['admin'],
  },
  {
    href: '/admin/influencers',
    label: 'Influencers',
    shortLabel: 'Influencers',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    roles: ['admin'],
  },
  {
    href: '/admin/campanhas',
    label: 'Campanhas',
    shortLabel: 'Campanhas',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
      </svg>
    ),
    roles: ['admin'],
  },
  {
    href: '/admin/configuracoes',
    label: 'Configurações',
    shortLabel: 'Config.',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    roles: ['admin'],
  },
]

export function AdminNav({ userEmail, userName, userRole }: AdminNavProps) {
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    toast.success('Saiu do sistema.')
    router.push('/admin/login')
    router.refresh()
  }

  const visibleItems = navItems.filter((item) => item.roles.includes(userRole))

  function isActive(href: string) {
    if (href === '/admin') return pathname === '/admin'
    return pathname.startsWith(href)
  }

  return (
    <>
      {/* ── DESKTOP: barra lateral esquerda ── */}
      <aside className="hidden md:flex flex-col w-56 min-h-screen bg-[#0d0d0d] border-r border-[#1e1e1e] fixed top-0 left-0 z-40">
        {/* Logo */}
        <div className="px-4 py-5 border-b border-[#1e1e1e]">
          <FoxLogo size="sm" />
        </div>

        {/* Links */}
        <nav className="flex-1 p-3 flex flex-col gap-1">
          {visibleItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive(item.href)
                  ? 'bg-[#00ff87] text-black'
                  : 'text-gray-400 hover:text-white hover:bg-[#1e1e1e]'
              }`}
            >
              {item.icon}
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Rodapé usuário */}
        <div className="p-4 border-t border-[#1e1e1e] flex flex-col gap-2">
          <p className="text-xs text-gray-400 font-medium truncate">{userName || userEmail}</p>
          <p className="text-xs text-gray-600 truncate">{userEmail}</p>
          <button
            onClick={handleLogout}
            className="mt-1 text-xs text-gray-500 hover:text-red-400 transition-colors text-left"
          >
            Sair do sistema →
          </button>
        </div>
      </aside>

      {/* ── MOBILE: barra inferior fixada ── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#0d0d0d] border-t border-[#1e1e1e] flex safe-area-pb">
        {visibleItems.slice(0, 4).map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium transition-colors ${
              isActive(item.href) ? 'text-[#00ff87]' : 'text-gray-500'
            }`}
          >
            {item.icon}
            <span>{item.shortLabel}</span>
          </Link>
        ))}
        <button
          onClick={handleLogout}
          className="flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium text-gray-500"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          <span>Sair</span>
        </button>
      </nav>
    </>
  )
}
