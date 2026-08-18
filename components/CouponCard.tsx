'use client'

import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import toast from 'react-hot-toast'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { Coupon, Influencer } from '@/lib/supabase/types'

interface CouponCardProps {
  coupon: Coupon & {
    // O desconto vem do RETRATO no proprio cupom (migration 008). Os textos vem
    // da PARCERIA em que o cupom nasceu (migration 010).
    influencers: Pick<Influencer, 'name' | 'instagram_handle'>
    partnerships: { coupon_title: string | null; coupon_description: string | null } | null
  }
}

export function CouponCard({ coupon }: CouponCardProps) {
  const couponRef = useRef<HTMLDivElement>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string>('')
  const [busy, setBusy] = useState<'jpg' | 'print' | null>(null)
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://influenciadores.foxcycles.com.br'
  const qrUrl = `${siteUrl}/admin/validar?codigo=${coupon.coupon_number}`

  // Gera QR Code como data URL (mais compatível com html2canvas que <canvas>)
  useEffect(() => {
    QRCode.toDataURL(qrUrl, {
      width: 200,
      margin: 1,
      color: { dark: '#000000', light: '#00ff87' },
    }).then(setQrDataUrl).catch(() => {})
  }, [qrUrl])

  const discountLabel =
    coupon.discount_type === 'fixed'
      ? formatCurrency(coupon.discount_value ?? 0)
      : `${coupon.discount_value ?? 0}%`

  const isExpired = new Date(coupon.expires_at) < new Date()
  const isUsed = coupon.status === 'used'

  async function captureAsJpeg(): Promise<string> {
    if (!couponRef.current) throw new Error('ref missing')
    const { toJpeg } = await import('html-to-image')
    return toJpeg(couponRef.current, {
      quality: 0.92,
      pixelRatio: 2.5,
      backgroundColor: '#0a0a0a',
    })
  }

  async function captureAsPng(): Promise<string> {
    if (!couponRef.current) throw new Error('ref missing')
    const { toPng } = await import('html-to-image')
    return toPng(couponRef.current, {
      pixelRatio: 2.5,
      backgroundColor: '#0a0a0a',
    })
  }

  async function handleSaveJpg() {
    setBusy('jpg')
    try {
      const dataUrl = await captureAsJpeg()
      const link = document.createElement('a')
      link.href = dataUrl
      link.download = `cupom-${coupon.coupon_number}.jpg`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (err) {
      console.error('Erro ao salvar JPG:', err)
      toast.error('Não foi possível salvar a imagem. Tente novamente.')
    } finally {
      setBusy(null)
    }
  }

  async function handlePrint() {
    setBusy('print')
    try {
      const dataUrl = await captureAsPng()

      const win = window.open('', '_blank', 'width=540,height=800')
      if (!win) { window.print(); return }

      win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Cupom FoxCycles — ${coupon.coupon_number}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #fff; display: flex; justify-content: center; padding: 32px 16px; }
    img { max-width: 360px; width: 100%; height: auto; display: block; }
    @media print {
      body { padding: 0; display: block; }
      img { max-width: 100%; page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <img src="${dataUrl}" onload="setTimeout(function(){ window.print(); window.close(); }, 300)" />
</body>
</html>`)
      win.document.close()
    } catch (err) {
      console.error('Erro ao gerar impressão:', err)
      toast.error('Não foi possível gerar a impressão.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-col gap-6 items-center">
      {/* Voucher — este div é capturado pelo html2canvas */}
      <div
        ref={couponRef}
        id="coupon-print"
        className="relative w-full max-w-sm bg-[#0a0a0a] border-2 border-[#00ff87] rounded-2xl overflow-hidden"
        style={{ boxShadow: '0 0 30px rgba(0,255,135,0.15)' }}
      >
        {/* Topo colorido */}
        <div className="bg-[#00ff87] px-6 py-4 flex flex-col items-center gap-1">
          <div className="text-black text-xs font-bold uppercase tracking-widest">FoxCycles</div>
          <div className="text-black text-lg font-black">{coupon.partnerships?.coupon_title}</div>
        </div>

        {/* Separador dentilhado */}
        <div className="relative flex items-center">
          <div className="absolute -left-4 w-8 h-8 rounded-full bg-[#0a0a0a] border-r-2 border-[#00ff87]" />
          <div className="w-full border-t-2 border-dashed border-[#00ff87] opacity-40 mx-4" />
          <div className="absolute -right-4 w-8 h-8 rounded-full bg-[#0a0a0a] border-l-2 border-[#00ff87]" />
        </div>

        {/* Corpo do cupom */}
        <div className="px-6 py-5 flex flex-col gap-4">
          {/* Status badge */}
          {isUsed && (
            <div className="absolute top-4 right-4 bg-gray-700 text-gray-300 text-xs font-bold px-3 py-1 rounded-full uppercase">
              Utilizado
            </div>
          )}
          {isExpired && !isUsed && (
            <div className="absolute top-4 right-4 bg-red-900 text-red-300 text-xs font-bold px-3 py-1 rounded-full uppercase">
              Expirado
            </div>
          )}

          {/* Nome do cliente */}
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-0.5">Titular</div>
            <div className="text-white font-semibold text-lg leading-tight">{coupon.customer_name}</div>
          </div>

          {/* Código */}
          <div className="bg-[#141414] rounded-xl p-4 text-center border border-[#1e1e1e]">
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Código do cupom</div>
            <div className="text-[#00ff87] font-mono font-black text-3xl tracking-widest">
              {coupon.coupon_number}
            </div>
          </div>

          {/* QR Code como <img> (data URL) para compatibilidade com html2canvas */}
          <div className="flex justify-center">
            <div className="bg-[#00ff87] p-2 rounded-xl">
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="QR Code" width={160} height={160} className="rounded-lg block" />
              ) : (
                <div className="w-40 h-40 rounded-lg bg-[#00ff87]" />
              )}
            </div>
          </div>

          {/* Desconto e validade */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-[#141414] rounded-lg p-3 text-center border border-[#1e1e1e]">
              <div className="text-xs text-gray-500 mb-1">Desconto</div>
              <div className="text-[#00ff87] font-black text-xl">{discountLabel}</div>
            </div>
            <div className="bg-[#141414] rounded-lg p-3 text-center border border-[#1e1e1e]">
              <div className="text-xs text-gray-500 mb-1">Válido até</div>
              <div className="text-white font-bold text-sm">{formatDate(coupon.expires_at)}</div>
            </div>
          </div>

          {/* Indicação */}
          <div className="text-center">
            <span className="text-xs text-gray-500">
              Indicado por{' '}
              <span className="text-[#00ff87]">{coupon.influencers.instagram_handle}</span>
            </span>
          </div>

          {/* Descrição */}
          <div className="text-xs text-gray-500 text-center leading-relaxed border-t border-[#1e1e1e] pt-3">
            {coupon.partnerships?.coupon_description}
          </div>
        </div>
      </div>

      {/* Botões de ação — ocultos na impressão */}
      <div className="flex gap-3 w-full max-w-sm no-print">
        <button
          onClick={handlePrint}
          disabled={busy !== null}
          className="flex-1 h-12 rounded-xl border border-[#2a2a2a] text-white text-sm font-semibold hover:bg-[#1e1e1e] disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
          {busy === 'print' ? 'Gerando...' : 'Imprimir'}
        </button>
        <button
          onClick={handleSaveJpg}
          disabled={busy !== null}
          className="flex-1 h-12 rounded-xl bg-[#00ff87] text-black text-sm font-semibold hover:bg-[#00e67a] disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          {busy === 'jpg' ? 'Salvando...' : 'Salvar JPG'}
        </button>
      </div>
    </div>
  )
}
