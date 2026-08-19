'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { preencher, camposDoModelo } from '@/lib/contracts/preencher'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

/** Todo campo que o sistema sabe preencher. Espelha a lista da rota. */
const CAMPOS: { campo: string; explica: string }[] = [
  { campo: 'influenciador.nome',            explica: 'nome do cadastro' },
  { campo: 'influenciador.cpf',             explica: 'preenchido por ele ou por você' },
  { campo: 'influenciador.estado_civil',    explica: 'preenchido por ele ou por você' },
  { campo: 'influenciador.endereco',        explica: 'preenchido por ele ou por você' },
  { campo: 'influenciador.cep',             explica: 'preenchido por ele ou por você' },
  { campo: 'influenciador.link',            explica: 'o link do cupom dele' },
  { campo: 'parceria.vigencia',             explica: '19/08/2026 a 18/10/2026' },
  { campo: 'parceria.duracao',              explica: '60 (sessenta) dias' },
  { campo: 'parceria.comissao',             explica: 'R$ 500,00' },
  { campo: 'parceria.comissao_extenso',     explica: 'quinhentos reais' },
  { campo: 'parceria.fee',                  explica: 'R$ 500,00' },
  { campo: 'parceria.fee_extenso',          explica: 'quinhentos reais' },
  { campo: 'contrato.data',                 explica: '19 de agosto de 2026' },
  { campo: 'contrato.imagem_meses',         explica: '6' },
  { campo: 'contrato.imagem_meses_extenso', explica: 'seis' },
]

/** Dados de mentira, só para a prévia. */
const EXEMPLO = {
  influenciador: {
    nome: 'Nome do Influenciador', cpf: '000.000.000-00', estado_civil: 'solteiro(a)',
    endereco: 'Rua Exemplo, 100, Campinas/SP', cep: '13000-000',
    link: 'https://influenciadores.foxcycles.com.br/c/EXEMPLO',
  },
  parceria: {
    vigencia: '19/08/2026 a 18/10/2026', duracao: '60 (sessenta) dias',
    comissao: 500, fee: 500,
  },
  contrato: { data: '19 de agosto de 2026', imagem_meses: 6 },
}

