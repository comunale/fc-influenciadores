'use client'

import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'

interface Props {
  /** Para onde voltar depois de sair. O padrão é a porta do influenciador. */
  voltarPara?: string
  rotulo?: string
}

/** Sai da sessão atual e volta para a tela de entrada da área, agora vazia. */
export function SairDaSessao({
  voltarPara = '/portal/login',
  rotulo = 'Sair e entrar como influenciador',
}: Props = {}) {
  async function sair() {
    await createClient().auth.signOut()
    window.location.href = voltarPara
  }

  return (
    <Button type="button" onClick={sair} className="w-full">
      {rotulo}
    </Button>
  )
}
