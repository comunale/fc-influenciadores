'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'

/**
 * O link que o influenciador põe na bio e nos stories.
 *
 * É o mesmo em toda parceria: ele mora no influenciador, não no acordo. Renovar
 * troca para onde o link olha, nunca o link -- senão cada renovação obrigaria
 * ele a trocar a bio.
 */
export function LinkDoInfluencer({ couponCode }: { couponCode: string }) {
  const [copiado, setCopiado] = useState(false)
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://influenciadores.foxcycles.com.br'
  const url = `${base}/c/${couponCode}`

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url)
      setCopiado(true)
      toast.success('Link copiado!')
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      toast.error('Não foi possível copiar. Selecione o link e copie na mão.')
    }
  }

  return (
    <div className="bg-[#141414] border border-[#00ff87]/30 rounded-2xl p-5">
      <div className="text-[#00ff87] text-xs font-bold uppercase tracking-wider">Seu link</div>
      <div className="flex items-center gap-3 mt-2 flex-wrap">
        <code className="text-white text-sm break-all flex-1 min-w-0">{url}</code>
        <button
          onClick={copiar}
          className="shrink-0 bg-[#00ff87] text-black text-sm font-bold rounded-lg px-4 py-2 hover:bg-[#00e078] transition-colors"
        >
          {copiado ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      <p className="text-gray-500 text-xs mt-3 leading-relaxed">
        Coloque na sua bio e nos stories. Quem abrir preenche os próprios dados e
        recebe o cupom na hora.
      </p>
    </div>
  )
}
