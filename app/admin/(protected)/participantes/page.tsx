import { redirect } from 'next/navigation'

// Participantes e Cupons eram a MESMA coisa: mesma tabela, mesma query, mesmos
// filtros. Foram unificados em /admin/cupons. A rota continua existindo para
// nao quebrar link nem favorito antigo.
export default function ParticipantesPage() {
  redirect('/admin/cupons')
}
