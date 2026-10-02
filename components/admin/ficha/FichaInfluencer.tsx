'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { ResumoComissao } from '@/lib/commission'
import type { Parceria } from '@/lib/partnership'

type Ficha = {
  cpf: string | null; estado_civil: string | null; endereco: string | null; cep: string | null
  telefone: string | null; cidade: string | null; nicho: string | null
  seguidores: number | null; observacoes: string | null
} | null

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dia = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('pt-BR')

function Bloco({ titulo, children, acao }: {
  titulo: string; children: React.ReactNode; acao?: React.ReactNode
}) {
  return (
    <section className="bg-[#141414] border border-[#1e1e1e] rounded-2xl p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="text-white font-semibold">{titulo}</h2>
        {acao}
      </div>
      {children}
    </section>
  )
}

function Linha({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 border-b border-[#1a1a1a] last:border-0">
      <span className="text-gray-500 text-sm shrink-0">{rotulo}</span>
      <span className="text-gray-200 text-sm text-right break-words">{valor || '—'}</span>
    </div>
  )
}

export function FichaInfluencer({
  influencer, ficha, parceria, motivoLinkInativo, comissao, totalCupons,
  acesso, contrato, podeEditar,
}: {
  influencer: { id: string; name: string; instagram_handle: string; coupon_code: string
                active: boolean; campanha: string }
  ficha: Ficha
  parceria: Parceria | null
  motivoLinkInativo: string | null
  comissao: ResumoComissao
  totalCupons: number
  acesso: { id: string; email: string | null } | null
  contrato: { id: string; status: string; accepted_at: string | null } | null
  podeEditar: boolean
}) {
  const router = useRouter()
  const [editando, setEditando] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    telefone: ficha?.telefone ?? '', cidade: ficha?.cidade ?? '',
    nicho: ficha?.nicho ?? '', seguidores: ficha?.seguidores?.toString() ?? '',
    observacoes: ficha?.observacoes ?? '',
    cpf: ficha?.cpf ?? '', estado_civil: ficha?.estado_civil ?? '',
    endereco: ficha?.endereco ?? '', cep: ficha?.cep ?? '',
  })

  async function salvar() {
    setLoading(true)
    const res = await fetch('/api/admin/influencer-ficha', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ influencer_id: influencer.id, ...form }),
    })
    const json = await res.json()
    setLoading(false)
    if (!res.ok) return toast.error(json.error || 'Não foi possível salvar.')
    toast.success('Ficha salva.')
    setEditando(false)
    router.refresh()
  }

  const site = process.env.NEXT_PUBLIC_SITE_URL || 'https://influenciadores.foxcycles.com.br'

  return (
    <div className="flex flex-col gap-6">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-white font-bold text-2xl">{influencer.name}</h1>
          <p className="text-gray-500 text-sm mt-1">
            {influencer.instagram_handle}
            {ficha?.cidade && <> · {ficha.cidade}</>}
            {ficha?.nicho && <> · {ficha.nicho}</>}
            {ficha?.seguidores ? <> · {ficha.seguidores.toLocaleString('pt-BR')} seguidores</> : null}
          </p>
        </div>
        <span className={`text-xs font-bold px-3 py-1 rounded-full ${
          motivoLinkInativo ? 'bg-red-950 text-red-400' : 'bg-[#00ff87]/10 text-[#00ff87]'
        }`}>
          {motivoLinkInativo ?? 'Link no ar'}
        </span>
      </div>

      {/* Os números */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          ['Cupons gerados', String(totalCupons)],
          ['Vendas aprovadas', String(comissao.totalVendas)],
          ['Comissão gerada', brl(comissao.comissaoGerada)],
          ['A pagar', brl(comissao.comissaoAPagar)],
        ].map(([r, v]) => (
          <div key={r} className="bg-[#141414] border border-[#1e1e1e] rounded-xl px-4 py-3">
            <div className="text-gray-500 text-xs uppercase tracking-wide">{r}</div>
            <div className="text-white font-bold text-xl mt-1">{v}</div>
          </div>
        ))}
      </div>

      {/* A pessoa */}
      <Bloco
        titulo="A pessoa"
        acao={podeEditar && !editando && (
          <button onClick={() => setEditando(true)}
            className="text-xs border border-[#2a2a2a] text-gray-400 hover:text-white hover:border-[#00ff87] px-3 py-1.5 rounded-lg transition-colors">
            Editar
          </button>
        )}
      >
        {editando ? (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="WhatsApp / telefone" value={form.telefone}
                onChange={(e) => setForm((p) => ({ ...p, telefone: e.target.value }))} disabled={loading} />
              <Input label="Cidade" value={form.cidade}
                onChange={(e) => setForm((p) => ({ ...p, cidade: e.target.value }))} disabled={loading} />
              <Input label="Nicho" placeholder="moda, lifestyle, motos…" value={form.nicho}
                onChange={(e) => setForm((p) => ({ ...p, nicho: e.target.value }))} disabled={loading} />
              <Input label="Seguidores" type="number" value={form.seguidores}
                onChange={(e) => setForm((p) => ({ ...p, seguidores: e.target.value }))} disabled={loading} />
              <Input label="CPF" value={form.cpf}
                onChange={(e) => setForm((p) => ({ ...p, cpf: e.target.value }))} disabled={loading} />
              <Input label="Estado civil" value={form.estado_civil}
                onChange={(e) => setForm((p) => ({ ...p, estado_civil: e.target.value }))} disabled={loading} />
              <Input label="Endereço" value={form.endereco} className="sm:col-span-2"
                onChange={(e) => setForm((p) => ({ ...p, endereco: e.target.value }))} disabled={loading} />
              <Input label="CEP" value={form.cep}
                onChange={(e) => setForm((p) => ({ ...p, cep: e.target.value }))} disabled={loading} />
            </div>
            <div>
              <label className="text-sm text-gray-300 block mb-1.5">Observações</label>
              <textarea rows={4} value={form.observacoes} disabled={loading}
                placeholder="o que foi combinado por fora, histórico da conversa…"
                onChange={(e) => setForm((p) => ({ ...p, observacoes: e.target.value }))}
                className="w-full px-4 py-3 rounded-lg border border-[#2a2a2a] bg-[#1e1e1e] text-white text-sm focus:border-[#00ff87] focus:outline-none" />
              <p className="text-gray-600 text-xs mt-1.5">
                Só admin e Financeiro leem este bloco. O Lojista não alcança, nem pela API.
              </p>
            </div>
            <div className="flex gap-2">
              <Button onClick={salvar} loading={loading}>Salvar</Button>
              <Button variant="ghost" onClick={() => setEditando(false)} disabled={loading}>Cancelar</Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
            <div>
              <Linha rotulo="WhatsApp" valor={ficha?.telefone} />
              <Linha rotulo="Cidade" valor={ficha?.cidade} />
              <Linha rotulo="Nicho" valor={ficha?.nicho} />
              <Linha rotulo="Seguidores" valor={ficha?.seguidores?.toLocaleString('pt-BR')} />
            </div>
            <div>
              <Linha rotulo="CPF" valor={ficha?.cpf} />
              <Linha rotulo="Estado civil" valor={ficha?.estado_civil} />
              <Linha rotulo="Endereço" valor={ficha?.endereco} />
              <Linha rotulo="CEP" valor={ficha?.cep} />
            </div>
            {ficha?.observacoes && (
              <div className="sm:col-span-2 mt-4 pt-4 border-t border-[#1a1a1a]">
                <div className="text-gray-500 text-xs uppercase tracking-wide mb-1">Observações</div>
                <p className="text-gray-300 text-sm whitespace-pre-wrap leading-relaxed">{ficha.observacoes}</p>
              </div>
            )}
          </div>
        )}
      </Bloco>

      {/* O acordo */}
      <Bloco titulo="O acordo">
        {parceria ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
            <div>
              <Linha rotulo="Desde" valor={dia(parceria.starts_at)} />
              <Linha rotulo="Até" valor={parceria.ends_at ? dia(parceria.ends_at) : 'sem prazo'} />
              <Linha rotulo="Campanha" valor={influencer.campanha} />
            </div>
            <div>
              <Linha rotulo="Comissão por venda" valor={brl(parceria.commission_per_sale)} />
              <Linha rotulo="Fee fixo" valor={parceria.fee_amount > 0 ? brl(parceria.fee_amount) : 'nenhum'} />
              <Linha rotulo="Desconto do cupom" valor={`R$ ${parceria.discount_value} · ${parceria.validity_days} dias`} />
            </div>
          </div>
        ) : (
          <p className="text-gray-500 text-sm">Sem parceria ativa.</p>
        )}
      </Bloco>

      {/* O link */}
      <Bloco titulo="O link dele">
        <code className="text-white text-sm break-all">{`${site}/c/${influencer.coupon_code}`}</code>
        {motivoLinkInativo && (
          <p className="text-red-400 text-sm mt-2">Fora do ar: {motivoLinkInativo.toLowerCase()}.</p>
        )}
      </Bloco>

      {/* Acesso e contrato */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <Bloco titulo="Acesso ao portal">
          {acesso?.email ? (
            <p className="text-gray-300 text-sm break-all">{acesso.email}</p>
          ) : (
            <p className="text-gray-500 text-sm">Sem acesso criado.</p>
          )}
          <p className="text-gray-600 text-xs mt-2">
            Criar, redefinir senha ou remover: botão <span className="text-gray-400">Portal</span> na
            lista de Influencers.
          </p>
        </Bloco>

        <Bloco titulo="Contrato">
          {contrato ? (
            <>
              <p className={`text-sm ${contrato.status === 'aceito' ? 'text-[#00ff87]' : 'text-yellow-500'}`}>
                {contrato.status === 'aceito'
                  ? `Aceito em ${contrato.accepted_at && new Date(contrato.accepted_at).toLocaleString('pt-BR')}`
                  : 'Aguardando aceite'}
              </p>
              <Link href={`/admin/contratos/${contrato.id}`}
                className="text-[#00ff87] hover:underline text-sm mt-2 inline-block">
                Ver contrato →
              </Link>
            </>
          ) : (
            <p className="text-gray-500 text-sm">
              {parceria?.contract_required === false
                ? 'Parceria isenta de contrato.'
                : 'Nenhum contrato gerado.'}
            </p>
          )}
        </Bloco>
      </div>
    </div>
  )
}
