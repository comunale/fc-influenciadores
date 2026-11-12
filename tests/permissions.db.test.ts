import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import type { Client } from 'pg'
import {
  temBanco, conectar, idDoPapel, virar, virarDono, criarCupom,
  vendedorDaLojaDo, vendedorDeOutraLoja, deveFalhar,
} from './db'

/**
 * Regras de permissão como o banco as aplica de verdade (RLS, gatilhos e
 * constraints). É a camada que vale mesmo quando alguém ignora a tela e a API.
 *
 * Cada teste roda em transação com ROLLBACK: nada sobrevive.
 */

const d = temBanco ? describe : describe.skip

d('permissoes no banco', () => {
  let client: Client
  let admin: string
  let finance: string
  let lojista: string

  beforeAll(async () => {
    client = await conectar()
    admin = await idDoPapel(client, 'admin')
    finance = await idDoPapel(client, 'finance')
    lojista = await idDoPapel(client, 'moderator')
  })

  afterAll(async () => { await client?.end() })

  beforeEach(async () => { await client.query('begin') })
  afterEach(async () => { await client.query('rollback') })

  // ── LOJISTA ────────────────────────────────────────────────────────────────

  describe('lojista', () => {
    it('valida cupom no balcao com vendedor da propria loja', async () => {
      const vendedor = await vendedorDaLojaDo(client, lojista)
      const cupom = await criarCupom(client)
      await virar(client, lojista)

      const { rowCount } = await client.query(
        `update public.coupons set status='used', used_at=now(),
                used_by_admin='Loja', seller_id=$2 where id=$1`,
        [cupom, vendedor]
      )
      expect(rowCount).toBe(1)
    })

    it('nao valida sem escolher vendedor', async () => {
      const cupom = await criarCupom(client)
      await virar(client, lojista)

      await deveFalhar(
        () => client.query(`update public.coupons set status='used', used_at=now() where id=$1`, [cupom]),
        /Escolha o vendedor/i
      )
    })

    it('nao usa vendedor de outra loja', async () => {
      const intruso = await vendedorDeOutraLoja(client, lojista)
      const cupom = await criarCupom(client)
      await virar(client, lojista)

      await deveFalhar(
        () => client.query(
          `update public.coupons set status='used', used_at=now(), seller_id=$2 where id=$1`,
          [cupom, intruso]
        ),
        /Vendedor invalido/i
      )
    })

    it('nao marca conferido', async () => {
      const cupom = await criarCupom(client, { status: 'used' })
      await virar(client, lojista)

      await deveFalhar(
        () => client.query(`update public.coupons set verified=true, invoice_number='NF-1' where id=$1`, [cupom]),
        /Apenas administradores/i
      )
    })

    it('nao marca pago', async () => {
      const cupom = await criarCupom(client, { status: 'used', verified: true, invoiceNumber: 'NF-1' })
      await virar(client, lojista)

      await deveFalhar(
        () => client.query(`update public.coupons set paid=true where id=$1`, [cupom]),
        /Apenas administradores/i
      )
    })

    it('nao altera dados do cliente', async () => {
      const cupom = await criarCupom(client)
      await virar(client, lojista)

      await deveFalhar(
        () => client.query(`update public.coupons set customer_name='Outro Nome' where id=$1`, [cupom]),
        /Apenas administradores/i
      )
    })

    it('nao exclui cupom', async () => {
      const cupom = await criarCupom(client)
      await virar(client, lojista)

      const { rowCount } = await client.query('delete from public.coupons where id=$1', [cupom])
      expect(rowCount).toBe(0) // a RLS simplesmente nao enxerga a linha para apagar
    })
  })

  // ── FINANCEIRO ─────────────────────────────────────────────────────────────

  describe('financeiro', () => {
    it('preenche NF e confere; marcar pago cupom a cupom fica por conta da tela do Financeiro, nao do banco', async () => {
      // O banco AINDA aceita o financeiro marcar "Pago" num cupom fora de
      // lancamento (so o admin tem o campo na API; ver FIELDS_BY_ROLE). O que o
      // banco recusa e DESMARCAR cupom de lancamento pago (migration 035).
      const cupom = await criarCupom(client, { status: 'used' })
      await virar(client, finance)

      const { rowCount } = await client.query(
        `update public.coupons
            set invoice_number='NF-12345', verified=true, verified_at=now(), verified_by='Financeiro',
                paid=true, paid_at=now(), paid_by='Financeiro'
          where id=$1`,
        [cupom]
      )
      expect(rowCount).toBe(1)
    })

    it('nao desmarca pago de cupom que esta em lancamento pago (035)', async () => {
      const cupom = await criarCupom(client, { status: 'used', verified: true, invoiceNumber: 'NF-1' })
      await client.query(
        `with p as (select id from public.partnerships limit 1),
              c as (update public.coupons set partnership_id = (select id from p) where id = $1 returning id),
              s as (insert into public.settlements(partnership_id, tipo, status, periodo_de, periodo_ate, valor)
                    select id, 'comissao', 'aberto', date '2026-10-01', date '2026-10-31', 10 from p returning id)
         insert into public.settlement_items(settlement_id, coupon_id, valor)
         select s.id, c.id, 10 from s, c`,
        [cupom]
      )
      await client.query(`update public.coupons set paid=true, paid_at=now(), paid_by='x' where id=$1`, [cupom])
      await client.query(
        `update public.settlements set status='pago', paid_at=now(), forma='PIX'
          where id = (select settlement_id from public.settlement_items where coupon_id=$1)`,
        [cupom]
      )
      await virar(client, finance)

      await deveFalhar(
        () => client.query(`update public.coupons set paid=false, paid_at=null, paid_by=null where id=$1`, [cupom]),
        /lancamento pago nao pode ser desmarcado/i
      )

      // O admin mantem o poder (decisao do dono).
      await virarDono(client)
      await virar(client, admin)
      const { rowCount } = await client.query(
        `update public.coupons set paid=false, paid_at=null, paid_by=null where id=$1`, [cupom]
      )
      expect(rowCount).toBe(1)
    })

    it('nao altera dados do cliente', async () => {
      const cupom = await criarCupom(client, { status: 'used' })
      await virar(client, finance)

      await deveFalhar(
        () => client.query(
          `update public.coupons set verified=true, invoice_number='NF-1', customer_name='Trocado' where id=$1`,
          [cupom]
        ),
        /Financeiro so pode/i
      )
    })

    it('nao muda o status do cupom', async () => {
      const cupom = await criarCupom(client, { status: 'used' })
      await virar(client, finance)

      await deveFalhar(
        () => client.query(`update public.coupons set status='pending' where id=$1`, [cupom]),
        /Financeiro so pode/i
      )
    })

    it('nao troca o vendedor', async () => {
      const outro = await vendedorDeOutraLoja(client, lojista)
      const cupom = await criarCupom(client, { status: 'used' })
      await virar(client, finance)

      await deveFalhar(
        () => client.query(`update public.coupons set seller_id=$2 where id=$1`, [cupom, outro]),
        /Financeiro so pode/i
      )
    })

    it('nao exclui cupom', async () => {
      const cupom = await criarCupom(client, { status: 'used' })
      await virar(client, finance)

      const { rowCount } = await client.query('delete from public.coupons where id=$1', [cupom])
      expect(rowCount).toBe(0)
    })
  })

  // ── ADMIN ──────────────────────────────────────────────────────────────────

  describe('admin', () => {
    it('altera dados do cliente, confere e paga na mesma tacada', async () => {
      const cupom = await criarCupom(client, { status: 'used' })
      await virar(client, admin)

      const { rowCount } = await client.query(
        `update public.coupons
            set customer_name='Nome Editado', invoice_number='NF-777',
                verified=true, paid=true
          where id=$1`,
        [cupom]
      )
      expect(rowCount).toBe(1)
    })

    it('exclui cupom', async () => {
      const cupom = await criarCupom(client)
      await virar(client, admin)

      const { rowCount } = await client.query('delete from public.coupons where id=$1', [cupom])
      expect(rowCount).toBe(1)
    })
  })

  // ── A CORRENTE: NF -> CONFERIDO -> PAGO ────────────────────────────────────

  describe('corrente NF -> conferido -> pago', () => {
    it('nao confere sem NF, nem sendo admin', async () => {
      // Nota fiscal e a trava mais forte do sistema: documento fiscal nao se
      // inventa. Sem NF nao ha prova da venda.
      const cupom = await criarCupom(client, { status: 'used' })
      await virar(client, admin)

      await deveFalhar(
        () => client.query(`update public.coupons set verified=true where id=$1`, [cupom]),
        /coupons_verified_requires_invoice/i
      )
    })

    it('confere quando a NF esta preenchida', async () => {
      const cupom = await criarCupom(client, { status: 'used' })
      await virar(client, admin)

      const { rowCount } = await client.query(
        `update public.coupons set invoice_number='NF-999', verified=true where id=$1`,
        [cupom]
      )
      expect(rowCount).toBe(1)
    })

    it('NF em branco nao vale como NF', async () => {
      const cupom = await criarCupom(client, { status: 'used' })
      await virar(client, admin)

      await deveFalhar(
        () => client.query(`update public.coupons set invoice_number='   ', verified=true where id=$1`, [cupom]),
        /coupons_verified_requires_invoice/i
      )
    })

    it('nao marca pago sem ter conferido', async () => {
      // Dinheiro so sai depois da conferencia.
      const cupom = await criarCupom(client, { status: 'used' })
      await virar(client, admin)

      await deveFalhar(
        () => client.query(`update public.coupons set paid=true where id=$1`, [cupom]),
        /coupons_paid_requires_verified/i
      )
    })
  })

  // ── O CUPOM PUBLICO CONTINUA FUNCIONANDO ───────────────────────────────────

  describe('nao quebramos o fluxo publico', () => {
    it('cupom nasce nao conferido e nao pago', async () => {
      await virarDono(client)
      const cupom = await criarCupom(client)
      const { rows } = await client.query(
        'select verified, paid, invoice_number from public.coupons where id=$1',
        [cupom]
      )
      expect(rows[0]).toMatchObject({ verified: false, paid: false, invoice_number: null })
    })
  })
})
