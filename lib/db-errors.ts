/**
 * Traduz erro do Postgres para portugues.
 *
 * O admin pode apagar tudo, mas o banco protege o historico: as chaves
 * estrangeiras de `coupons` sao RESTRICT, entao quem ja gerou cupom nao some.
 * Sem isso, apagar um influenciador destruiria o historico financeiro dele.
 */
export function mensagemDeErro(msg: string, entidade = 'registro'): string {
  // 23503 = foreign_key_violation
  if (/violates foreign key constraint|23503/i.test(msg)) {
    if (msg.includes('coupons_influencer_id_fkey')) {
      return 'Este influencer já tem cupons gerados e não pode ser excluído. Desative-o para tirá-lo de circulação sem perder o histórico.'
    }
    if (msg.includes('coupons_campaign_id_fkey')) {
      return 'Esta campanha já tem cupons gerados e não pode ser excluída. Desative-a para encerrá-la sem perder o histórico.'
    }
    if (msg.includes('coupons_seller_id_fkey')) {
      return 'Este vendedor já validou cupons e não pode ser excluído. Desative-o para tirá-lo da lista do balcão.'
    }
    return `Existem registros vinculados a este ${entidade}. Desative em vez de excluir.`
  }

  if (msg.includes('influencers_coupon_code_key')) {
    return 'Já existe um influencer com este código de cupom.'
  }

  return msg
}
