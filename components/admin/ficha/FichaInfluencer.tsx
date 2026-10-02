'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { ResumoComissao } from '@/lib/commission'
import type { Parceria } from '@/lib/partnership'

/**
 * A ficha do influenciador: a pessoa inteira numa tela, com UM botão de editar.
 *
 * "Editar é editar. Edita tudo." -- o César, em 02/10/2026. Antes disto,
 * configurar uma pessoa exigia seis telas, e a primeira versão desta ficha ainda
 * editava só um bloco, com um botão escondido no cabeçalho. Era mais um remendo.
 *
 * Ficam FORA do botão Editar, e isso é de propósito: renovar parceria (encerra
 * uma e abre outra -- é evento, não edição) e o acesso ao portal (é conta de
 * autenticação, não campo de cadastro). Os dois aparecem como ações, com nome
 * próprio, embaixo.
 */

export type FichaDados = {
  cpf: string | null; estado_civil: string | null; endereco: string | null; cep: string | null
  telefone: string | null; cidade: string | null; nicho: string | null
  seguidores: number | null; observacoes: string | null
} | null

export type BancoDados = {
  payment_method: string | null; pix_key: string | null; bank_name: string | null
  bank_agency: string | null; bank_account: string | null
  payment_document: string | null; payment_notes: string | null
} | null

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dia = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('pt-BR')

