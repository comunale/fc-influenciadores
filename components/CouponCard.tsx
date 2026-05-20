'use client'

import { useEffect, useRef } from 'react'
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
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://fc-influenciadores.vercel.app'

  useEffect(() => {
    if (!canvasRef.current) return
    QRCode.toCanvas(canvasRef.current, coupon.coupon_number, {
      width: 160,
      margin: 1,
      color: { dark: '#000000', light: '#00ff87' },
    })
  }, [coupon.coupon_number])

  const discountLabel =
    coupon.campaigns.discount_type === 'fixed'
      ? formatCurrency(coupon.campaigns.discount_value)
      : `${coupon.campaigns.discount_value}%`

  const isExpired = new Date(coupon.expires_at) < new Date()
  const isUsed = coupon.status === 'used'

  function handleShare() {
    const text = `Meu cupom FoxCycles: *${coupon.coupon_number}* — ${discountLabel} OFF! 🏍️⚡\nApresente na loja de Campinas.\nValidade: ${formatDate(coupon.expires_at)}`
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`
    window.open(url, '_blank')
  }

  function handlePrint() {
    window.print()
  }

  return (
    <div className="flex flex-col gap-6 items-center">
      {/* Voucher */}
      <div
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
          onClick={handleShare}
          className="flex-1 h-12 rounded-xl bg-[#25D366] text-white text-sm font-semibold hover:bg-[#1da851] transition-colors flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
          </svg>
          WhatsApp
        </button>
      </div>
    </div>
  )
}
