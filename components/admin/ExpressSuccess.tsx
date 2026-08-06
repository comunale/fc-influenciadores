'use client'

import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'
import type { CouponData } from '@/app/admin/(protected)/validar/ValidarClient'

// `CouponData` entra como import type — importação só de tipo é apagada na
// compilação, então o ciclo ValidarClient → ExpressSuccess → ValidarClient não
// existe em runtime. `formatDiscount`, ao contrário, é valor: importá-lo
// fecharia o ciclo de verdade. São quatro linhas, repetir sai mais barato.
function formatDiscount(campaigns: { discount_type: string; discount_value: number }) {
  return campaigns.discount_type === 'fixed'
    ? formatCurrency(campaigns.discount_value)
    : `${campaigns.discount_value}%`
}

export function ExpressSuccess({ coupon, onReset }: { coupon: CouponData; onReset: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="bg-[#00ff87]/10 border border-[#00ff87]/40 rounded-xl p-6 text-center">
        <div className="text-[#00ff87] text-5xl font-black">✓</div>
        <div className="text-[#00ff87] font-bold text-xl mt-2">Cupom validado com sucesso!</div>
        <div className="text-white font-mono font-black text-3xl mt-3 tracking-widest">
          {coupon.coupon_number}
        </div>
        <div className="text-[#00ff87] font-black text-3xl mt-2">
          {formatDiscount(coupon.campaigns)}
        </div>
        <div className="text-gray-400 text-sm mt-1">de desconto aplicado</div>
      </div>

      <div className="bg-[#141414] border border-[#1e1e1e] rounded-xl p-5">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-xs text-gray-500">Cliente</div>
            <div className="text-white font-semibold">{coupon.customer_name}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Indicado por</div>
            <div className="text-white">@{coupon.influencers.instagram_handle}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500">CPF</div>
            <div className="text-gray-300 font-mono text-xs">
              {coupon.customer_cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Telefone</div>
            <div className="text-gray-300 text-xs">{coupon.customer_phone}</div>
          </div>
        </div>
      </div>

      <Button onClick={onReset} size="lg" className="w-full h-14 font-bold">
        Validar outro cupom
      </Button>
    </div>
  )
}
