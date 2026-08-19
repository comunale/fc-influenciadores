'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

type Dados = { cpf: string | null; estado_civil: string | null;
               endereco: string | null; cep: string | null } | null

/**
 * Onde o influenciador preenche os próprios dados, lê o contrato e aceita.
 *
 * Ele nunca envia texto: preenche campos, e quem escreve o documento é o
 * servidor. E o IP do aceite é lido no servidor, do cabeçalho -- campo que o
 * próprio interessado pudesse preencher não serviria como prova.
 */
export function ContratoAceite({
  corpo,
  status,
  aceitoEm,
  faltaDados,
  dados,
}: {
  corpo: string
  status: string
  aceitoEm: string | null
  faltaDados: boolean
  dados: Dados
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [leu, setLeu] = useState(false)
  const [form, setForm] = useState({
    cpf: dados?.cpf ?? '',
    estado_civil: dados?.estado_civil ?? '',
    endereco: dados?.endereco ?? '',
    cep: dados?.cep ?? '',
  })

  const aceito = status === 'aceito'

  async function salvarDados(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const res = await fetch('/api/portal/dados', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const json = await res.json()
    setLoading(false)
    if (!res.ok) return toast.error(json.error || 'Não foi possível salvar.')
    toast.success('Dados salvos. O contrato foi completado.')
    router.refresh()
  }

  async function aceitar() {
    setLoading(true)
    const res = await fetch('/api/portal/aceitar', { method: 'POST' })
    const json = await res.json()
    setLoading(false)
    if (!res.ok) return toast.error(json.error || 'Não foi possível aceitar.')
    toast.success('Contrato aceito. Seu link já está ativo.')
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-white font-bold text-2xl">Contrato</h1>
        {aceito ? (
          <p className="text-[#00ff87] text-sm mt-1">
            Aceito em {aceitoEm && new Date(aceitoEm).toLocaleString('pt-BR')}
          </p>
        ) : (
          <p className="text-gray-500 text-sm mt-1">
            Seu link começa a funcionar assim que você aceitar.
          </p>
        )}
      </div>

      {/* Dados de qualificação */}
      {!aceito && (
        <form
          onSubmit={salvarDados}
          className="bg-[#141414] border border-[#1e1e1e] rounded-2xl p-5 flex flex-col gap-4"
        >
          <div>
            <div className="text-white font-semibold">Seus dados</div>
            <p className="text-gray-500 text-sm mt-1 leading-relaxed">
              {faltaDados
                ? 'Preencha para o contrato ficar completo. É o que aparece na qualificação das partes.'
                : 'Confira antes de aceitar — é o que consta no contrato.'}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="CPF"
              value={form.cpf}
              onChange={(e) => setForm((p) => ({ ...p, cpf: e.target.value }))}
              required
              disabled={loading}
            />
            <Input
              label="Estado civil"
              placeholder="solteiro(a), casado(a)…"
              value={form.estado_civil}
              onChange={(e) => setForm((p) => ({ ...p, estado_civil: e.target.value }))}
              required
              disabled={loading}
            />
            <Input
              label="Endereço completo"
              placeholder="rua, número, bairro, cidade/UF"
              value={form.endereco}
              onChange={(e) => setForm((p) => ({ ...p, endereco: e.target.value }))}
              required
              disabled={loading}
              className="sm:col-span-2"
            />
            <Input
              label="CEP"
              value={form.cep}
              onChange={(e) => setForm((p) => ({ ...p, cep: e.target.value }))}
              disabled={loading}
            />
          </div>

          <Button type="submit" loading={loading} className="self-start">
            Salvar meus dados
          </Button>
        </form>
      )}

      {/* O texto */}
      <div className="bg-[#141414] border border-[#1e1e1e] rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-[#1e1e1e]">
          <span className="text-gray-400 text-sm font-medium">
            {aceito ? 'Texto aceito por você' : 'Leia antes de aceitar'}
          </span>
        </div>
        <pre className="px-5 py-4 text-gray-300 text-sm whitespace-pre-wrap font-sans leading-relaxed max-h-[36rem] overflow-y-auto">
          {corpo}
        </pre>
      </div>

      {aceito ? (
        <p className="text-gray-600 text-xs leading-relaxed">
          Este é o texto exato que você aceitou, guardado como estava naquele
          momento. Alterações posteriores no modelo não mudam este contrato.
        </p>
      ) : faltaDados ? (
        <div className="bg-[#141414] border border-yellow-900/40 rounded-2xl p-5">
          <p className="text-yellow-500 text-sm leading-relaxed">
            Preencha seus dados acima para o contrato ficar completo. Enquanto
            faltar informação, o texto fica com espaços em branco e não dá para
            aceitar.
          </p>
        </div>
      ) : (
        <div className="bg-[#141414] border border-[#1e1e1e] rounded-2xl p-5 flex flex-col gap-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={leu}
              onChange={(e) => setLeu(e.target.checked)}
              className="mt-1 accent-[#00ff87] w-4 h-4"
            />
            <span className="text-gray-300 text-sm leading-relaxed">
              Li o contrato inteiro e concordo com os termos.
            </span>
          </label>

          <Button onClick={aceitar} loading={loading} disabled={!leu}>
            Aceitar contrato
          </Button>

          <p className="text-gray-600 text-xs leading-relaxed">
            Ao aceitar, ficam registrados a data, a hora e o endereço de onde
            você acessou, junto com esta exata versão do texto.
          </p>
        </div>
      )}
    </div>
  )
}
