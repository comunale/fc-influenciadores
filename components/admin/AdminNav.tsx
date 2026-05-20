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
  { href: '/admin/validar', label: 'Validar', icon: '✓', roles: ['admin', 'store'] },
  { href: '/admin', label: 'Dashboard', icon: '◈', roles: ['admin'] },
  { href: '/admin/cupons', label: 'Cupons', icon: '⊞', roles: ['admin'] },
  { href: '/admin/influencers', label: 'Influencers', icon: '★', roles: ['admin'] },
  { href: '/admin/campanhas', label: 'Campanhas', icon: '◉', roles: ['admin'] },
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

  return (
    <>
      {/* Desktop nav */}
      <header className="hidden md:flex bg-[#141414] border-b border-[#1e1e1e] px-6 py-3 items-center justify-between">
        <div className="flex items-center gap-8">
          <FoxLogo size="sm" />
          <nav className="flex items-center gap-1">
            {visibleItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  pathname === item.href
                    ? 'bg-[#00ff87] text-black'
                    : 'text-gray-400 hover:text-white hover:bg-[#1e1e1e]'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-gray-500">{userName || userEmail}</span>
          <button
            onClick={handleLogout}
            className="text-xs text-gray-500 hover:text-red-400 transition-colors"
          >
            Sair
          </button>
        </div>
      </header>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#141414] border-t border-[#1e1e1e] flex">
        {visibleItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex-1 flex flex-col items-center gap-1 py-3 text-xs font-medium transition-colors ${
              pathname === item.href ? 'text-[#00ff87]' : 'text-gray-500'
            }`}
          >
            <span className="text-lg leading-none">{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        ))}
        <button
          onClick={handleLogout}
          className="flex-1 flex flex-col items-center gap-1 py-3 text-xs font-medium text-gray-500"
        >
          <span className="text-lg leading-none">⎋</span>
          <span>Sair</span>
        </button>
      </nav>

      {/* Espaço pra bottom nav mobile */}
      <div className="md:hidden h-16" />
    </>
  )
}
