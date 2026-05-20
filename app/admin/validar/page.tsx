'use client'

import { useState, useRef } from 'react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils'
import { FoxLogo } from '@/components/FoxLogo'

interface CouponData {
  id: string
  coupon_number: string
  customer_name: string
  customer_cpf: string
  customer_phone: string
  customer_email: string
  status: 'pending' | 'used' | 'expired' | 'cancelled'
  expires_at: string
  used_at: string | null
  used_by_admin: string | null
  influencers: { name: string; instagram_handle: string }
  campaigns: { name: string; discount_value: number; discount_type: string; coupon_title: string }
}

export default function ValidarPage() {
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [validating, setValidating] = useState(false)
  const [coupon, setCoupon] = useState<CouponData | null>(null)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!code.trim()) return

    setLoading(true)
    setError('')
    setCoupon(null)

    try {
      const res = await fetch(`/api/coupons/validate?code=${encodeURIComponent(code.trim())}`)
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Cupom não encontrado.')
        if (data.coupon) setCoupon(data.coupon)
        return
      }

      setCoupon(data.coupon)
    } catch {
      setError('Erro de conexão. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  async function handleValidate() {
    if (!coupon) return
    setValidating(true)

    try {
      const res = await fetch('/api/coupons/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coupon_number: coupon.coupon_number }),
      })
      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || 'Erro ao validar.')
        return
      }

      setCoupon(data.coupon)
      toast.success('Cupom validado com sucesso! ✓')
    } catch {
      toast.error('Erro de conexão.')
    } finally {
      setValidating(false)
    }
  }

  function handleReset() {
    setCoupon(null)
    setError('')
    setCode('')
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  const statusConfig = {
    pending: { label: 'VÁLIDO', color: 'text-[#00ff87]', bg: 'bg-[#00ff87]/10 border-[#00ff87]/30' },
    used: { label: 'UTILIZADO', color: 'text-gray-400', bg: 'bg-gray-800 border-gray-700' },
    expired: { label: 'EXPIRADO', color: 'text-red-400', bg: 'bg-red-950 border-red-800' },
    cancelled: { label: 'CANCELADO', color: 'text-red-400', bg: 'bg-red-950 border-red-800' },
  }

  return (
    <main className="min-h-screen bg-[#0a0a0a] flex flex-col">
      {/* Header */}
      <header className="bg-[#141414] border-b border-[#1e1e1e] px-4 py-3 flex items-center justify-between">
        <FoxLogo size="sm" />
        <span className="text-xs text-gray-500 font-medium uppercase tracking-wider">Validar Cupom</span>
      </header>

      <div className="flex-1 flex flex-col max-w-lg mx-auto w-full px-4 py-6 gap-6">
        {/* Busca */}
        <form onSubmit={handleSearch} className="flex flex-col gap-3">
          <label className="text-sm font-medium text-gray-300">
            Código do cupom
          </label>
          <input
            ref={inputRef}
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="FOX-XXXXXX"
            className="h-16 w-full rounded-xl border border-[#2a2a2a] bg-[#1e1e1e] px-5 text-2xl font-mono font-bold text-[#00ff87] placeholder:text-gray-600 placeholder:text-lg placeholder:font-normal tracking-widest focus:border-[#00ff87] focus:outline-none focus:ring-1 focus:ring-[#00ff87] text-center uppercase"
            autoComplete="off"
            autoFocus
          />
          <Button type="submit" size="lg" loading={loading} className="w-full h-14 text-base font-bold">
            {loading ? 'Buscando...' : 'Buscar Cupom'}
          </Button>
        </form>

        {/* Erro */}
        {error && !coupon && (
          <div className="bg-red-950 border border-red-800 rounded-xl p-4 text-center">
            <p className="text-red-400 font-semibold">{error}</p>
            <button onClick={handleReset} className="text-red-300 text-sm mt-2 underline">
              Tentar outro código
            </button>
          </div>
        )}

        {/* Resultado */}
        {coupon && (
          <div className="flex flex-col gap-4">
            {/* Status badge grande */}
            {(() => {
              const s = statusConfig[coupon.status] || statusConfig.pending
              return (
                <div className={`rounded-xl border p-4 text-center ${s.bg}`}>
                  <div className={`text-3xl font-black ${s.color}`}>{s.label}</div>
                  {coupon.status === 'used' && coupon.used_at && (
                    <div className="text-gray-400 text-sm mt-1">
                      Utilizado em {formatDateTime(coupon.used_at)}
                      {coupon.used_by_admin && ` por ${coupon.used_by_admin}`}
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Dados do cupom */}
            <div className="bg-[#141414] border border-[#1e1e1e] rounded-xl p-5 flex flex-col gap-3">
              <div>
                <div className="text-xs text-gray-500 uppercase tracking-wider">Código</div>
                <div className="text-[#00ff87] font-mono font-black text-2xl tracking-widest">
                  {coupon.coupon_number}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-gray-500">Cliente</div>
                  <div className="text-white font-semibold text-sm">{coupon.customer_name}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Desconto</div>
                  <div className="text-[#00ff87] font-bold text-sm">
                    {coupon.campaigns.discount_type === 'fixed'
                      ? formatCurrency(coupon.campaigns.discount_value)
                      : `${coupon.campaigns.discount_value}%`}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Validade</div>
                  <div className="text-white text-sm">{formatDate(coupon.expires_at)}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Influencer</div>
                  <div className="text-white text-sm">{coupon.influencers.instagram_handle}</div>
                </div>
              </div>

              <div className="border-t border-[#2a2a2a] pt-3 grid grid-cols-1 gap-2">
                <div>
                  <div className="text-xs text-gray-500">CPF</div>
                  <div className="text-gray-300 text-sm font-mono">
                    {coupon.customer_cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Telefone</div>
                  <div className="text-gray-300 text-sm">{coupon.customer_phone}</div>
                </div>
              </div>
            </div>

            {/* Botão de validar */}
            {coupon.status === 'pending' && (
              <Button
                onClick={handleValidate}
                size="xl"
                loading={validating}
                className="w-full font-black text-black text-xl rounded-2xl"
                style={{ minHeight: '72px' }}
              >
                {validating ? 'Validando...' : '✓ VALIDAR E USAR CUPOM'}
              </Button>
            )}

            <button
              onClick={handleReset}
              className="text-gray-500 text-sm text-center hover:text-gray-300 transition-colors"
            >
              ← Buscar outro cupom
            </button>
          </div>
        )}
      </div>
    </main>
  )
}
