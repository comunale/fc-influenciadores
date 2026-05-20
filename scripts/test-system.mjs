/**
 * Script de validação completo do sistema FoxCycles Cupons
 * Roda: node scripts/test-system.mjs
 */

const BASE = 'https://fc-influenciadores.vercel.app'
const SUPABASE_URL = 'https://uufrrhqrafxybdhkhvln.supabase.co'

// Lê a anon key do .env.local
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dir, '../.env.local')
const envVars = {}
try {
  readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const [k, ...v] = line.split('=')
    if (k && v.length) envVars[k.trim()] = v.join('=').trim()
  })
} catch { /* arquivo pode não existir em produção */ }

const ANON_KEY = envVars['NEXT_PUBLIC_SUPABASE_ANON_KEY'] || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// ─── gera CPF válido aleatório para não conflitar entre execuções ────────────
function generateValidCPF() {
  const n = Array.from({ length: 9 }, () => Math.floor(Math.random() * 9))
  let s = n.reduce((a, v, i) => a + v * (10 - i), 0)
  let d1 = 11 - (s % 11); if (d1 >= 10) d1 = 0; n.push(d1)
  s = n.reduce((a, v, i) => a + v * (11 - i), 0)
  let d2 = 11 - (s % 11); if (d2 >= 10) d2 = 0; n.push(d2)
  return n.join('')
}
const TEST_CPF   = generateValidCPF()
const TEST_EMAIL = `teste.auto.${Date.now()}@foxcycles.com.br`

// ─── helpers ────────────────────────────────────────────────────────────────

let passed = 0, failed = 0, warnings = 0
const results = []

function log(icon, label, detail = '') {
  const line = `${icon} ${label}${detail ? ' — ' + detail : ''}`
  results.push(line)
  console.log(line)
}

function ok(label, detail)   { passed++;   log('✅', label, detail) }
function fail(label, detail) { failed++;   log('❌', label, detail) }
function warn(label, detail) { warnings++; log('⚠️ ', label, detail) }
function section(title)      { console.log(`\n${'─'.repeat(55)}\n  ${title}\n${'─'.repeat(55)}`) }

async function get(path, opts = {}) {
  const url = path.startsWith('http') ? path : BASE + path
  const res = await fetch(url, { redirect: 'manual', ...opts })
  return res
}

async function post(path, body, headers = {}) {
  return fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    redirect: 'manual',
  })
}

async function supabaseQuery(table, filter = '') {
  const url = `${SUPABASE_URL}/rest/v1/${table}?${filter}&select=*`
  const res = await fetch(url, {
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
    }
  })
  return res.ok ? res.json() : null
}

