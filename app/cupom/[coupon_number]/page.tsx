import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { FoxLogo } from '@/components/FoxLogo'
import { CouponCard } from '@/components/CouponCard'
import type { Metadata } from 'next'

interface PageProps {
  params: Promise<{ coupon_number: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { coupon_number } = await params
  return {
    title: `Seu Cupom FoxCycles | ${coupon_number.toUpperCase()}`,
    description: 'Apresente este cupom na loja FoxCycles para garantir seu desconto.',
  }
}

export default async function CouponPage({ params }: PageProps) {
  const { coupon_number } = await params
  const supabase = await createClient()

  const { data: coupon } = await supabase
    .from('coupons')
    .select('*, influencers(name, instagram_handle, coupon_title, coupon_description)')
    .eq('coupon_number', coupon_number.toUpperCase())
    .single()

  if (!coupon) notFound()

  return (
    <main className="min-h-screen bg-[#0a0a0a]">
      {/* Header - oculto na impressão */}
      <header className="no-print w-full border-b border-[#1e1e1e] px-4 py-4 flex flex-col items-center gap-1">
        <FoxLogo size="sm" />
        <p className="text-xs text-gray-500">Seu cupom de desconto exclusivo</p>
      </header>

      <div className="max-w-md mx-auto px-4 py-8">
        {coupon.status === 'pending' && (
          <div className="no-print mb-6 bg-[#00ff87]/10 border border-[#00ff87]/30 rounded-xl p-4 text-center">
            <p className="text-[#00ff87] font-semibold text-sm">
              ✓ Cupom gerado com sucesso!
            </p>
            <p className="text-gray-400 text-xs mt-1">
              Salve o código ou tire um print. Apresente na loja.
            </p>
          </div>
        )}

        {coupon.status === 'used' && (
          <div className="no-print mb-6 bg-gray-800 border border-gray-600 rounded-xl p-4 text-center">
            <p className="text-gray-300 font-semibold text-sm">Este cupom já foi utilizado.</p>
          </div>
        )}

        {coupon.status === 'expired' && (
          <div className="no-print mb-6 bg-red-950 border border-red-800 rounded-xl p-4 text-center">
            <p className="text-red-400 font-semibold text-sm">Este cupom expirou.</p>
          </div>
        )}

        <CouponCard coupon={coupon as Parameters<typeof CouponCard>[0]['coupon']} />
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          header, .no-print { display: none !important; }
          body { background: white !important; }
          main { padding: 0 !important; }
          #coupon-print {
            border-color: #000 !important;
            box-shadow: none !important;
            color: #000 !important;
          }
        }
      `}</style>
    </main>
  )
}
