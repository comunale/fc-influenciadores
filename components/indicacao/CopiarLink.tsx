'use client'

import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'

/**
 * O link dela, com copiar e compartilhar.
 *
 * A URL é montada no navegador de propósito: o servidor não sabe por qual
 * domínio a pessoa entrou, e um link com o domínio errado é um link que não
 * funciona para quem recebe.
 */
export function CopiarLink({ codigo }: { codigo: string }) {
  const [origem, setOrigem] = useState('')

  useEffect(() => setOrigem(window.location.origin), [])

  const link = origem ? `${origem}/i/${codigo}` : `/i/${codigo}`

  function copiar() {
    navigator.clipboard
      .writeText(link)
      .then(() => toast.success('Link copiado.'))
      .catch(() => toast.error('Copie o link à mão.'))
  }

  async function compartilhar() {
    const texto = `Comprei a ideia: R$ 300 de desconto na sua moto elétrica FoxCycles. É por aqui: ${link}`
    if (navigator.share) {
      try {
        await navigator.share({ title: 'FoxCycles', text: texto, url: link })
        return
      } catch {
        // Cancelou o compartilhamento. Não é erro.
        return
      }
    }
    copiar()
  }

  return (
    <div className="bg-[#141414] border border-[#1e1e1e] rounded-2xl p-5 flex flex-col gap-3">
      <div>
        <div className="text-gray-500 text-xs">Seu link</div>
        <div className="text-white text-sm break-all mt-1 bg-[#1e1e1e] rounded-lg px-3 py-2">
          {link}
        </div>
      </div>
      <div className="flex gap-3">
        <Button type="button" variant="secondary" onClick={copiar} className="flex-1">
          Copiar
        </Button>
        <Button
          type="button"
          onClick={compartilhar}
          className="flex-1 font-bold text-black"
        >
          Compartilhar
        </Button>
      </div>
    </div>
  )
}
