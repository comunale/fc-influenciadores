'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { FoxLogo } from '@/components/FoxLogo'

/**
 * Menu da área de quem indica. Duas telas e sair — e nenhum caminho para dentro
 * do sistema, como no portal do influenciador.
 */
export function NavDoIndicador({ nome, codigo }: { nome: string; codigo: string }) {
  const pathname = usePathname()

  async function sair() {
    await createClient().auth.signOut()
    window.location.href = '/indicador/login'
  }

  const itens = [
    { href: '/indicador', label: 'Minhas indicações' },
    { href: '/indicador/cartao', label: 'Meu cartão' },
  ]

  return (
    <header className="h-14 border-b border-[#1e1e1e] bg-[#0f0f0f] sticky top-0 z-20">
      <div className="max-w-5xl mx-auto h-full px-4 flex items-center gap-4">
        <FoxLogo size="sm" />

        <nav className="flex items-center gap-1">
          {itens.map((i) => {
            const ativo = pathname === i.href
            return (
              <Link
                key={i.href}
                href={i.href}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  ativo ? 'bg-[#00ff87]/10 text-[#00ff87]' : 'text-gray-400 hover:text-white'
                }`}
              >
                {i.label}
              </Link>
            )
          })}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <div className="text-white text-sm font-medium leading-tight">{nome}</div>
            <div className="text-gray-500 text-xs leading-tight">{codigo}</div>
          </div>
          <button
            onClick={sair}
            className="text-gray-500 hover:text-white text-sm transition-colors"
          >
            Sair
          </button>
        </div>
      </div>
    </header>
  )
}
