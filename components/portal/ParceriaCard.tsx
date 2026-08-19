import type { ParceriaNoPortal } from '@/lib/portal'

const brl = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

const dia = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('pt-BR')

function Numero({ rotulo, valor, destaque }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <div className="bg-[#0f0f0f] border border-[#1e1e1e] rounded-xl px-4 py-3">
      <div className="text-gray-500 text-xs uppercase tracking-wide">{rotulo}</div>
      <div className={`font-bold mt-1 ${destaque ? 'text-[#00ff87] text-2xl' : 'text-white text-xl'}`}>
        {valor}
      </div>
    </div>
  )
}

export function ParceriaCard({ p }: { p: ParceriaNoPortal }) {
  const periodo = p.ends_at
    ? `${dia(p.starts_at)} a ${dia(p.ends_at)}`
    : `desde ${dia(p.starts_at)}`

  // Linha fechada: a parceria existe e o período aparece, mas nenhum número.
  // É o combinado para os acordos que foram acertados fora do sistema.
  if (!p.visivel) {
    return (
      <div className="bg-[#141414] border border-[#1e1e1e] rounded-2xl p-5 opacity-70">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-white font-semibold">Parceria {periodo}</div>
            <div className="text-gray-500 text-sm mt-0.5">encerrada · sem detalhes</div>
          </div>
          <span className="text-xs text-gray-500 border border-[#2a2a2a] rounded-full px-3 py-1">
            acertada fora do sistema
          </span>
        </div>
      </div>
    )
  }

  const r = p.resumo!

  return (
    <div className="bg-[#141414] border border-[#1e1e1e] rounded-2xl p-5">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <div>
          <div className="text-white font-semibold">Parceria {periodo}</div>
          <div className={`text-sm mt-0.5 ${p.encerrada ? 'text-gray-500' : 'text-[#00ff87]'}`}>
            {p.encerrada ? 'encerrada' : 'em andamento'}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Numero rotulo="Cupons gerados" valor={String(p.vendas.length)} />
        <Numero rotulo="Vendas aprovadas" valor={String(r.totalVendas)} />
        <Numero rotulo="Comissão gerada" valor={brl(r.comissaoGerada)} />
        <Numero rotulo="A receber" valor={brl(r.comissaoAPagar)} destaque />
      </div>

      {r.comissaoPaga > 0 && (
        <p className="text-gray-500 text-sm mt-3">
          Já pago: <span className="text-gray-300">{brl(r.comissaoPaga)}</span>
        </p>
      )}

      <p className="text-gray-600 text-xs mt-4 leading-relaxed">
        A venda entra na conta depois que a FoxCycles confere a nota fiscal.
      </p>
    </div>
  )
}
