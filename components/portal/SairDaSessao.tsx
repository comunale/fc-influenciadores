'use client'

import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'

/** Sai da sessão atual e volta para esta mesma tela, agora vazia. */
export function SairDaSessao() {
  async function sair() {
    await createClient().auth.signOut()
    window.location.href = '/portal/login'
  }

  return (
    <Button type="button" onClick={sair} className="w-full">
      Sair e entrar como influenciador
    </Button>
  )
}
