'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'

type Contrato = {
  id: string
  corpo: string
  status: string
  accepted_at: string | null
  accepted_ip: string | null
  accepted_user_agent: string | null
  fee_a_restituir: number | null
  template_versao: number | null
  partnership_id: string
  partnerships: {
    starts_at: string
    ends_at: string | null
    status: string
    fee_amount: number
    commission_per_sale: number
    contract_required: boolean
    contract_accepted_at: string | null
    influencers: { name: string; instagram_handle: string } | null
  } | null
}

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export function ContratoView({ contrato }: { contrato: Contrato }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const inf = contrato.partnerships?.influencers
  const aceito = contrato.status === 'aceito'
  const faltaPreencher = /\{\{/.test(contrato.corpo)

  async function atualizarTexto() {
    setLoading(true)
    const res = await fetch('/api/admin/contracts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ partnership_id: contrato.partnership_id }),
    })
    setLoading(false)
    if (!res.ok) return toast.error('Não foi possível atualizar o texto.')
    toast.success('Texto atualizado.')
    router.refresh()
  }

  async function registrarDescumprimento() {
    const ok = confirm(
      `Registrar descumprimento de ${inf?.instagram_handle ?? 'este influenciador'}?\n\n` +
      'A parceria é encerrada, o link desliga na hora, e a comissão das vendas já ' +
      'confirmadas continua devida. Se houver fee pago, abre a pendência de restituição.'
    )
    if (!ok) return

    setLoading(true)
    const res = await fetch('/api/admin/contracts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contract_id: contrato.id, acao: 'descumprimento' }),
    })
    const json = await res.json()
    setLoading(false)
    if (!res.ok) return toast.error(json.error || 'Não foi possível registrar.')
    toast.success('Descumprimento registrado. Parceria encerrada.')
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-white font-bold text-2xl">
          {inf?.name ?? 'Influenciador removido'}
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          {inf?.instagram_handle}
          {contrato.template_versao && <> · modelo versão {contrato.template_versao}</>}
        </p>
      </div>

      {/* Situação */}
      <div className="bg-[#141414] border border-[#1e1e1e] rounded-2xl p-5 flex flex-col gap-3">
        {aceito ? (
          <>
            <div className="text-[#00ff87] font-semibold">Aceito pelo influenciador</div>
            <div className="text-gray-400 text-sm leading-relaxed">
              Em {contrato.accepted_at && new Date(contrato.accepted_at).toLocaleString('pt-BR')}
              {contrato.accepted_ip && <> · IP {contrato.accepted_ip}</>}
            </div>
            {contrato.accepted_user_agent && (
              <div className="text-gray-600 text-xs break-all">
                {contrato.accepted_user_agent}
              </div>
            )}
            <p className="text-gray-600 text-xs leading-relaxed">
              O texto abaixo está congelado. Editar o modelo daqui pra frente não
              altera este contrato — é o que faz o aceite valer como prova.
            </p>
          </>
        ) : contrato.status === 'descumprido' ? (
          <>
            <div className="text-red-400 font-semibold">Descumprido</div>
            <p className="text-gray-400 text-sm leading-relaxed">
              A parceria foi encerrada e o link está desligado. A comissão das
              vendas já confirmadas continua devida.
            </p>
            {contrato.fee_a_restituir != null && (
              <p className="text-red-400 text-sm">
                Fee a restituir: {brl(Number(contrato.fee_a_restituir))}
              </p>
            )}
          </>
        ) : (
          <>
            <div className="text-yellow-400 font-semibold">Aguardando aceite</div>
            <p className="text-gray-400 text-sm leading-relaxed">
              O link do influenciador está <span className="text-white">desligado</span> até
              ele aceitar, no portal dele.
            </p>
            {faltaPreencher && (
              <p className="text-yellow-500 text-sm leading-relaxed">
                Faltam dados dele (CPF, estado civil ou endereço). Ele preenche no
                portal, e o texto se completa sozinho — ou você preenche na ficha
                dele e clica em atualizar aqui.
              </p>
            )}
          </>
        )}
      </div>

      {/* O texto */}
      <div className="bg-[#141414] border border-[#1e1e1e] rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-[#1e1e1e] flex items-center justify-between gap-3">
          <span className="text-gray-400 text-sm font-medium">Texto do contrato</span>
          {!aceito && contrato.status !== 'descumprido' && (
            <button
              onClick={atualizarTexto}
              disabled={loading}
              className="text-xs border border-[#2a2a2a] text-gray-400 hover:text-white hover:border-[#00ff87] px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            >
              Atualizar com os dados de agora
            </button>
          )}
        </div>
        <pre className="px-5 py-4 text-gray-300 text-sm whitespace-pre-wrap font-sans leading-relaxed max-h-[32rem] overflow-y-auto">
          {contrato.corpo}
        </pre>
      </div>

      {aceito && (
        <div className="bg-[#141414] border border-red-900/40 rounded-2xl p-5">
          <div className="text-white font-semibold text-sm">Registrar descumprimento</div>
          <p className="text-gray-500 text-sm mt-1 leading-relaxed">
            Use quando ele apagar ou arquivar o conteúdo antes do fim da vigência.
            O sistema não percebe isso sozinho — o Instagram não avisa ninguém.
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={registrarDescumprimento}
            loading={loading}
            className="mt-4 border-red-900/50 text-red-400 hover:bg-red-950/30"
          >
            Registrar descumprimento
          </Button>
        </div>
      )}
    </div>
  )
}
