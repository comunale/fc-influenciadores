import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { FoxLogo } from '@/components/FoxLogo'
import { CouponForm } from '@/components/forms/CouponForm'
import { formatCurrency } from '@/lib/utils'
import { linkAtivo } from '@/lib/influencer-status'
import { parceriaAtiva, type Parceria } from '@/lib/partnership'
import type { Metadata } from 'next'

interface PageProps {
  params: Promise<{ coupon_code: string }>
}

/**
 * Os termos vêm da PARCERIA ativa desde 18/08/2026. Antes vinham da campanha,
 * que derrubava todos os influenciadores de uma vez; depois do influenciador.
 * A campanha continua sendo lida apenas como rótulo, no rodapé.
 */
const CAMPOS = 'instagram_handle, active, partnerships(*)'

function rotuloDesconto(tipo: string, valor: number) {
  return tipo === 'fixed' ? formatCurrency(valor) : `${valor}%`
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { coupon_code } = await params
  const supabase = await createClient()

  const { data: influencer } = await supabase
    .from('influencers')
    .select(CAMPOS)
    .eq('coupon_code', coupon_code.toUpperCase())
    .maybeSingle()

  const p = parceriaAtiva(influencer?.partnerships as Parceria[] | null)
  if (!influencer || !linkAtivo(influencer, p)) {
    return { title: 'FoxCycles | Cupom de Desconto' }
  }

  const discountLabel = rotuloDesconto(p!.discount_type, p!.discount_value)
  const title = `FoxCycles | ${discountLabel} OFF — Indicado por @${influencer.instagram_handle}`
  const description =
    p!.coupon_description ||
    p!.coupon_title ||
    'Cupom exclusivo para desconto na FoxCycles.'

  return {
    title,
    description,
    openGraph: { title, description, siteName: 'FoxCycles', type: 'website' },
  }
}

export default async function CouponLandingPage({ params }: PageProps) {
  const { coupon_code } = await params
  const supabase = await createClient()

  const { data: influencer } = await supabase
    .from('influencers')
    .select('*, partnerships(*), campaigns(name)')
    .eq('coupon_code', coupon_code.toUpperCase())
    .maybeSingle()

  // O link depende do influenciador estar ativo e da PARCERIA estar vigente.
  // Ver lib/influencer-status.ts.
  const parceria = parceriaAtiva(influencer?.partnerships as Parceria[] | null)
  if (!influencer || !linkAtivo(influencer, parceria)) notFound()

  const discountLabel = rotuloDesconto(parceria!.discount_type, parceria!.discount_value)
  const campanha = (influencer.campaigns as { name: string } | null)?.name ?? ''

  return (
    <main className="min-h-screen bg-[#0a0a0a] flex flex-col items-center">
      {/* Header */}
      <header className="w-full bg-[#0a0a0a] border-b border-[#1e1e1e] px-4 py-4 flex justify-center">
        <FoxLogo size="md" />
      </header>

      <div className="w-full max-w-md px-4 py-8 flex flex-col gap-6">
        {/* Badge influencer */}
        <div className="text-center">
          <span className="inline-block bg-[#1e1e1e] border border-[#2a2a2a] text-gray-300 text-sm px-4 py-1.5 rounded-full">
            Indicado por{' '}
            <span className="text-[#00ff87] font-semibold">{influencer.instagram_handle}</span>
          </span>
        </div>

        {/* Hero desconto */}
        <div className="text-center flex flex-col gap-2">
          <div className="text-6xl font-black text-[#00ff87] leading-none">{discountLabel}</div>
          <div className="text-xl font-bold text-white">OFF na sua moto elétrica</div>
          <div className="text-sm text-gray-400 mt-1">{parceria!.coupon_description}</div>
        </div>

        {/* Separador visual */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-[#2a2a2a]" />
          <span className="text-xs text-gray-500 uppercase tracking-widest">Preencha seus dados</span>
          <div className="flex-1 h-px bg-[#2a2a2a]" />
        </div>

        {/* Formulário */}
        <div className="bg-[#141414] border border-[#1e1e1e] rounded-2xl p-6">
          <CouponForm influencerCode={coupon_code.toUpperCase()} />
        </div>

        {/* Info campanha */}
        <div className="text-center">
          <p className="text-xs text-gray-600">
            {campanha ? `Campanha: ${campanha} · ` : ''}FoxCycles Campinas
          </p>
        </div>
      </div>
    </main>
  )
}
