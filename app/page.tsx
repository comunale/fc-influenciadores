import Link from 'next/link'
import { FoxLogo } from '@/components/FoxLogo'

export default function Home() {
  return (
    <main className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center px-4 relative">
      <div className="flex flex-col items-center gap-8 text-center">
        <FoxLogo size="lg" />

        <div className="flex flex-col gap-2">
          <h1 className="text-white font-black text-3xl tracking-tight">
            Sistema de Cupons Promocionais
          </h1>
          <p className="text-gray-500 text-sm">FoxCycles · Campinas, SP</p>
        </div>

        <Link
          href="/admin/login"
          className="h-14 px-10 rounded-xl bg-[#00ff87] text-black font-bold text-lg flex items-center justify-center hover:bg-[#00e67a] transition-colors"
        >
          Entrar no Sistema
        </Link>
      </div>

      <footer className="absolute bottom-6 text-gray-600 text-xs">
        © {new Date().getFullYear()} FoxCycles · Todos os direitos reservados
      </footer>
    </main>
  )
}
