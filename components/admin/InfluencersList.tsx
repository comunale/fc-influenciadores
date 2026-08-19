'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { ResumoComissao } from '@/lib/commission'
import { mensagemDeErro } from '@/lib/db-errors'
import { motivoLinkInativo } from '@/lib/influencer-status'
import type { Parceria } from '@/lib/partnership'
import { can, type Role } from '@/lib/auth/roles'
import { DadosBancarios } from './DadosBancarios'
import { AcessoPortal } from './AcessoPortal'
import { ParceriaPanel, type ParceriaForm } from './ParceriaPanel'
import { InfluencerForm } from './InfluencerForm'
import { Button } from '@/components/ui/button'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://influenciadores.foxcycles.com.br'

interface InfluencerRow {
  id: string
  name: string
  instagram_handle: string
  coupon_code: string
  active: boolean
  campaign_id: string
  campaign_name: string
  parceria: Parceria | null
  total_coupons: number
  used_coupons: number
  pending_coupons: number
  comissao: ResumoComissao
}

interface Campaign {
  id: string
  name: string
  discount_type: string
  discount_value: number
  validity_days: number
  coupon_title: string
  coupon_description: string
}

interface Props {
  influencers: InfluencerRow[]
  campaigns: Campaign[]
  canEdit?: boolean
  /** Acesso ao portal por influencer: e-mail e id do usuario. Ausente = nao tem. */
  acessos?: Record<string, { email: string; userId: string }>
  role?: Role
  /** Barra de filtros, renderizada pela pagina que faz a filtragem. */
  filtros?: React.ReactNode
}

const emptyForm = {
  campaign_id: '',
  name: '',
  instagram_handle: '',
  coupon_code: '',
  fee_amount: '500',
  commission_per_sale: '500',
  commission_starts_at: '2',
  active: true,
  // A oferta desceu da campanha para o influencer em 18/08/2026.
  discount_type: 'fixed',
  discount_value: '200',
  validity_days: '30',
  coupon_title: '',
  coupon_description: '',
}

