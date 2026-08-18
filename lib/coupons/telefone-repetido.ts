/**
 * Cupons cujo telefone aparece em CPFs diferentes.
 *
 * É o sinal que denuncia o furo remanescente do balcão: o vendedor determinado
 * escaneia o QR do influenciador com o próprio celular e preenche pelo cliente.
 * O que entrega isso é o mesmo número aparecendo em pessoas diferentes.
 *
 * MARCA E ALERTA, NUNCA BLOQUEIA. Telefone repetido tem caso legítimo — marido
 * e mulher, mãe e filho — e bloquear geraria chamado no meio de uma venda. A
 * dissuasão vem da visibilidade: o vendedor saber que aparece.
 *
 * A comparação é por CPF diferente, não só por telefone repetido: mesmo número
 * com o mesmo CPF é a mesma pessoa em duas campanhas, caso legítimo.
 *
 * Ver docs/superpowers/specs/2026-07-28-cupom-express-anti-abuso-design.md
 */
export function telefonesSuspeitos(
  cupons: { id: string; customer_phone: string; customer_cpf: string }[]
): Set<string> {
  const cpfsPorTelefone = new Map<string, Set<string>>()

  for (const c of cupons) {
    const tel = (c.customer_phone || '').trim()
    if (!tel) continue
    if (!cpfsPorTelefone.has(tel)) cpfsPorTelefone.set(tel, new Set())
    cpfsPorTelefone.get(tel)!.add(c.customer_cpf)
  }

  const suspeitos = new Set<string>()
  for (const c of cupons) {
    const tel = (c.customer_phone || '').trim()
    if (tel && (cpfsPorTelefone.get(tel)?.size ?? 0) > 1) suspeitos.add(c.id)
  }
  return suspeitos
}
