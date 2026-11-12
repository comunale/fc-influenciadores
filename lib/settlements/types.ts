/**
 * Tipos compartilhados do subsistema de fechamentos e pagamentos.
 * So tipos, sem logica: os modulos de lib/settlements importam daqui.
 */
import type { VendaParaComissao } from '@/lib/commission'

/** Intervalo de datas ISO `YYYY-MM-DD`, com as duas pontas inclusivas. */
export type Periodo = { de: string; ate: string }

/** Um cupom que entra no fechamento, com o valor que vale naquele instante. */
export type CupomElegivel = { coupon_id: string; valor: number }

/**
 * VendaParaComissao nao tem `used_at`, e o recorte de periodo precisa dele.
 * Estendemos aqui em vez de mexer em lib/commission.ts: os testes de comissao
 * ficam intactos e a dependencia vai num sentido so.
 */
export type VendaComUso = VendaParaComissao & {
  used_at: string | null
  /** Opcional so para nao quebrar quem ja monta VendaComUso sem ele; a rota de fechar sempre o le. */
  status?: string
}