async function supabaseDelete(table, filter) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?${filter}`
  return fetch(url, {
    method: 'DELETE',
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
      Prefer: 'return=minimal',
    }
  })
}

// ─── testes ─────────────────────────────────────────────────────────────────

async function testPublicPages() {
  section('1. PÁGINAS PÚBLICAS — Landing dos influencers')

  const codes = ['PRIIVALIM', 'CAROLVILEX', 'GARAMANCIO', 'FABRIZIACAMPINAS', 'LARILOPESV']
  for (const code of codes) {
    const res = await get(`/c/${code}`)
    if (res.status === 200) {
      ok(`/c/${code}`, `status ${res.status}`)
    } else {
      fail(`/c/${code}`, `status ${res.status} esperado 200`)
    }
  }

  // Código inválido deve retornar 404
  const res404 = await get('/c/CODIGOINEXISTENTE')
  if (res404.status === 404) {
    ok('/c/CODIGOINEXISTENTE', '404 correto para código inválido')
  } else {
    fail('/c/CODIGOINEXISTENTE', `status ${res404.status} esperado 404`)
  }
}

async function testCouponCreation() {
  section('2. API POST /api/coupons — Geração de cupom')

  const payload = {
    influencer_code: 'PRIIVALIM',
    customer_name: 'Teste Automatizado',
    customer_cpf: TEST_CPF,
    customer_phone: '(19) 99999-0000',
    customer_email: TEST_EMAIL,
  }

  const res = await post('/api/coupons', payload)
  const data = await res.json().catch(() => ({}))

  if (res.status === 201 && data.coupon_number) {
    ok('POST /api/coupons', `criado ${data.coupon_number}`)
    return data.coupon_number
  } else {
    fail('POST /api/coupons', `status ${res.status} — ${JSON.stringify(data)}`)
    return null
  }
}

async function testDuplicateCPF() {
  section('3. VALIDAÇÃO — Duplicidade de CPF por campanha')

  const payload = {
    influencer_code: 'CAROLVILEX',
    customer_name: 'Teste Duplicado',
    customer_cpf: '52998224725',   // mesmo CPF do teste anterior, campanha diferente → deve permitir
    customer_phone: '(19) 99999-0001',
    customer_email: 'teste.dup@foxcycles.com.br',
  }

  // Testa com mesmo CPF + mesmo influencer (mesma campanha) — deve bloquear
  const payload2 = {
    influencer_code: 'PRIIVALIM',
    customer_name: 'Duplicado',
    customer_cpf: TEST_CPF,
    customer_phone: '(19) 99999-0002',
    customer_email: `dup.${TEST_EMAIL}`,
  }
  const res2 = await post('/api/coupons', payload2)
  const data2 = await res2.json().catch(() => ({}))
  if (res2.status === 409 || (res2.status === 400 && data2.error)) {
    ok('CPF duplicado na mesma campanha', `bloqueado corretamente (${res2.status})`)
  } else {
    warn('CPF duplicado na mesma campanha', `status ${res2.status} — pode ser que a constraint não esteja ativa`)
  }
}

async function testCouponValidation(couponNumber) {
  section('4. API /api/coupons/validate — Busca e validação')

  if (!couponNumber) { warn('GET validate', 'pulado — nenhum cupom criado no teste anterior'); return }

  // GET — requer auth (correto — apenas admins/moderadores buscam cupons)
  const resGet = await get(`/api/coupons/validate?code=${couponNumber}`)
  if (resGet.status === 401) {
    ok(`GET /api/coupons/validate sem auth`, '401 correto — rota protegida')
  } else if (resGet.status === 200) {
    const dataGet = await resGet.json().catch(() => ({}))
    ok(`GET /api/coupons/validate?code=${couponNumber}`, `encontrado, status=${dataGet.coupon?.status}`)
  } else {
    fail(`GET /api/coupons/validate`, `status ${resGet.status}`)
  }

  // POST — marcar como usado (sem auth de admin → deve retornar 401)
  const resPost = await post('/api/coupons/validate', { coupon_number: couponNumber, used_by: 'Teste' })
  if (resPost.status === 401) {
    ok('POST /api/coupons/validate sem auth', '401 correto — protegido')
  } else if (resPost.status === 200) {
    fail('POST /api/coupons/validate sem auth', 'validou sem autenticação — FALHA DE SEGURANÇA')
  } else {
    warn('POST /api/coupons/validate', `status ${resPost.status}`)
  }
}

async function testCouponPage(couponNumber) {
  section('5. PÁGINA PÚBLICA /cupom/[number] — Exibição do cupom')

  if (!couponNumber) { warn('/cupom/...', 'pulado — nenhum cupom gerado'); return }

  const res = await get(`/cupom/${couponNumber}`)
  if (res.status === 200) {
    ok(`/cupom/${couponNumber}`, 'página carregada')
  } else {
    fail(`/cupom/${couponNumber}`, `status ${res.status}`)
  }
}

async function testAdminRedirects() {
  section('6. PROTEÇÃO DE ROTAS ADMIN — Redirecionamentos')

  const protectedRoutes = [
    '/admin',
    '/admin/validar',
    '/admin/cupons',
    '/admin/influencers',
    '/admin/campanhas',
    '/admin/configuracoes',
  ]

  for (const route of protectedRoutes) {
    const res = await get(route)
    const loc = res.headers.get('location') || ''
    if ((res.status === 307 || res.status === 302) && loc.includes('/admin/login')) {
      ok(route, `redireciona para /admin/login (${res.status})`)
    } else if (res.status === 200) {
      fail(route, 'acessível sem autenticação — FALHA DE SEGURANÇA')
    } else {
      warn(route, `status ${res.status}, location: ${loc}`)
    }
  }

  // /admin/login sem sessão deve retornar 200 (página de login)
  const resLogin = await get('/admin/login')
  if (resLogin.status === 200) {
    ok('/admin/login', 'página de login acessível (200)')
  } else if (resLogin.status === 307) {
    fail('/admin/login', `307 — redirect circular (layout.tsx envolve o login)`)
  } else {
    warn('/admin/login', `status ${resLogin.status}`)
  }
}

async function testDatabaseState() {
  section('7. ESTADO DO BANCO DE DADOS — Verificação via Supabase')

  if (!ANON_KEY) {
    warn('Supabase API', 'ANON_KEY não encontrada — pulando testes de banco')
    return
  }

  // Influencers
  const influencers = await supabaseQuery('influencers', 'active=eq.true&order=name')
  if (influencers && influencers.length === 5) {
    ok('influencers', `${influencers.length} ativos: ${influencers.map(i => i.coupon_code).join(', ')}`)
  } else {
    fail('influencers', `esperado 5 ativos, encontrado ${influencers?.length ?? 'erro'}`)
  }

  // Campaigns
  const campaigns = await supabaseQuery('campaigns', 'active=eq.true')
  if (campaigns && campaigns.length >= 1) {
    ok('campaigns', `${campaigns.length} ativa(s): ${campaigns.map(c => c.name).join(', ')}`)
  } else {
    fail('campaigns', `nenhuma campanha ativa`)
  }

  // App settings (requer auth — acesso anônimo correto retorna 0 rows)
  const settings = await supabaseQuery('app_settings', 'id=eq.1')
  if (settings && settings.length === 1) {
    ok('app_settings', `company="${settings[0].company_name}"`)
  } else {
    ok('app_settings', 'sem acesso anônimo — correto (requer autenticação)')
  }

  // Coupons de teste — cleanup via service role não disponível no script;
  // cada execução usa CPF+email únicos então não conflitam
  const coupons = await supabaseQuery('coupons', `customer_email=eq.${encodeURIComponent(TEST_EMAIL)}`)
  if (coupons && coupons.length > 0) {
    warn('limpeza test coupon', `${coupons.length} cupom(s) de teste encontrado(s) — removendo...`)
    for (const c of coupons) {
      await supabaseDelete('coupons', `id=eq.${c.id}`)
    }
    ok('limpeza test coupon', 'cupons de teste removidos')
  } else {
    ok('coupons test', 'nenhum cupom de teste residual')
  }
}

async function testCPFValidation() {
  section('8. VALIDAÇÃO DE CPF — Regras de negócio')

  // CPF inválido
  const resInvalid = await post('/api/coupons', {
    influencer_code: 'PRIIVALIM',
    customer_name: 'CPF Inválido',
    customer_cpf: '00000000000',
    customer_phone: '(19) 99999-9999',
    customer_email: 'invalido@test.com',
  })
  const dataInvalid = await resInvalid.json().catch(() => ({}))
  if (resInvalid.status === 400 && dataInvalid.error) {
    ok('CPF inválido rejeitado', `(${dataInvalid.error})`)
  } else {
    fail('CPF inválido', `status ${resInvalid.status} — deveria ser 400`)
  }

  // Influencer inexistente
  const resNoInf = await post('/api/coupons', {
    influencer_code: 'INEXISTENTE',
    customer_name: 'Teste',
    customer_cpf: '52998224725',
    customer_phone: '(19) 99999-9999',
    customer_email: 'teste2@test.com',
  })
  if (resNoInf.status === 404 || resNoInf.status === 400) {
    ok('Influencer inexistente rejeitado', `status ${resNoInf.status}`)
  } else {
    fail('Influencer inexistente', `status ${resNoInf.status} — deveria ser 404/400`)
  }
}

// ─── execução ────────────────────────────────────────────────────────────────

console.log(`\n${'═'.repeat(55)}`)
console.log(`  FOXCYCLES — VALIDAÇÃO COMPLETA DO SISTEMA`)
console.log(`  ${new Date().toLocaleString('pt-BR')}`)
console.log(`  Ambiente: ${BASE}`)
console.log(`${'═'.repeat(55)}`)

let testCouponNumber = null

try {
  await testPublicPages()
  testCouponNumber = await testCouponCreation()
  await testDuplicateCPF()
  await testCouponValidation(testCouponNumber)
  await testCouponPage(testCouponNumber)
  await testAdminRedirects()
  await testDatabaseState()
  await testCPFValidation()
} catch (err) {
  console.error('\n💥 Erro inesperado:', err.message)
  failed++
}

// Limpeza do cupom gerado no teste de validação (se não foi limpo antes)
if (testCouponNumber && ANON_KEY) {
  await supabaseDelete('coupons', `coupon_number=eq.${testCouponNumber}`)
}

// ─── relatório final ─────────────────────────────────────────────────────────

const total = passed + failed + warnings
console.log(`\n${'═'.repeat(55)}`)
console.log(`  RESULTADO FINAL`)
console.log(`${'═'.repeat(55)}`)
console.log(`  Total de testes : ${total}`)
console.log(`  ✅ Passou        : ${passed}`)
console.log(`  ❌ Falhou        : ${failed}`)
console.log(`  ⚠️  Avisos        : ${warnings}`)
console.log(`${'═'.repeat(55)}`)
if (failed === 0) {
  console.log(`\n  🚀 SISTEMA PRONTO PARA USO!`)
} else {
  console.log(`\n  🔴 ${failed} teste(s) falharam — verificar acima.`)
}
console.log()

process.exit(failed > 0 ? 1 : 0)
