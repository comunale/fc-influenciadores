'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { formatCurrency, formatDate } from '@/lib/utils'
import { formatCPF } from '@/lib/validators/cpf'
import { can, type Role } from '@/lib/auth/roles'
import type { IndicadorNaTela } from './tipos'

interface Props {
  linhas: IndicadorNaTela[]
  aPagar: number
  jaPago: number
  role: Role
}

/**
 * A lista, com a ação na própria linha.
 *
 * Teto e encerramento moram ao lado do número que justifica a decisão: quem vê
 * "38 usos, teto vazio" é quem decide pôr um teto, e mandar essa pessoa para
 * outra tela para fazê-lo é como a decisão deixa de ser tomada.
 */
export function ListaDeIndicadores({ linhas, aPagar, jaPago, role }: Props) {
  const router = useRouter()
  const podeEditar = can(role, 'indicadores.edit')
  const [salvando, setSalvando] = useState<string | null>(null)
  const [tetoEmEdicao, setTetoEmEdicao] = useState<Record<string, string>>({})

  async function salvar(id: string, corpo: Record<string, unknown>, sucesso: string) {
    setSalvando(id)
    try {
      const res = await fetch(`/api/admin/indicadores/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar.')
      toast.success(sucesso)
      router.refresh()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Tente novamente.')
    } finally {
      setSalvando(null)
    }
  }

  function salvarTeto(l: IndicadorNaTela) {
    const bruto = (tetoEmEdicao[l.id] ?? '').trim()
    if (bruto === '') {
      salvar(l.id, { teto_usos: null }, `${l.nome}: teto removido.`)
      return
    }
    const n = Number(bruto)
    if (!Number.isInteger(n) || n < 1) {
      toast.error('O teto é um número inteiro maior que zero, ou vazio para sem teto.')
      return
    }
    salvar(l.id, { teto_usos: n }, `${l.nome}: teto de ${n} usos.`)
  }

  /**
   * O botão existe porque, sem ele, a exportação reimprimiria o mesmo prêmio
   * todo mês e a pessoa cobraria de novo o que já recebeu. O sistema não paga —
   * ele registra que VOCÊ pagou.
   */
  async function marcarPremiado(l: IndicadorNaTela) {
    if (
      !confirm(
        `Marcar ${formatCurrency(l.aReceber)} de ${l.nome} como pago?\n\n` +
          `Isso NÃO paga nada: registra que você já pagou, para esse valor sair ` +
          `da próxima exportação e do "a receber" que ela vê na área dela.`
      )
    )
      return

    setSalvando(l.id)
    try {
      const res = await fetch('/api/admin/indicadores/premiar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ indicador_id: l.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao marcar.')
      toast.success(`${l.nome}: ${data.premiados} prêmio(s) marcado(s) como pago.`)
      router.refresh()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Tente novamente.')
    } finally {
      setSalvando(null)
    }
  }

  function alternarSituacao(l: IndicadorNaTela) {
    if (l.ativo) {
      if (
        !confirm(
          `Encerrar o benefício de ${l.nome}? O link dela para de gerar cupom na hora. ` +
            `Os prêmios já conferidos continuam valendo.`
        )
      )
        return
      salvar(l.id, { ativo: false }, `${l.nome}: benefício encerrado.`)
      return
    }
    salvar(l.id, { ativo: true }, `${l.nome}: benefício reativado.`)
  }

  if (linhas.length === 0) {
    return (
      <div className="bg-[#141414] border border-[#1e1e1e] rounded-xl p-8 text-center">
        <p className="text-gray-400 text-sm">Ninguém se cadastrou no programa ainda.</p>
        <p className="text-gray-600 text-xs mt-2">
          O link do cadastro é <span className="text-gray-400">/indique</span>.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-4">
        <div className="bg-[#141414] border border-[#1e1e1e] rounded-xl px-5 py-4">
          <div className="text-xs text-gray-500 uppercase tracking-wider">Total a pagar</div>
          <div className="text-2xl font-black text-[#00ff87]">{formatCurrency(aPagar)}</div>
        </div>
        <div className="bg-[#141414] border border-[#1e1e1e] rounded-xl px-5 py-4">
          <div className="text-xs text-gray-500 uppercase tracking-wider">Já pago</div>
          <div className="text-2xl font-black text-gray-400">{formatCurrency(jaPago)}</div>
        </div>
        <div className="bg-[#141414] border border-[#1e1e1e] rounded-xl px-5 py-4">
          <div className="text-xs text-gray-500 uppercase tracking-wider">Participantes</div>
          <div className="text-2xl font-black text-white">{linhas.length}</div>
        </div>
        <div className="ml-auto flex gap-3">
          <a
            href="/api/admin/indicadores/export"
            className="inline-flex h-11 items-center rounded-lg bg-[#00ff87] px-5 text-sm font-semibold text-black hover:bg-[#00cc6a]"
          >
            Exportar o que falta pagar
          </a>
          <a
            href="/api/admin/indicadores/export?todos=1"
            className="inline-flex h-11 items-center rounded-lg border border-[#2a2a2a] px-5 text-sm font-semibold text-white hover:bg-[#1e1e1e]"
          >
            Exportar tudo
          </a>
        </div>
      </div>

      <div className="bg-[#141414] border border-[#1e1e1e] rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[#1a1a1a] text-gray-500 text-xs uppercase tracking-wider">
            <tr>
              <th className="px-4 py-3 text-left">Quem indica</th>
              <th className="px-4 py-3 text-left">Código</th>
              <th className="px-4 py-3 text-right">Cliques</th>
              <th className="px-4 py-3 text-right">Cupons</th>
              <th className="px-4 py-3 text-right">Vendas</th>
              <th className="px-4 py-3 text-right">A receber</th>
              <th className="px-4 py-3 text-left">Teto de usos</th>
              <th className="px-4 py-3 text-left">Situação</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.id} className="border-t border-[#1e1e1e]">
                <td className="px-4 py-3">
                  <div className="text-white font-medium">{l.nome}</div>
                  <div className="text-gray-500 text-xs font-mono">{formatCPF(l.cpf)}</div>
                  <div className="text-gray-500 text-xs">{l.telefone}</div>
                </td>
                <td className="px-4 py-3 font-mono text-[#00ff87] whitespace-nowrap">
                  {l.codigo}
                  <div className="text-gray-600 text-xs font-sans">
                    desde {formatDate(l.criadoEm)}
                  </div>
                </td>
                <td className="px-4 py-3 text-right text-gray-300">{l.cliques}</td>
                <td className="px-4 py-3 text-right text-gray-300">{l.cupons}</td>
                <td className="px-4 py-3 text-right text-gray-300">
                  {l.usos}
                  <div className="text-gray-600 text-xs">{l.premiados} conferidas</div>
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <div className="font-bold text-[#00ff87]">{formatCurrency(l.aReceber)}</div>
                  {l.jaPremiado > 0 && (
                    <div className="text-gray-500 text-xs">
                      já pago {formatCurrency(l.jaPremiado)}
                    </div>
                  )}
                  {podeEditar && l.aReceber > 0 && (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      loading={salvando === l.id}
                      onClick={() => marcarPremiado(l)}
                      className="mt-1"
                    >
                      Marcar como pago
                    </Button>
                  )}
                </td>
                <td className="px-4 py-3">
                  {podeEditar ? (
                    <div className="flex items-center gap-2">
                      <input
                        inputMode="numeric"
                        placeholder="sem teto"
                        defaultValue={l.tetoUsos ?? ''}
                        onChange={(e) =>
                          setTetoEmEdicao((p) => ({ ...p, [l.id]: e.target.value }))
                        }
                        className="h-9 w-24 px-2 rounded-lg border border-[#2a2a2a] bg-[#1e1e1e] text-white text-sm focus:border-[#00ff87] focus:outline-none placeholder:text-gray-600"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        loading={salvando === l.id}
                        onClick={() => salvarTeto(l)}
                      >
                        Salvar
                      </Button>
                    </div>
                  ) : (
                    <span className="text-gray-300">{l.tetoUsos ?? 'sem teto'}</span>
                  )}
                  {l.tetoUsos !== null && l.naFila >= l.tetoUsos && (
                    <div className="text-yellow-500 text-xs mt-1">
                      teto batido — o link não gera mais
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  {l.ativo ? (
                    <span className="text-[#00ff87] text-xs font-bold">Ativo</span>
                  ) : (
                    <>
                      <span className="text-red-400 text-xs font-bold">Encerrado</span>
                      {l.encerradoEm && (
                        <div className="text-gray-600 text-xs">{formatDate(l.encerradoEm)}</div>
                      )}
                    </>
                  )}
                  {podeEditar && (
                    <Button
                      type="button"
                      size="sm"
                      variant={l.ativo ? 'destructive' : 'secondary'}
                      loading={salvando === l.id}
                      onClick={() => alternarSituacao(l)}
                      className="mt-1"
                    >
                      {l.ativo ? 'Encerrar' : 'Reativar'}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-600">
        A exportação traz uma linha por venda conferida a pagar — é o arquivo que
        sustenta a premiação. Teto vazio significa sem limite.
      </p>
    </div>
  )
}