function Secao({ titulo, children, nota }: {
  titulo: string; children: React.ReactNode; nota?: string
}) {
  return (
    <section className="bg-[#141414] border border-[#1e1e1e] rounded-2xl p-5">
      <h2 className="text-white font-semibold mb-1">{titulo}</h2>
      {nota && <p className="text-gray-600 text-xs mb-4 leading-relaxed">{nota}</p>}
      <div className={nota ? '' : 'mt-4'}>{children}</div>
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
  influencer, ficha, banco, parceria, motivoLinkInativo, comissao, totalCupons,
  acesso, contrato, podeEditar, podeVerBanco, acoes,
}: {
  influencer: { id: string; name: string; instagram_handle: string; coupon_code: string
                active: boolean; campanha: string }
  ficha: FichaDados
  banco: BancoDados
  parceria: Parceria | null
  motivoLinkInativo: string | null
  comissao: ResumoComissao
  totalCupons: number
  acesso: { id: string; email: string | null } | null
  contrato: { id: string; status: string; accepted_at: string | null } | null
  podeEditar: boolean
  podeVerBanco: boolean
  acoes: React.ReactNode
}) {
  const router = useRouter()
  const [editando, setEditando] = useState(false)
  const [loading, setLoading] = useState(false)

  const inicial = {
    name: influencer.name,
    instagram_handle: influencer.instagram_handle,
    coupon_code: influencer.coupon_code,
    active: influencer.active,
    telefone: ficha?.telefone ?? '', cidade: ficha?.cidade ?? '',
    nicho: ficha?.nicho ?? '', seguidores: ficha?.seguidores?.toString() ?? '',
    observacoes: ficha?.observacoes ?? '',
    cpf: ficha?.cpf ?? '', estado_civil: ficha?.estado_civil ?? '',
    endereco: ficha?.endereco ?? '', cep: ficha?.cep ?? '',
    pix_key: banco?.pix_key ?? '', bank_name: banco?.bank_name ?? '',
    bank_agency: banco?.bank_agency ?? '', bank_account: banco?.bank_account ?? '',
    payment_document: banco?.payment_document ?? '', payment_notes: banco?.payment_notes ?? '',
    commission_per_sale: parceria?.commission_per_sale?.toString() ?? '',
    commission_starts_at: parceria?.commission_starts_at?.toString() ?? '',
    fee_amount: parceria?.fee_amount?.toString() ?? '',
    discount_value: parceria?.discount_value?.toString() ?? '',
    validity_days: parceria?.validity_days?.toString() ?? '',
    ends_at: parceria?.ends_at ?? '',
  }
  const [form, setForm] = useState(inicial)
  const set = (k: keyof typeof inicial) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }))

  async function salvar() {
    setLoading(true)
    const { name, instagram_handle, coupon_code, active, ...resto } = form
    const res = await fetch('/api/admin/influencer-save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        influencer_id: influencer.id,
        parceria_id: parceria?.id ?? null,
        pessoa: { name, instagram_handle, coupon_code, active },
        ...resto,
        ends_at: resto.ends_at || null,
      }),
    })
    const json = await res.json()
    setLoading(false)
    if (!res.ok) return toast.error(json.error || 'Não foi possível salvar.')
    toast.success('Ficha salva.')
    setEditando(false)
    router.refresh()
  }

  function cancelar() {
    setForm(inicial)
    setEditando(false)
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
        <div className="flex items-center gap-3">
          <span className={`text-xs font-bold px-3 py-1 rounded-full ${
            motivoLinkInativo ? 'bg-red-950 text-red-400' : 'bg-[#00ff87]/10 text-[#00ff87]'
          }`}>
            {motivoLinkInativo ?? 'Link no ar'}
          </span>
          {podeEditar && !editando && (
            <Button size="sm" onClick={() => setEditando(true)}>Editar</Button>
          )}
        </div>
      </div>

      {/* Barra de salvar, enquanto edita */}
      {editando && (
        <div className="bg-[#00ff87]/5 border border-[#00ff87]/30 rounded-2xl p-4 flex items-center justify-between gap-4 flex-wrap sticky top-16 z-10">
          <p className="text-gray-300 text-sm">
            Editando a ficha inteira. Um salvar grava tudo.
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={cancelar} disabled={loading}>Cancelar</Button>
            <Button onClick={salvar} loading={loading}>Salvar</Button>
          </div>
        </div>
      )}

      {/* Os números — leitura sempre */}
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

      {/* A PESSOA */}
      <Secao titulo="A pessoa" nota="Contato, qualificação e notas. Só admin e Financeiro leem — o Lojista não alcança, nem pela API.">
        {editando ? (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="Nome completo" value={form.name} onChange={set('name')} disabled={loading} />
              <Input label="@ Instagram" value={form.instagram_handle} onChange={set('instagram_handle')} disabled={loading} />
              <Input label="WhatsApp / telefone" value={form.telefone} onChange={set('telefone')} disabled={loading} />
              <Input label="Cidade" value={form.cidade} onChange={set('cidade')} disabled={loading} />
              <Input label="Nicho" placeholder="moda, lifestyle, motos…" value={form.nicho} onChange={set('nicho')} disabled={loading} />
              <Input label="Seguidores" type="number" value={form.seguidores} onChange={set('seguidores')} disabled={loading} />
              <Input label="CPF" value={form.cpf} onChange={set('cpf')} disabled={loading} />
              <Input label="Estado civil" value={form.estado_civil} onChange={set('estado_civil')} disabled={loading} />
              <Input label="Endereço" value={form.endereco} onChange={set('endereco')} disabled={loading} className="sm:col-span-2" />
              <Input label="CEP" value={form.cep} onChange={set('cep')} disabled={loading} />
              <label className="flex items-center gap-2 text-sm text-gray-300 self-end pb-3">
                <input type="checkbox" checked={form.active} disabled={loading}
                  onChange={(e) => setForm((p) => ({ ...p, active: e.target.checked }))}
                  className="w-4 h-4 accent-[#00ff87]" />
                Influenciador ativo
              </label>
            </div>
            <div>
              <label className="text-sm text-gray-300 block mb-1.5">Observações</label>
              <textarea rows={4} value={form.observacoes} onChange={set('observacoes')} disabled={loading}
                placeholder="o que foi combinado por fora, histórico da conversa…"
                className="w-full px-4 py-3 rounded-lg border border-[#2a2a2a] bg-[#1e1e1e] text-white text-sm focus:border-[#00ff87] focus:outline-none" />
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
      </Secao>

      {/* O ACORDO */}
      <Secao titulo="O acordo" nota={
        parceria
          ? 'Vale daqui para a frente. Cupom já gerado guarda o que valia quando nasceu e não muda.'
          : undefined
      }>
        {!parceria ? (
          <p className="text-gray-500 text-sm">Sem parceria ativa.</p>
        ) : editando ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Comissão por venda (R$)" type="number" value={form.commission_per_sale} onChange={set('commission_per_sale')} disabled={loading} />
            <Input label="Comissão inicia na venda nº" type="number" value={form.commission_starts_at} onChange={set('commission_starts_at')} disabled={loading} />
            <Input label="Fee fixo (R$)" type="number" value={form.fee_amount} onChange={set('fee_amount')} disabled={loading} />
            <Input label="Parceria até" type="date" value={form.ends_at} onChange={set('ends_at')} disabled={loading} />
            <Input label="Desconto do cupom (R$)" type="number" value={form.discount_value} onChange={set('discount_value')} disabled={loading} />
            <Input label="Validade do cupom (dias)" type="number" value={form.validity_days} onChange={set('validity_days')} disabled={loading} />
          </div>
        ) : (
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
        )}
      </Secao>

      {/* O BANCÁRIO */}
      {podeVerBanco && (
        <Secao titulo="Para pagar" nota="Dado sensível. Só admin e Financeiro.">
          {editando ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="Chave PIX" value={form.pix_key} onChange={set('pix_key')} disabled={loading} />
              <Input label="CPF/CNPJ do recebedor" value={form.payment_document} onChange={set('payment_document')} disabled={loading} />
              <Input label="Banco" value={form.bank_name} onChange={set('bank_name')} disabled={loading} />
              <Input label="Agência" value={form.bank_agency} onChange={set('bank_agency')} disabled={loading} />
              <Input label="Conta" value={form.bank_account} onChange={set('bank_account')} disabled={loading} />
              <Input label="Observação de pagamento" value={form.payment_notes} onChange={set('payment_notes')} disabled={loading} />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
              <div>
                <Linha rotulo="Chave PIX" valor={banco?.pix_key} />
                <Linha rotulo="CPF/CNPJ" valor={banco?.payment_document} />
              </div>
              <div>
                <Linha rotulo="Banco" valor={banco?.bank_name} />
                <Linha rotulo="Agência / conta" valor={
                  banco?.bank_agency || banco?.bank_account
                    ? `${banco?.bank_agency ?? '—'} / ${banco?.bank_account ?? '—'}` : null
                } />
              </div>
            </div>
          )}
        </Secao>
      )}

      {/* O LINK */}
      <Secao titulo="O link dele">
        {editando ? (
          <Input label="Código do cupom" value={form.coupon_code} onChange={set('coupon_code')} disabled={loading} />
        ) : (
          <>
            <code className="text-white text-sm break-all">{`${site}/c/${influencer.coupon_code}`}</code>
            {motivoLinkInativo && (
              <p className="text-red-400 text-sm mt-2">Fora do ar: {motivoLinkInativo.toLowerCase()}.</p>
            )}
          </>
        )}
      </Secao>

      {/* Acesso e contrato — leitura; mexer neles são ações, não edição */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <Secao titulo="Acesso ao portal">
          {acesso?.email
            ? <p className="text-gray-300 text-sm break-all">{acesso.email}</p>
            : <p className="text-gray-500 text-sm">Sem acesso criado.</p>}
        </Secao>

        <Secao titulo="Contrato">
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
                ? 'Parceria isenta de contrato.' : 'Nenhum contrato gerado.'}
            </p>
          )}
        </Secao>
      </div>

      {/* AÇÕES — o que não é edição */}
      {podeEditar && !editando && (
        <Secao titulo="Ações" nota="Não são edição de campo: cada uma tem efeito próprio.">
          {acoes}
        </Secao>
      )}
    </div>
  )
}