export function ModeloEditor({
  inicial,
  versoes,
}: {
  inicial: { versao: number; titulo: string; corpo: string } | null
  versoes: { versao: number; created_at: string }[]
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [semFee, setSemFee] = useState(false)
  const [form, setForm] = useState({
    titulo: inicial?.titulo ?? '',
    corpo: inicial?.corpo ?? '',
  })

  const conhecidos = CAMPOS.map((c) => c.campo)

  const analise = useMemo(() => {
    const pedidos = camposDoModelo(form.corpo)
    const desconhecidos = pedidos.filter((c) => !conhecidos.includes(c))
    const dados = semFee
      ? { ...EXEMPLO, parceria: { ...EXEMPLO.parceria, fee: 0 } }
      : EXEMPLO
    const previa = preencher(form.corpo, dados)
    return { desconhecidos, previa }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.corpo, semFee])

  async function salvar() {
    if (analise.desconhecidos.length) {
      return toast.error('Corrija os campos desconhecidos antes de salvar.')
    }
    setLoading(true)
    const res = await fetch('/api/admin/contract-template', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const json = await res.json()
    setLoading(false)
    if (!res.ok) return toast.error(json.error || 'Erro ao salvar.')
    toast.success(`Modelo salvo como versão ${json.versao}.`)
    router.refresh()
  }

  function inserir(campo: string) {
    setForm((p) => ({ ...p, corpo: `${p.corpo}{{${campo}}}` }))
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Editor */}
      <div className="lg:col-span-2 flex flex-col gap-4">
        <Input
          label="Título"
          value={form.titulo}
          onChange={(e) => setForm((p) => ({ ...p, titulo: e.target.value }))}
          disabled={loading}
        />

        <div>
          <label className="text-sm text-gray-300 block mb-1.5">Texto</label>
          <textarea
            value={form.corpo}
            onChange={(e) => setForm((p) => ({ ...p, corpo: e.target.value }))}
            disabled={loading}
            rows={28}
            className="w-full px-4 py-3 rounded-lg border border-[#2a2a2a] bg-[#1e1e1e] text-white text-sm font-mono leading-relaxed focus:border-[#00ff87] focus:outline-none"
          />
        </div>

        {analise.desconhecidos.length > 0 && (
          <div className="bg-red-950/30 border border-red-900/50 rounded-xl p-4">
            <div className="text-red-400 text-sm font-semibold">
              Campos que o sistema não sabe preencher
            </div>
            <p className="text-gray-400 text-sm mt-1 leading-relaxed">
              {analise.desconhecidos.join(', ')}
            </p>
            <p className="text-gray-500 text-xs mt-2 leading-relaxed">
              Um campo digitado errado não daria erro na hora de salvar — viraria
              um buraco no contrato de alguém, na hora de assinar. Por isso não
              deixo salvar.
            </p>
          </div>
        )}

        <Button onClick={salvar} loading={loading} disabled={analise.desconhecidos.length > 0}>
          Salvar como versão {(versoes[0]?.versao ?? 0) + 1}
        </Button>

        <p className="text-gray-600 text-xs leading-relaxed">
          Salvar cria uma versão nova. As anteriores continuam existindo porque
          contrato já aceito aponta para o texto de quando nasceu — reescrever
          aquilo apagaria a prova.
        </p>
      </div>

      {/* Lado direito: campos e prévia */}
      <div className="flex flex-col gap-4">
        <div className="bg-[#141414] border border-[#1e1e1e] rounded-2xl p-4">
          <div className="text-white text-sm font-semibold mb-3">Campos disponíveis</div>
          <div className="flex flex-col gap-1.5 max-h-72 overflow-y-auto">
            {CAMPOS.map((c) => (
              <button
                key={c.campo}
                onClick={() => inserir(c.campo)}
                title={`Inserir no fim do texto — exemplo: ${c.explica}`}
                className="text-left px-2 py-1.5 rounded hover:bg-[#1e1e1e] transition-colors"
              >
                <div className="text-[#00ff87] text-xs font-mono">{`{{${c.campo}}}`}</div>
                <div className="text-gray-600 text-xs">{c.explica}</div>
              </button>
            ))}
          </div>
          <p className="text-gray-600 text-xs mt-3 leading-relaxed">
            Para um trecho que só entra às vezes, use{' '}
            <code className="text-gray-400">{'{{#se parceria.fee}}'}</code> … {' '}
            <code className="text-gray-400">{'{{/se}}'}</code>. É como a cláusula
            do fee some quando não há fee.
          </p>
        </div>

        <div className="bg-[#141414] border border-[#1e1e1e] rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-[#1e1e1e] flex items-center justify-between gap-2">
            <span className="text-white text-sm font-semibold">Prévia</span>
            <label className="text-gray-500 text-xs flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={semFee}
                onChange={(e) => setSemFee(e.target.checked)}
                className="accent-[#00ff87]"
              />
              sem fee
            </label>
          </div>
          <pre className="px-4 py-3 text-gray-400 text-xs whitespace-pre-wrap font-sans leading-relaxed max-h-80 overflow-y-auto">
            {analise.previa.corpo || 'O texto aparece aqui.'}
          </pre>
        </div>

        {versoes.length > 0 && (
          <div className="bg-[#141414] border border-[#1e1e1e] rounded-2xl p-4">
            <div className="text-white text-sm font-semibold mb-2">Versões</div>
            {versoes.map((v) => (
              <div key={v.versao} className="text-gray-500 text-xs py-0.5">
                versão {v.versao} · {new Date(v.created_at).toLocaleDateString('pt-BR')}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
