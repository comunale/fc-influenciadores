'use client'

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { FoxLogo } from '@/components/FoxLogo'

/**
 * O cartão de benefícios: nome, código, link e QR, numa arte só.
 *
 * É a entrega da decisão 16 — o cartão é uma página da ferramenta, não um
 * plástico. A pessoa mostra a tela, imprime, ou manda o print no WhatsApp.
 *
 * O QR é gerado no navegador porque a URL depende do domínio por onde ela
 * entrou, e um QR com o domínio errado é um QR que não funciona.
 */
export function CartaoDeBeneficios({ nome, codigo }: { nome: string; codigo: string }) {
  const [qr, setQr] = useState('')
  const [origem, setOrigem] = useState('')

  useEffect(() => setOrigem(window.location.origin), [])

  const link = origem ? `${origem}/i/${codigo}` : ''

  useEffect(() => {
    if (!link) return
    QRCode.toDataURL(link, {
      width: 420,
      margin: 1,
      color: { dark: '#000000', light: '#00ff87' },
    })
      .then(setQr)
      .catch(() => {})
  }, [link])

  return (
    <div className="flex flex-col items-center gap-5">
      <div
        id="cartao"
        className="w-full max-w-sm bg-gradient-to-b from-[#141414] to-[#0f0f0f] border border-[#2a2a2a] rounded-2xl p-6 flex flex-col items-center gap-5"
      >
        <div className="w-full flex items-center justify-between">
          <FoxLogo size="sm" />
          <span className="text-[10px] uppercase tracking-widest text-gray-500">
            Cartão de Benefícios
          </span>
        </div>

        <div className="text-center">
          <div className="text-white font-bold text-lg leading-tight">{nome}</div>
          <div className="text-gray-500 text-xs mt-1">Programa de Indicação FoxCycles</div>
        </div>

        <div className="bg-[#00ff87] rounded-xl p-3">
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt="QR do seu link" className="w-40 h-40" />
          ) : (
            <div className="w-40 h-40 animate-pulse bg-[#00ff87]/60 rounded" />
          )}
        </div>

        <div className="text-center">
          <div className="text-gray-500 text-[10px] uppercase tracking-widest">Seu código</div>
          <div className="text-[#00ff87] font-black text-2xl tracking-wider">{codigo}</div>
        </div>

        <div className="w-full border-t border-[#2a2a2a] pt-4 text-center">
          <p className="text-gray-400 text-xs leading-relaxed">
            Quem comprar <strong className="text-white">pelo seu link</strong> leva{' '}
            <strong className="text-white">R$ 300</strong> de
            desconto. Você recebe <strong className="text-white">R$ 200</strong> por venda
            conferida.
          </p>
        </div>
      </div>

      <div className="flex gap-3 w-full max-w-sm no-print">
        <Button
          type="button"
          variant="secondary"
          className="flex-1"
          onClick={() => {
            navigator.clipboard
              .writeText(link)
              .then(() => toast.success('Link copiado.'))
              .catch(() => toast.error('Copie o link à mão.'))
          }}
        >
          Copiar link
        </Button>
        <Button
          type="button"
          className="flex-1 font-bold text-black"
          onClick={() => window.print()}
        >
          Imprimir
        </Button>
      </div>

      <style>{`
        @media print {
          header, .no-print { display: none !important; }
          body { background: #fff !important; }
          #cartao { border-color: #ccc !important; background: #fff !important; }
          #cartao * { color: #000 !important; }
        }
      `}</style>
    </div>
  )
}
