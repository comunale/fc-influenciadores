import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { generateCouponNumber } from '@/lib/utils'

type CouponInsert = Database['public']['Tables']['coupons']['Insert']
type NewCoupon = Omit<CouponInsert, 'coupon_number'>

const UNIQUE_VIOLATION = '23505'

export type InsertCouponResult =
  | { ok: true; coupon: Record<string, unknown> }
  | { ok: false; reason: 'duplicate_cpf' | 'collision' | 'unknown'; message: string }

/**
 * Insere um cupom deixando o banco arbitrar a unicidade, em vez de checar antes
 * (o check-then-insert abria janela de corrida entre dois cadastros simultâneos).
 *
 * - Colisão em coupons_coupon_number_key  → sorteia outro código e tenta de novo.
 * - Colisão em coupons_customer_cpf_...   → CPF já tem cupom na campanha, não adianta repetir.
 */
export async function insertCouponWithRetry(
  supabase: SupabaseClient<Database>,
  payload: NewCoupon,
  select: string,
  attempts = 5
): Promise<InsertCouponResult> {
  for (let i = 0; i < attempts; i++) {
    const { data, error } = await supabase
      .from('coupons')
      .insert({ ...payload, coupon_number: generateCouponNumber() })
      .select(select)
      .single()

    // O select é uma string dinâmica, então o Supabase não consegue inferir a shape do retorno.
    if (!error && data) return { ok: true, coupon: data as unknown as Record<string, unknown> }

    if (error?.code === UNIQUE_VIOLATION) {
      const detail = `${error.message} ${error.details ?? ''}`
      if (detail.includes('customer_cpf')) {
        return { ok: false, reason: 'duplicate_cpf', message: 'CPF já possui cupom nesta campanha.' }
      }
      if (detail.includes('coupon_number')) continue // código sorteado já existe — tenta outro
    }

    console.error('insertCouponWithRetry error:', error)
    return { ok: false, reason: 'unknown', message: error?.message ?? 'Erro ao salvar cupom.' }
  }

  return { ok: false, reason: 'collision', message: 'Não foi possível gerar um código único.' }
}
