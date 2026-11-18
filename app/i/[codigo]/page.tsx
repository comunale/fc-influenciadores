import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { FoxLogo } from '@/components/FoxLogo'
import { FormularioDoComprador } from '@/components/indicacao/FormularioDoComprador'
import { podeGerar, VALOR_DO_DESCONTO } from '@/lib/indicacao/link'
import { formatCurrency } from '@/lib/utils'
import type { Metadata } from 'next'

interface PageProps {
  params: Promise<{ codigo: string }>
}

// Toda abertura conta como clique, então a página não pode ser cacheada.
export const dynamic = 'force-dynamic'

/**
 * Robôs de pré-visualização não são gente.
 *
 * O link é divulgado por WhatsApp, e o WhatsApp busca a página para montar o
 * cartãozinho do preview. Contar isso como clique inflaria justamente a métrica
 * que mede eficácia — e inflaria mais para quem divulgou em mais grupos.
 */
const ROBOS = /bot|crawl|spider|slurp|facebookexternalhit|whatsapp|telegram|twitterbot|slackbot|discordbot|preview|headless/i

const TITULO = 'FoxCycles | R$ 300 de desconto na sua moto elétrica'

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { codigo } = await params
  const supabase = createAdminClient()

  const { data: indicador } = await supabase
    .from('indicadores')
    .select('nome, ativo')
    .eq('codigo', codigo.toUpperCase())
    .maybeSingle()

  if (!indicador || !indicador.ativo) return { title: TITULO }

  const primeiro = indicador.nome.trim().split(' ')[0]
  const title = `FoxCycles | R$ 300 OFF — indicado por ${primeiro}`
  const description =
    'Cupom de R$ 300 de desconto na sua moto elétrica FoxCycles. Preencha seus dados e use na loja.'

  return {
    title,
    description,
    openGraph: { title, description, siteName: 'FoxCycles', type: 'website' },
  }
}

/** O link existe e não gera cupom. A frase diz por quê, sem contar o negócio. */
function LinkForaDoAr({ motivo }: { motivo: string }) {
  return (
    <main className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center px-4">
      <FoxLogo size="lg" />
      <h1 className="text-white font-bold text-xl mt-6 text-center">
        Este link não está gerando cupom
      </h1>
      <p className="text-gray-500 text-sm mt-2 text-center max-w-sm leading-relaxed">{motivo}</p>
      <a
        href="https://foxcycles.com.br"
        className="mt-6 text-[#00ff87] hover:underline text-sm"
      >
        Conhecer as motos FoxCycles
      </a>
      <a href="/indique" className="mt-3 text-gray-500 hover:underline text-xs">
        Quero indicar e ganhar também
      </a>
    </main>
  )
}

export default async function LinkDeIndicacaoPage({ params }: PageProps) {
  const { codigo } = await params
  const supabase = createAdminClient()

  const { data: indicador } = await supabase
    .from('indicadores')
    .select('id, nome, ativo, teto_usos')
    .eq('codigo', codigo.toUpperCase())
    .maybeSingle()

  if (!indicador) notFound()

  const cabecalhos = await headers()
  const userAgent = cabecalhos.get('user-agent') ?? ''

  const ip =
    cabecalhos.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    cabecalhos.get('x-real-ip') ||
    null

  if (!ROBOS.test(userAgent)) {
    // Um clique por IP por hora, e não um por carregamento.
    //
    // Sem isso a rota é um INSERT público sem autenticação e sem limite: um
    // `while true; do curl ...` enche a tabela e infla a métrica, e a própria
    // pessoa infla a dela segurando F5. Com a janela, "cliques" volta a
    // significar gente que abriu o link, que é o que a decisão 7 queria medir.
    const umaHoraAtras = new Date(Date.now() - 3600_000).toISOString()
    const { count: jaContou } = await supabase
      .from('indicador_cliques')
      .select('id', { count: 'exact', head: true })
      .eq('indicador_id', indicador.id)
      .eq('ip', ip ?? '')
      .gte('created_at', umaHoraAtras)

    if (!jaContou) {
      // Clique registrado antes de qualquer trava: saber que o link foi aberto
      // e não gerou cupom é justamente o que a métrica existe para contar.
      await supabase.from('indicador_cliques').insert({
        indicador_id: indicador.id,
        ip,
        user_agent: userAgent.slice(0, 500) || null,
      })
    }
  }

  // O teto conta a FILA (pendente + usado), igual à rota que gera o cupom.
  const { count: naFila } = await supabase
    .from('coupons')
    .select('id', { count: 'exact', head: true })
    .eq('indicador_id', indicador.id)
    .in('status', ['pending', 'used'])

  const liberado = podeGerar(indicador, naFila ?? 0)
  if (!liberado.ok) return <LinkForaDoAr motivo={liberado.erro} />

  const primeiroNome = indicador.nome.trim().split(' ')[0]

  return (
    <main className="min-h-screen bg-[#0a0a0a] flex flex-col items-center">
      <header className="w-full bg-[#0a0a0a] border-b border-[#1e1e1e] px-4 py-4 flex justify-center">
        <FoxLogo size="md" />
      </header>

      <div className="w-full max-w-md px-4 py-8 flex flex-col gap-6">
        <div className="text-center">
          <span className="inline-block bg-[#1e1e1e] border border-[#2a2a2a] text-gray-300 text-sm px-4 py-1.5 rounded-full">
            Indicado por <span className="text-[#00ff87] font-semibold">{primeiroNome}</span>
          </span>
        </div>

        <div className="text-center flex flex-col gap-2">
          <div className="text-6xl font-black text-[#00ff87] leading-none">
            {formatCurrency(VALOR_DO_DESCONTO)}
          </div>
          <div className="text-xl font-bold text-white">de desconto na sua moto elétrica</div>
          <div className="text-sm text-gray-400 mt-1">
            Gere o cupom aqui e apresente na loja no momento da compra.
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-[#2a2a2a]" />
          <span className="text-xs text-gray-500 uppercase tracking-widest">
            Preencha seus dados
          </span>
          <div className="flex-1 h-px bg-[#2a2a2a]" />
        </div>

        <div className="bg-[#141414] border border-[#1e1e1e] rounded-2xl p-6">
          <FormularioDoComprador codigo={codigo.toUpperCase()} />
        </div>

        <div className="text-center flex flex-col gap-2">
          <p className="text-xs text-gray-600">Programa de Indicação · FoxCycles</p>
          <a href="/indique" className="text-gray-500 hover:underline text-xs">
            Também quero indicar e ganhar R$ 200
          </a>
        </div>
      </div>
    </main>
  )
}
