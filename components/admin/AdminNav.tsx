'use client'

import Link from 'next/link'
import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'
import { FoxLogo } from '@/components/FoxLogo'

interface AdminNavProps {
  userEmail: string
  userRole: string
}

const ALL_NAV = [
  { href: '/admin',               label: 'Dashboard',     exact: true,  roles: ['admin', 'finance'] },
  { href: '/admin/validar',       label: 'Validar',       exact: false, roles: ['admin', 'moderator'] },
  { href: '/admin/cupons',        label: 'Cupons',        exact: false, roles: ['admin', 'finance', 'moderator'] },
  { href: '/admin/influencers',   label: 'Influencers',   exact: false, roles: ['admin', 'finance', 'moderator'] },
  { href: '/admin/campanhas',     label: 'Campanhas',     exact: false, roles: ['admin', 'moderator'] },
  { href: '/admin/configuracoes', label: 'Configurações', exact: false, roles: ['admin'] },
]

export function AdminNav({ userEmail, userRole }: AdminNavProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)

  const visible = ALL_NAV.filter((i) => i.roles.includes(userRole))

  function isActive(item: (typeof ALL_NAV)[0]) {
    return item.exact ? pathname === item.href : pathname.startsWith(item.href)
  }

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    toast.success('Saiu do sistema.')
    router.push('/admin/login')
    router.refresh()
  }

  return (
    <>
      {/* ── BARRA FIXA ── */}
      <header className="fixed top-0 left-0 right-0 z-50 h-14 bg-[#0d0d0d] border-b border-[#1e1e1e] flex items-center px-4 gap-3">
        <Link href="/admin" className="flex-shrink-0 mr-1">
          <FoxLogo size="sm" />
        </Link>

        {/* Links — desktop */}
        <nav className="hidden md:flex items-center gap-0.5 flex-1 overflow-x-auto">
          {visible.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${
                isActive(item)
                  ? 'bg-[#00ff87] text-black'
                  : 'text-gray-400 hover:text-white hover:bg-[#1e1e1e]'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Email + Sair — desktop */}
        <div className="hidden md:flex items-center gap-3 flex-shrink-0 ml-auto">
          <span className="text-xs text-gray-500 max-w-[200px] truncate">{userEmail}</span>
          <button
            onClick={handleLogout}
            className="text-xs text-gray-500 hover:text-red-400 border border-[#2a2a2a] hover:border-red-800 px-3 py-1.5 rounded-md transition-colors"
          >
            Sair
          </button>
        </div>

        {/* Hambúrguer — mobile */}
        <button
          className="md:hidden ml-auto p-2 text-gray-400 hover:text-white"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="Menu"
        >
          {menuOpen ? (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </header>

      {/* ── MENU MOBILE ── */}
      {menuOpen && (
        <div className="md:hidden fixed top-14 left-0 right-0 z-40 bg-[#0d0d0d] border-b border-[#1e1e1e] shadow-xl">
          <nav className="flex flex-col p-3 gap-1">
            {visible.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                className={`px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                  isActive(item) ? 'bg-[#00ff87] text-black' : 'text-gray-300 hover:bg-[#1e1e1e]'
                }`}
              >
                {item.label}
              </Link>
            ))}
            <div className="border-t border-[#1e1e1e] mt-2 pt-3 px-4 flex items-center justify-between">
              <span className="text-xs text-gray-500 truncate max-w-[200px]">{userEmail}</span>
              <button onClick={handleLogout} className="text-xs text-red-400 hover:text-red-300 ml-2 flex-shrink-0">
                Sair →
              </button>
            </div>
          </nav>
        </div>
      )}

      {/* Espaçador para o header fixo */}
      <div className="h-14" />
    </>
  )
}