export function InfluencersList({ influencers: initial, campaigns, canEdit = false, role, filtros, acessos = {} }: Props) {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [excluindoId, setExcluindoId] = useState<string | null>(null)
  const [bancarios, setBancarios] = useState<{ id: string; handle: string } | null>(null)
  const [acesso, setAcesso] = useState<{ id: string; handle: string } | null>(null)
  const podeVerBancarios = can(role, 'influencers.payment')
  const [parceria, setParceria] = useState<{ inf: InfluencerRow; acao: 'prorrogar' | 'renovar' } | null>(null)
  const [pForm, setPForm] = useState<ParceriaForm>({
    ends_at: '', discount_value: '', validity_days: '',
    commission_per_sale: '', commission_starts_at: '',
    fee_amount: '', fee_timing: 'inicio', payment_schedule: 'fim',
    zerar_contagem: false,
  })
  const [editing, setEditing] = useState<InfluencerRow | null>(null)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ ...emptyForm, campaign_id: campaigns[0]?.id || '' })

  function openCreate() {
    setEditing(null)
    setForm({ ...emptyForm, campaign_id: campaigns[0]?.id || '' })
    setShowForm(true)
  }

  function openEdit(inf: InfluencerRow) {
    setEditing(inf)
    setForm({
      campaign_id: inf.campaign_id,
      name: inf.name,
      instagram_handle: inf.instagram_handle,
      coupon_code: inf.coupon_code,
      active: inf.active,
      // Os termos vem da PARCERIA ativa, nao mais do influenciador.
      fee_amount: String(inf.parceria?.fee_amount ?? 0),
      commission_per_sale: String(inf.parceria?.commission_per_sale ?? 0),
      commission_starts_at: String(inf.parceria?.commission_starts_at ?? 1),
      discount_type: inf.parceria?.discount_type ?? 'fixed',
      discount_value: String(inf.parceria?.discount_value ?? 0),
      validity_days: String(inf.parceria?.validity_days ?? 30),
      coupon_title: inf.parceria?.coupon_title ?? '',
      coupon_description: inf.parceria?.coupon_description ?? '',
    })
    setShowForm(true)
  }

  function handleHandleChange(val: string) {
    const clean = val.replace('@', '').toUpperCase().replace(/[^A-Z0-9]/g, '')
    setForm((p) => ({ ...p, instagram_handle: `@${clean.toLowerCase()}`, coupon_code: clean }))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name || !form.coupon_code || !form.campaign_id) {
      toast.error('Preencha todos os campos obrigatórios.')
      return
    }
    setLoading(true)
    const supabase = createClient()
    // A PESSOA e o ACORDO sao gravados separado desde 18/08/2026.
    const dadosPessoa = {
      campaign_id: form.campaign_id,
      name: form.name.trim(),
      instagram_handle: form.instagram_handle,
      coupon_code: form.coupon_code.toUpperCase(),
      active: form.active,
    }

    const termosDoAcordo = {
      campaign_id: form.campaign_id,
      fee_amount: parseFloat(form.fee_amount) || 0,
      commission_per_sale: parseFloat(form.commission_per_sale) || 0,
      commission_starts_at: parseInt(form.commission_starts_at) || 1,
      discount_type: form.discount_type,
      discount_value: parseFloat(form.discount_value) || 0,
      validity_days: parseInt(form.validity_days) || 30,
      coupon_title: form.coupon_title.trim() || null,
      coupon_description: form.coupon_description.trim() || null,
    }

    let influencerId = editing?.id ?? ''
    let error = null

    if (editing) {
      const r = await supabase.from('influencers').update(dadosPessoa).eq('id', editing.id)
      error = r.error
    } else {
      const r = await supabase.from('influencers').insert(dadosPessoa).select('id').single()
      error = r.error
      influencerId = r.data?.id ?? ''
    }

    if (error) {
      setLoading(false)
      toast.error(error.code === '23505' ? 'Código de cupom já existe.' : error.message)
      return
    }

    // O acordo: atualiza a parceria ativa, ou cria a primeira ao cadastrar.
    const parceriaId = editing?.parceria?.id
    const rp = parceriaId
      ? await supabase.from('partnerships').update(termosDoAcordo).eq('id', parceriaId)
      : await supabase.from('partnerships').insert({
          ...termosDoAcordo, influencer_id: influencerId, status: 'ativa',
        }).select('id').single()

    setLoading(false)
    if (rp.error) {
      toast.error('Dados salvos, mas os termos da parceria falharam: ' + rp.error.message)
      return
    }

    // Parceria nova nasce com contrato, e o link dela fica desligado até o
    // influenciador aceitar. Quem já estava no ar em 19/08 seguiu isento --
    // ver lib/influencer-status.ts.
    const novaParceria = (rp.data as { id: string } | null)?.id
    if (novaParceria) {
      const rc = await fetch('/api/admin/contracts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partnership_id: novaParceria }),
      })
      if (!rc.ok) {
        // Não some com o aviso: sem contrato o link não liga, e ninguém
        // entenderia por quê.
        toast.error('Parceria criada, mas o contrato não foi gerado. Gere em Contratos.')
      }
    }

    toast.success(editing ? 'Influencer atualizado!' : 'Influencer criado!')
    setShowForm(false)
    router.refresh()
  }

  function abrirParceria(inf: InfluencerRow, acao: 'prorrogar' | 'renovar') {
    setParceria({ inf, acao })
    setPForm({
      ends_at: inf.parceria?.ends_at ?? '',
      discount_value: String(inf.parceria?.discount_value ?? 0),
      validity_days: String(inf.parceria?.validity_days ?? 30),
      commission_per_sale: String(inf.parceria?.commission_per_sale ?? 0),
      commission_starts_at: String(inf.parceria?.commission_starts_at ?? 1),
      fee_amount: String(inf.parceria?.fee_amount ?? 0),
      fee_timing: inf.parceria?.fee_timing ?? 'inicio',
      payment_schedule: inf.parceria?.payment_schedule ?? 'fim',
      zerar_contagem: false,
    })
  }

  async function salvarParceria() {
    if (!parceria) return
    setLoading(true)
    const res = await fetch('/api/admin/influencer-renew', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        influencer_id: parceria.inf.id,
        acao: parceria.acao,
        ends_at: pForm.ends_at || null,
        ...(parceria.acao === 'renovar' ? {
          termos: {
            discount_value: pForm.discount_value,
            validity_days: pForm.validity_days,
            commission_per_sale: pForm.commission_per_sale,
            commission_starts_at: pForm.commission_starts_at,
            fee_amount: pForm.fee_amount,
            fee_timing: pForm.fee_timing,
            payment_schedule: pForm.payment_schedule,
          },
          zerar_contagem: pForm.zerar_contagem,
        } : {}),
      }),
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) { toast.error(data.error || 'Erro ao salvar.'); return }
    toast.success(parceria.acao === 'prorrogar' ? 'Parceria prorrogada!' : 'Parceria renovada!')
    setParceria(null)
    router.refresh()
  }

  async function handleDelete(inf: { id: string; instagram_handle: string }) {
    const supabase = createClient()
    const { error } = await supabase.from('influencers').delete().eq('id', inf.id)
    if (error) { toast.error(mensagemDeErro(error.message, 'influencer')); return }
    toast.success(`Influencer ${inf.instagram_handle} excluído.`)
    setExcluindoId(null)
    router.refresh()
  }

  async function handleToggleActive(inf: InfluencerRow) {
    const supabase = createClient()
    const { error } = await supabase
      .from('influencers')
      .update({ active: !inf.active })
      .eq('id', inf.id)
    if (error) { toast.error('Erro ao atualizar.'); return }
    toast.success(inf.active ? 'Influencer desativado.' : 'Influencer ativado.')
    router.refresh()
  }

  function copyLink(code: string) {
    navigator.clipboard.writeText(`${SITE_URL}/c/${code}`)
    toast.success('Link copiado!')
  }

  return (
    <>
      {/* Cabeçalho */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Influencers</h1>
        </div>
        {canEdit && <Button onClick={openCreate} size="sm">+ Novo Influencer</Button>}
      </div>

      {/* A barra de filtros vem da pagina, que e quem faz a filtragem. O contador
          dela ja diz "N de M", entao o cabecalho acima nao repete. */}
      {filtros}

      {/* Modal criar/editar */}
      {showForm && (
        <InfluencerForm
          editando={!!editing}
          form={form}
          setForm={setForm}
          campaigns={campaigns}
          loading={loading}
          onSalvar={handleSave}
          onFechar={() => setShowForm(false)}
          onHandleChange={handleHandleChange}
        />
      )}
      {/* Lista */}
      <div className="flex flex-col gap-3">
        {initial.map((inf) => (
          <div key={inf.id}
            className="bg-[#141414] border border-[#1e1e1e] rounded-xl p-4 flex flex-col gap-3">
            {/* Linha 1: nome + status */}
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-white font-semibold">{inf.name}</span>
                  <span className="text-[#00ff87] text-sm">{inf.instagram_handle}</span>
                  {(() => {
                    // Dois interruptores independentes. Antes desta etiqueta, um
                    // influenciador ativo dentro de campanha desligada parecia no ar
                    // -- foi o que deixou 17 links mortos sem ninguem entender por que.
                    // Mesma regra que decide se o link abre (lib/influencer-status.ts).
                    // A campanha nao entra mais: desde 18/08/2026 ela nao derruba link.
                    const motivo = motivoLinkInativo(inf, inf.parceria)
                    const estado = motivo
                      ? { texto: motivo, cor: 'bg-red-950 text-red-400' }
                      : { texto: 'Ativo', cor: 'bg-[#00ff87]/10 text-[#00ff87]' }
                    return (
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${estado.cor}`}>
                        {estado.texto}
                      </span>
                    )
                  })()}
                </div>
                <div className="text-gray-500 text-xs mt-0.5">
                  Campanha: {inf.campaign_name} · Código:{' '}
                  <span className="font-mono text-gray-300">{inf.coupon_code}</span>
                  {inf.parceria?.ends_at && (
                    <> · Parceria até <span className="text-gray-300">{formatDate(inf.parceria.ends_at)}</span></>
                  )}
                </div>
              </div>
              {/* Financeiro tambem precisa deste botao, entao ele fica FORA do
                  bloco de canEdit, que e so admin. */}
              {podeVerBancarios && (
                <button
                  onClick={() => setBancarios({ id: inf.id, handle: inf.instagram_handle })}
                  className="text-xs border border-[#2a2a2a] text-gray-400 hover:text-white hover:border-[#00ff87] px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
                >
                  Bancários
                </button>
              )}
              {canEdit && (
                <div className="flex gap-2 flex-shrink-0">
                <button
                  onClick={() => setAcesso({ id: inf.id, handle: inf.instagram_handle })}
                  className={`text-xs border px-3 py-1.5 rounded-lg transition-colors ${
                    acessos[inf.id]
                      ? 'border-[#00ff87]/40 text-[#00ff87] hover:bg-[#00ff87]/10'
                      : 'border-[#2a2a2a] text-gray-400 hover:text-white hover:border-[#00ff87]'
                  }`}
                  title={acessos[inf.id] ? `Acessa como ${acessos[inf.id].email}` : 'Sem acesso ao portal'}
                >
                  {acessos[inf.id] ? 'Portal ✓' : 'Criar portal'}
                </button>
                <button
                  onClick={() => abrirParceria(inf, 'prorrogar')}
                  className="text-xs border border-[#2a2a2a] text-gray-400 hover:text-white hover:border-[#00ff87] px-3 py-1.5 rounded-lg transition-colors"
                >
                  Prorrogar
                </button>
                <button
                  onClick={() => abrirParceria(inf, 'renovar')}
                  className="text-xs border border-[#2a2a2a] text-gray-400 hover:text-white hover:border-[#00ff87] px-3 py-1.5 rounded-lg transition-colors"
                >
                  Renovar
                </button>
                <button
                  onClick={() => openEdit(inf)}
                  className="text-xs border border-[#2a2a2a] text-gray-400 hover:text-white hover:border-[#00ff87] px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
                >
                  Editar
                </button>
                </div>
              )}
            </div>

            {/* Linha 2: métricas */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div className="bg-[#1a1a1a] rounded-lg px-3 py-2 text-center">
                <div className="text-xs text-gray-500">Cupons</div>
                <div className="text-white font-bold">{inf.total_coupons}</div>
              </div>
              <div className="bg-[#1a1a1a] rounded-lg px-3 py-2 text-center">
                <div className="text-xs text-gray-500">Vendas aprovadas</div>
                <div className="text-white font-bold">{inf.comissao.totalVendas}</div>
              </div>
              <div className="bg-[#1a1a1a] rounded-lg px-3 py-2 text-center">
                <div className="text-xs text-gray-500">Comissão gerada</div>
                <div className="text-white font-bold text-sm">{formatCurrency(inf.comissao.comissaoGerada)}</div>
              </div>
              <div className="bg-[#1a1a1a] rounded-lg px-3 py-2 text-center">
                <div className="text-xs text-gray-500">A pagar</div>
                <div className={`font-bold text-sm ${inf.comissao.comissaoAPagar > 0 ? 'text-[#00ff87]' : 'text-gray-500'}`}>
                  {formatCurrency(inf.comissao.comissaoAPagar)}
                </div>
              </div>
            </div>

            {/* O numero "a pagar" nao se sustenta sozinho: precisa dizer de que acordo saiu. */}
            <p className="text-xs text-gray-600">
              Contrato: {formatCurrency(inf.parceria?.commission_per_sale ?? 0)} por venda, a partir da{' '}
              {inf.parceria?.commission_starts_at ?? 1}ª · Fixo de {formatCurrency(inf.comissao.fixo)}{' '}
              <span className="text-gray-700">(pagamento do fixo não é controlado pelo sistema)</span>
            </p>

            {/* Linha 3: link + ações */}
            <div className="flex items-center gap-2 flex-wrap">
              <code className="text-xs text-gray-600 bg-[#1a1a1a] px-3 py-1.5 rounded-lg flex-1 min-w-0 truncate">
                {SITE_URL}/c/{inf.coupon_code}
              </code>
              <button
                onClick={() => copyLink(inf.coupon_code)}
                className="text-xs bg-[#00ff87] text-black font-semibold px-3 py-1.5 rounded-lg hover:bg-[#00cc6a] transition-colors flex-shrink-0"
              >
                Copiar Link
              </button>
              {canEdit && (
                <>
                  <button
                    onClick={() => handleToggleActive(inf)}
                    className="text-xs border border-[#2a2a2a] text-gray-400 hover:text-white px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
                  >
                    {inf.active ? 'Desativar' : 'Ativar'}
                  </button>
                  {excluindoId === inf.id ? (
                    <>
                      <button
                        onClick={() => handleDelete(inf)}
                        className="text-xs bg-red-700 text-white font-semibold px-3 py-1.5 rounded-lg hover:bg-red-600 transition-colors flex-shrink-0"
                      >
                        Confirmar exclusão
                      </button>
                      <button
                        onClick={() => setExcluindoId(null)}
                        className="text-xs border border-[#2a2a2a] text-gray-400 hover:text-white px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
                      >
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setExcluindoId(inf.id)}
                      className="text-xs border border-red-900 text-red-400 hover:bg-red-950 px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
                    >
                      Excluir
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {acesso && (
        <AcessoPortal
          influencerId={acesso.id}
          handle={acesso.handle}
          emailAtual={acessos[acesso.id]?.email ?? null}
          userIdAtual={acessos[acesso.id]?.userId ?? null}
          onFechar={(mudou) => { setAcesso(null); if (mudou) router.refresh() }}
        />
      )}

      {bancarios && (
        <DadosBancarios
          influencerId={bancarios.id}
          handle={bancarios.handle}
          onFechar={() => setBancarios(null)}
        />
      )}

      <ParceriaPanel
        parceria={parceria}
        form={pForm}
        setForm={setPForm}
        loading={loading}
        onSalvar={salvarParceria}
        onFechar={() => setParceria(null)}
      />
    </>
  )
}
