'use client'

import { useState, useRef, useEffect } from 'react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils'
import { formatCPF, formatPhone } from '@/lib/validators/cpf'
import { SellerSelect } from '@/components/admin/SellerSelect'
import { ExpressSuccess } from '@/components/admin/ExpressSuccess'
import type { Seller } from '@/components/admin/SellerManagement'

export interface CouponData {
  // Retrato gravado no cupom (migration 008).
  discount_type: string | null
  discount_value: number | null
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

interface InfluencerData {
  id: string
  name: string
  instagram_handle: string
  coupon_code: string
  campaign_id: string
  // Os termos vem da PARCERIA ativa desde 18/08/2026.
  partnerships: {
    status: string
    validity_days: number
    discount_type: string
    discount_value: number
  }[] | null
  campaigns: { name: string } | null
}

const statusConfig = {
  pending: { label: 'VÁLIDO — pode usar', color: 'text-[#00ff87]', bg: 'bg-[#00ff87]/10 border-[#00ff87]/40' },
  used: { label: 'JÁ UTILIZADO', color: 'text-gray-400', bg: 'bg-gray-800/50 border-gray-700' },
  expired: { label: 'EXPIRADO', color: 'text-red-400', bg: 'bg-red-950/50 border-red-800' },
  cancelled: { label: 'CANCELADO', color: 'text-red-400', bg: 'bg-red-950/50 border-red-800' },
}

const emptyExpress = { name: '', cpf: '', phone: '', email: '' }

function normalize(raw: string): { type: 'coupon' | 'influencer'; value: string } {
  const v = raw.trim().replace(/^@/, '').toUpperCase()
  return { type: v.startsWith('FOX-') ? 'coupon' : 'influencer', value: v }
}

/**
 * O desconto vem do RETRATO gravado no proprio registro desde 18/08/2026.
 * Influencer e cupom sempre tem os campos preenchidos -- a migracao 008
 * preencheu todo o historico, entao nao ha caso sem retrato.
 */
/** A parceria ativa do influenciador devolvido pelo lookup do balcao. */
function parceriaDo(inf: InfluencerData) {
  return inf.partnerships?.find((p) => p.status === 'ativa') ?? null
}

function formatDiscount(o: { discount_type?: string | null; discount_value?: number | null }) {
  if (o.discount_type == null || o.discount_value == null) return '—'
  return o.discount_type === 'fixed' ? formatCurrency(o.discount_value) : `${o.discount_value}%`
}

export function ValidarClient({
  initialCode = '',
  sellers,
  showStore = false,
}: {
  initialCode?: string
  sellers: Seller[]
  showStore?: boolean
}) {
  const [code, setCode] = useState(initialCode)
  const [loading, setLoading] = useState(false)
  const [sellerId, setSellerId] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const didAutoSearch = useRef(false)

  // Fluxo 1: cupom existente
  const [coupon, setCoupon] = useState<CouponData | null>(null)
  const [validating, setValidating] = useState(false)

  // Fluxo 2: cadastro express via handle
  const [influencer, setInfluencer] = useState<InfluencerData | null>(null)
  const [expressForm, setExpressForm] = useState(emptyExpress)
  const [expressError, setExpressError] = useState('')
  const [saving, setSaving] = useState(false)
  const [successCoupon, setSuccessCoupon] = useState<CouponData | null>(null)

  useEffect(() => {
    if (initialCode && !didAutoSearch.current) {
      didAutoSearch.current = true
      const { type, value } = normalize(initialCode)
      if (type === 'coupon') searchCoupon(value)
      else searchInfluencer(value)
    }
  }, [initialCode])

  function resetAll() {
    setCoupon(null)
    setInfluencer(null)
    setSuccessCoupon(null)
    setErrorMsg('')
    setExpressError('')
    setCode('')
    setExpressForm(emptyExpress)
    setSellerId('')
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  async function searchCoupon(value: string) {
    setLoading(true)
    setErrorMsg('')
    setCoupon(null)
    setInfluencer(null)
    setSuccessCoupon(null)
    try {
      const res = await fetch(`/api/coupons/validate?code=${encodeURIComponent(value)}`)
      const data = await res.json()
      if (!res.ok) {
        setErrorMsg(data.error || 'Cupom não encontrado.')
        if (data.coupon) setCoupon(data.coupon)
      } else {
        setCoupon(data.coupon)
      }
    } catch {
      setErrorMsg('Erro de conexão. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  async function searchInfluencer(handle: string) {
    setLoading(true)
    setErrorMsg('')
    setCoupon(null)
    setInfluencer(null)
    setSuccessCoupon(null)
    try {
      const res = await fetch(`/api/admin/influencer-lookup?handle=${encodeURIComponent(handle)}`)
      const data = await res.json()
      if (!res.ok) {
        setErrorMsg(data.error || 'Influencer ou cupom não encontrado.')
      } else {
        setInfluencer(data.influencer)
        setExpressForm(emptyExpress)
        setExpressError('')
      }
    } catch {
      setErrorMsg('Erro de conexão. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!code.trim()) return
    const { type, value } = normalize(code)
    if (type === 'coupon') await searchCoupon(value)
    else await searchInfluencer(value)
  }

  async function handleValidate() {
    if (!coupon || !sellerId) return
    setValidating(true)
    try {
      const res = await fetch('/api/coupons/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coupon_number: coupon.coupon_number, seller_id: sellerId }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Erro ao validar.')
        return
      }
      setCoupon(data.coupon)
      toast.success('Cupom validado com sucesso!')
    } catch {
      toast.error('Erro de conexão.')
    } finally {
      setValidating(false)
    }
  }

  async function handleExpressSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!influencer || !sellerId) return
    setExpressError('')
    setSaving(true)
    try {
      const res = await fetch('/api/admin/coupon-express', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          influencer_id: influencer.id,
          campaign_id: influencer.campaign_id,
          customer_name: expressForm.name,
          customer_cpf: expressForm.cpf,
          customer_phone: expressForm.phone,
          customer_email: expressForm.email,
          seller_id: sellerId,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setExpressError(data.error || 'Erro ao cadastrar.')
        return
      }
      setInfluencer(null)
      setSuccessCoupon(data.coupon)
    } catch {
      setExpressError('Erro de conexão. Tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  const hasResult = !!coupon || !!influencer || !!successCoupon

  return (
    <div className="max-w-lg mx-auto px-4 py-6 flex flex-col gap-6">

      {/* Explicação — só na tela inicial */}
      {!hasResult && !errorMsg && (
        <div className="bg-[#141414] border border-[#1e1e1e] rounded-xl p-5">
          <h1 className="text-white font-bold text-lg mb-1">Validar Cupom na Loja</h1>
          <p className="text-gray-400 text-sm leading-relaxed">
            Digite o código do cupom do cliente (ex:{' '}
            <span className="font-mono text-[#00ff87]">FOX-AB12CD</span>) ou o código do
            influencer que indicou (ex:{' '}
            <span className="font-mono text-[#00ff87]">CAIIUXO300</span>), para cadastrar na hora.
          </p>
        </div>
      )}

      {/* Campo de busca — sempre visível enquanto não há resultado */}
      {!hasResult && (
        <form onSubmit={handleSearch} className="flex flex-col gap-3">
          <label className="text-sm font-medium text-gray-300">
            Código do cupom ou código do influencer
          </label>
          <input
            ref={inputRef}
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="FOX-XXXXXX ou CODIGO"
            autoComplete="off"
            autoFocus
            className="h-16 w-full rounded-xl border border-[#2a2a2a] bg-[#1e1e1e] px-5 text-2xl font-mono font-bold text-[#00ff87] placeholder:text-gray-600 placeholder:text-lg placeholder:font-normal tracking-widest focus:border-[#00ff87] focus:outline-none focus:ring-1 focus:ring-[#00ff87] text-center uppercase"
          />
          <p className="text-gray-600 text-xs text-center">
            Digite o código do cupom do cliente OU o código do influencer
          </p>
          <Button type="submit" size="lg" loading={loading} className="w-full h-14 text-base font-bold">
            {loading ? 'Buscando...' : 'Buscar'}
          </Button>
        </form>
      )}

      {/* Erro sem resultado */}
      {errorMsg && !coupon && !influencer && (
        <div className="bg-red-950 border border-red-800 rounded-xl p-4 text-center">
          <p className="text-red-400 font-semibold">{errorMsg}</p>
          <button onClick={resetAll} className="text-red-300 text-sm mt-2 underline">
            Tentar novamente
          </button>
        </div>
      )}

      {/* ─── FLUXO 1: Cupom existente ─── */}
      {coupon && (
        <div className="flex flex-col gap-4">
          {(() => {
            const s = statusConfig[coupon.status] ?? statusConfig.pending
            return (
              <div className={`rounded-xl border p-4 text-center ${s.bg}`}>
                <div className={`text-2xl font-black ${s.color}`}>{s.label}</div>
                {coupon.status === 'used' && coupon.used_at && (
                  <p className="text-gray-400 text-sm mt-1">
                    Utilizado em {formatDateTime(coupon.used_at)}
                    {coupon.used_by_admin && ` · por ${coupon.used_by_admin}`}
                  </p>
                )}
              </div>
            )
          })()}

          <div className="bg-[#141414] border border-[#1e1e1e] rounded-xl p-5 flex flex-col gap-4">
            <div className="text-center">
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
                <div className="text-[#00ff87] font-bold text-sm">{formatDiscount(coupon)}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Válido até</div>
                <div className="text-white text-sm">{formatDate(coupon.expires_at)}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Indicado por</div>
                <div className="text-white text-sm">{coupon.influencers.instagram_handle}</div>
              </div>
            </div>
            <div className="border-t border-[#2a2a2a] pt-3 flex flex-col gap-1">
              <div className="flex gap-2 text-xs">
                <span className="text-gray-500 w-16">CPF</span>
                <span className="text-gray-300 font-mono">
                  {coupon.customer_cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')}
                </span>
              </div>
              <div className="flex gap-2 text-xs">
                <span className="text-gray-500 w-16">Telefone</span>
                <span className="text-gray-300">{coupon.customer_phone}</span>
              </div>
            </div>
          </div>

          {coupon.status === 'pending' && (
            <>
              <SellerSelect sellers={sellers} value={sellerId} onChange={setSellerId}
                disabled={validating} showStore={showStore} />
              <Button
                onClick={handleValidate}
                size="xl"
                loading={validating}
                disabled={!sellerId}
                className="w-full font-black text-black text-xl rounded-2xl disabled:opacity-40"
                style={{ minHeight: '72px' }}
              >
                {validating ? 'Validando...' : '✓ APLICAR DESCONTO'}
              </Button>
            </>
          )}

          <button
            onClick={resetAll}
            className="text-gray-500 text-sm text-center hover:text-gray-300 transition-colors py-2"
          >
            ← Buscar outro cupom
          </button>
        </div>
      )}

      {/* ─── FLUXO 2: Cadastro express via handle ─── */}
      {influencer && !successCoupon && (
        <div className="flex flex-col gap-4">
          {/* Card do influencer */}
          <div className="bg-[#141414] border border-[#00ff87]/30 rounded-xl p-5">
            <div className="text-xs text-[#00ff87] font-bold uppercase tracking-wider mb-2">
              Cadastro Rápido — Indicado por
            </div>
            <div className="text-white font-bold text-xl">
              @{influencer.instagram_handle || influencer.coupon_code.toLowerCase()}
            </div>
            {influencer.name && (
              <div className="text-gray-400 text-sm mt-0.5">{influencer.name}</div>
            )}
            <div className="mt-4 pt-3 border-t border-[#2a2a2a] flex gap-8">
              <div>
                <div className="text-xs text-gray-500">Desconto</div>
                <div className="text-[#00ff87] font-black text-2xl">
                  {formatDiscount(parceriaDo(influencer) ?? {})}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Validade do cupom</div>
                <div className="text-white font-semibold">{parceriaDo(influencer)?.validity_days ?? 0} dias</div>
              </div>
            </div>
          </div>

          {/* Formulário */}
          <form onSubmit={handleExpressSubmit} className="flex flex-col gap-3">
            <h3 className="text-white font-semibold text-sm uppercase tracking-wider">Dados do cliente</h3>

            <input
              type="text"
              placeholder="Nome completo *"
              value={expressForm.name}
              onChange={(e) => setExpressForm((p) => ({ ...p, name: e.target.value }))}
              required
              disabled={saving}
              className="h-14 w-full rounded-xl border border-[#2a2a2a] bg-[#1e1e1e] px-4 text-white placeholder:text-gray-600 focus:border-[#00ff87] focus:outline-none focus:ring-1 focus:ring-[#00ff87] text-base"
            />
            <input
              type="text"
              inputMode="numeric"
              placeholder="CPF * (000.000.000-00)"
              value={expressForm.cpf}
              onChange={(e) => setExpressForm((p) => ({ ...p, cpf: formatCPF(e.target.value) }))}
              required
              disabled={saving}
              maxLength={14}
              className="h-14 w-full rounded-xl border border-[#2a2a2a] bg-[#1e1e1e] px-4 text-white placeholder:text-gray-600 focus:border-[#00ff87] focus:outline-none focus:ring-1 focus:ring-[#00ff87] text-base font-mono"
            />
            <input
              type="tel"
              placeholder="Telefone * (com DDD)"
              value={expressForm.phone}
              onChange={(e) => setExpressForm((p) => ({ ...p, phone: formatPhone(e.target.value) }))}
              required
              disabled={saving}
              className="h-14 w-full rounded-xl border border-[#2a2a2a] bg-[#1e1e1e] px-4 text-white placeholder:text-gray-600 focus:border-[#00ff87] focus:outline-none focus:ring-1 focus:ring-[#00ff87] text-base"
            />
            <input
              type="email"
              placeholder="E-mail *"
              value={expressForm.email}
              onChange={(e) => setExpressForm((p) => ({ ...p, email: e.target.value }))}
              required
              disabled={saving}
              className="h-14 w-full rounded-xl border border-[#2a2a2a] bg-[#1e1e1e] px-4 text-white placeholder:text-gray-600 focus:border-[#00ff87] focus:outline-none focus:ring-1 focus:ring-[#00ff87] text-base"
            />

            <SellerSelect sellers={sellers} value={sellerId} onChange={setSellerId}
              disabled={saving} showStore={showStore} />

            {expressError && (
              <div className="bg-red-950 border border-red-800 rounded-xl p-3 text-red-400 text-sm text-center">
                {expressError}
              </div>
            )}

            <Button
              type="submit"
              size="xl"
              loading={saving}
              disabled={!sellerId}
              className="w-full font-black text-black text-lg rounded-2xl mt-1 disabled:opacity-40"
              style={{ minHeight: '72px' }}
            >
              {saving ? 'Cadastrando...' : '✓ CADASTRAR E VALIDAR CUPOM'}
            </Button>
          </form>

          <button
            onClick={resetAll}
            className="text-gray-500 text-sm text-center hover:text-gray-300 transition-colors py-2"
          >
            ← Buscar outro
          </button>
        </div>
      )}

      {/* ─── SUCESSO EXPRESS ─── */}
      {successCoupon && <ExpressSuccess coupon={successCoupon} onReset={resetAll} />}
    </div>
  )
}
