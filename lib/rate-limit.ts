import { createAdminClient } from '@/lib/supabase/server'

/**
 * Rate limit por IP apoiado no Postgres (tabela rate_limits + função check_rate_limit).
 *
 * Estado em memória não serve aqui: na Vercel cada instância tem a sua, então o
 * limite real viraria "N por instância". No banco o contador é único e atômico.
 */

export interface RateLimitRule {
  /** Janela em segundos. */
  windowSec: number
  /** Máximo de requests permitidos dentro da janela. */
  max: number
}

// Cadastro de cupom pelo link público do influencer.
export const COUPON_RULES: RateLimitRule[] = [
  { windowSec: 3600, max: 5 },   // 5 por hora
  { windowSec: 86400, max: 20 }, // 20 por dia
]

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]!.trim()
  return request.headers.get('x-real-ip')?.trim() || 'unknown'
}

/**
 * Retorna true se o request pode seguir, false se estourou algum limite.
 *
 * Falha aberto: se o banco ou a service role key estiverem indisponíveis, libera
 * o request. Um cupom a mais é melhor que derrubar o cadastro de um cliente real.
 */
export async function checkRateLimit(
  scope: string,
  identifier: string,
  rules: RateLimitRule[]
): Promise<boolean> {
  try {
    const supabase = createAdminClient()

    const results = await Promise.all(
      rules.map((rule) =>
        supabase.rpc('check_rate_limit', {
          p_key: `${scope}:${identifier}:${rule.windowSec}`,
          p_max: rule.max,
          p_window_sec: rule.windowSec,
        })
      )
    )

    for (const { data, error } of results) {
      if (error) {
        console.error('checkRateLimit rpc error:', error)
        return true
      }
      if (data === false) return false
    }

    return true
  } catch (err) {
    console.error('checkRateLimit indisponível, liberando request:', err)
    return true
  }
}
