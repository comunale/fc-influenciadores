'use client'

import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { Coupon, Influencer, Campaign } from '@/lib/supabase/types'

interface CouponCardProps {
  coupon: Coupon & {
    influencers: Pick<Influencer, 'name' | 'instagram_handle'>
    campaigns: Pick<Campaign, 'discount_value' | 'discount_type' | 'coupon_title' | 'coupon_description'>
  }
}

export function CouponCard({ coupon }: CouponCardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const couponRef = useRef<HTMLDivElement>(null)
  const [saving, setSaving] = useState(false)
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://fc-influenciadores.vercel.app'

  const qrUrl = `${siteUrl}/admin/validar?codigo=${coupon.coupon_number}`

  useEffect(() => {
    if (!canvasRef.current) return
    QRCode.toCanvas(canvasRef.current, qrUrl, {
      width: 160,
      margin: 1,
      color: { dark: '#000000', light: '#00ff87' },
    })
  }, [qrUrl])

  const discountLabel =
    coupon.campaigns.discount_type === 'fixed'
      ? formatCurrency(coupon.campaigns.discount_value)
      : `${coupon.campaigns.discount_value}%`

  const isExpired = new Date(coupon.expires_at) < new Date()
  const isUsed = coupon.status === 'used'

  async function handleSaveJpg() {
    if (!couponRef.current) return
    setSaving(true)
    try {
      const html2canvas = (await import('html2canvas')).default
      const canvas = await html2canvas(couponRef.current, {
        backgroundColor: '#0a0a0a',
        scale: 2,
        useCORS: true,
        logging: false,
      })
      const dataUrl = canvas.toDataURL('image/jpeg', 0.92)
      const link = document.createElement('a')
      link.href = dataUrl
      link.download = `cupom-${coupon.coupon_number}.jpg`
      link.click()
    } finally {
      setSaving(false)
    }
  }

  function handlePrint() {
    window.print()
  }

  return (
    <div className="flex flex-col gap-6 items-center">
      {/* Voucher */}
      <div
        ref={couponRef}
        id="coupon-print"
        className="relative w-full max-w-sm bg-[#0a0a0a] border-2 border-[#00ff87] rounded-2xl overflow-hidden"
        style={{ boxShadow: '0 0 30px rgba(0,255,135,0.15)' }}
      >
        {/* Topo colorido */}
        <div className="bg-[#00ff87] px-6 py-4 flex flex-col items-center gap-1">
          <div className="text-black text-xs font-bold uppercase tracking-widest">FoxCycles</div>
          <div className="text-black text-lg font-black">{coupon.campaigns.coupon_title}</div>
        </div>

        {/* Separador dentilhado */}
        <div className="relative flex items-center py-0">
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

          {/* QR Code */}
          <div className="flex justify-center">
            <div className="bg-[#00ff87] p-2 rounded-xl">
              <canvas ref={canvasRef} className="rounded-lg" />
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
            {coupon.campaigns.coupon_description}
          </div>
        </div>
      </div>

      {/* Botões de ação */}
      <div className="flex gap-3 w-full max-w-sm no-print">
        <button
          onClick={handlePrint}
          className="flex-1 h-12 rounded-xl border border-[#2a2a2a] text-white text-sm font-semibold hover:bg-[#1e1e1e] transition-colors flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
          Imprimir
        </button>
        <button
          onClick={handleSaveJpg}
          disabled={saving}
          className="flex-1 h-12 rounded-xl bg-[#00ff87] text-black text-sm font-semibold hover:bg-[#00e67a] disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          {saving ? 'Salvando...' : 'Salvar JPG'}
        </button>
      </div>
    </div>
  )
}
