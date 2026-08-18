'use client'

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

/**
 * QR do link do influenciador, para o CLIENTE gerar o próprio cupom no balcão.
 *
 * Substitui o formulário express, que o Lojista perdeu em 18/08/2026.
 *
 * O motivo: até então o vendedor conseguia, sozinho e em vinte segundos, criar
 * um cupom já validado atribuído a qualquer influenciador — sem nenhuma
 * evidência de que a indicação existiu. Dos cupons usados no programa, 100%
 * vieram desse caminho, do mesmo vendedor, para o mesmo influenciador.
 *
 * Com o QR, quem preenche é o cliente, no aparelho dele. O vendedor não
 * consegue mais fabricar uma indicação.
 *
 * Ver docs/superpowers/specs/2026-07-28-cupom-express-anti-abuso-design.md
 */
export function ExpressQR({
  couponCode,
  handle,
  descontoLabel,
  validityDays,
}: {
  couponCode: string
  handle: string
  descontoLabel: string
  validityDays: number
}) {
  const [qr, setQr] = useState('')
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://influenciadores.foxcycles.com.br'
  const url = `${siteUrl}/c/${couponCode}`

  useEffect(() => {
    QRCode.toDataURL(url, { width: 480, margin: 1 })
      .then(setQr)
      .catch(() => setQr(''))
  }, [url])

  return (
    <div className="bg-[#141414] border border-[#00ff87]/30 rounded-xl p-6 flex flex-col items-center gap-4">
      <div className="text-center">
        <div className="text-xs text-[#00ff87] font-bold uppercase tracking-wider">Indicado por</div>
        <div className="text-white font-bold text-xl mt-1">{handle}</div>
        <div className="text-[#00ff87] font-black text-3xl mt-2">{descontoLabel}</div>
        <div className="text-gray-400 text-xs">válido por {validityDays} dias</div>
      </div>

      {qr && (
        <div className="bg-white p-3 rounded-xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="QR Code do link do influencer" className="w-56 h-56" />
        </div>
      )}

      <p className="text-gray-300 text-sm text-center leading-relaxed">
        Peça para <span className="text-white font-semibold">o cliente</span> apontar a
        câmera do celular dele para este código e preencher os próprios dados.
      </p>
      <p className="text-gray-600 text-xs text-center">
        Depois é só digitar aqui o código do cupom que ele receber.
      </p>
    </div>
  )
}
