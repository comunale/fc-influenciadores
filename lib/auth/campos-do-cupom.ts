import type { Role } from '@/lib/auth/roles'

/**
 * Quais colunas de coupons cada papel pode escrever pela API
 * (app/api/admin/coupons). Mora aqui, e nao na rota, para um teste poder
 * fixa-la: o banco repete a regra no trigger, mas esta e a guarda da camada de
 * aplicacao e nada mais a prende.
 *
 * Sem 'paid' no financeiro: ele paga por lancamento (app/api/finance/settlements).
 * Pagar cupom a cupom aqui deixava desmarcar um cupom de lancamento pago. O
 * admin MANTEM 'paid' por decisao do dono.
 */
export const CAMPOS_POR_PAPEL: Record<Role, string[]> = {
  admin: ['status', 'customer_name', 'customer_phone', 'customer_email', 'customer_cpf',
          'verified', 'paid', 'invoice_number'],
  finance: ['verified', 'invoice_number'],
  moderator: [],
  // O influenciador nao edita cupom nenhum: o portal dele e so leitura.
  influencer: [],
}
