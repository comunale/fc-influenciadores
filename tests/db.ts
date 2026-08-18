import { Client } from 'pg'
import { readFileSync } from 'fs'
import { resolve } from 'path'

/**
 * Infra dos testes de banco.
 *
 * Cada teste roda dentro de BEGIN ... ROLLBACK, então NADA que ele faça
 * sobrevive — nem se o teste falhar no meio. É o que torna seguro apontar
 * para o banco de produção, que é onde as regras de verdade estão.
 *
 * A sessão de cada papel é simulada como o PostgREST faz: `set local role
 * authenticated` mais o claim `sub` do JWT. Não é preciso senha de ninguém.
 */

function lerEnv(chave: string): string | undefined {
  if (process.env[chave]) return process.env[chave]
  try {
    const txt = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
    for (const linha of txt.split('\n')) {
      const [k, ...v] = linha.split('=')
      if (k?.trim() === chave) return v.join('=').trim()
    }
  } catch {
    /* .env.local pode não existir */
  }
  return undefined
}

export const DB_URL = lerEnv('SUPABASE_DB_URL')

/** Os testes de banco são pulados quando a string de conexão não está configurada. */
export const temBanco = Boolean(DB_URL)

export async function conectar(): Promise<Client> {
  if (!DB_URL) throw new Error('SUPABASE_DB_URL não configurada')
  const client = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } })
  await client.connect()
  return client
}

/** Busca o id do primeiro usuário ativo de um papel. */
export async function idDoPapel(client: Client, papel: string): Promise<string> {
  const { rows } = await client.query(
    'select id from public.admin_profiles where role = $1 and active limit 1',
    [papel]
  )
  if (!rows[0]) throw new Error(`Nenhum usuário ativo com papel "${papel}" no banco`)
  return rows[0].id
}

/** Assume a sessão de um usuário dentro da transação corrente. */
export async function virar(client: Client, userId: string) {
  await client.query("set local role authenticated")
  await client.query(`set local request.jwt.claims = '${JSON.stringify({ sub: userId, role: 'authenticated' })}'`)
}

/** Volta para o papel dono da conexão (necessário para criar massa de teste). */
export async function virarDono(client: Client) {
  await client.query('set local role none')
}

/**
 * Cria um cupom descartável e devolve o id. Só faz sentido dentro de uma
 * transação que vai sofrer rollback.
 */
export async function criarCupom(
  client: Client,
  opts: { status?: string; verified?: boolean; invoiceNumber?: string; sellerId?: string | null } = {}
): Promise<string> {
  const { status = 'pending', verified = false, invoiceNumber = null, sellerId = null } = opts
  const sufixo = Math.floor(Math.random() * 900000 + 100000)
  const { rows } = await client.query(
    `insert into public.coupons
       (coupon_number, influencer_id, campaign_id, customer_name, customer_cpf,
        customer_phone, customer_email, status, expires_at, used_at, verified,
        invoice_number, seller_id)
     select $1, i.id, i.campaign_id, 'Cliente de Teste', $2, '19999999999',
            'teste@exemplo.com', $3, now() + interval '30 days',
            case when $3 = 'used' then now() else null end, $4, $5, $6
     from public.influencers i limit 1
     returning id`,
    [`FOX-T${sufixo}`, String(sufixo).padStart(11, '0'), status, verified, invoiceNumber, sellerId]
  )
  return rows[0].id
}

/** Um vendedor ativo da mesma loja do lojista informado. */
export async function vendedorDaLojaDo(client: Client, lojistaId: string): Promise<string> {
  const { rows } = await client.query(
    `select s.id from public.sellers s
      join public.admin_profiles p on p.store_name = s.store_name
     where p.id = $1 and s.active limit 1`,
    [lojistaId]
  )
  if (!rows[0]) throw new Error('Nenhum vendedor ativo na loja deste lojista')
  return rows[0].id
}

/** Um vendedor ativo de QUALQUER outra loja. */
export async function vendedorDeOutraLoja(client: Client, lojistaId: string): Promise<string> {
  const { rows } = await client.query(
    `select s.id from public.sellers s
     where s.active and s.store_name is distinct from
       (select store_name from public.admin_profiles where id = $1)
     limit 1`,
    [lojistaId]
  )
  if (!rows[0]) throw new Error('Nenhum vendedor ativo em outra loja')
  return rows[0].id
}

/** Espera que a operação seja recusada, e que a mensagem case com o padrão. */
export async function deveFalhar(fn: () => Promise<unknown>, padrao: RegExp): Promise<void> {
  let erro: Error | null = null
  try {
    await fn()
  } catch (e) {
    erro = e as Error
  }
  if (!erro) throw new Error(`Esperava recusa (${padrao}), mas a operação foi permitida`)
  if (!padrao.test(erro.message)) {
    throw new Error(`Recusou, mas com outra mensagem.\n  esperado: ${padrao}\n  recebido: ${erro.message}`)
  }
}
