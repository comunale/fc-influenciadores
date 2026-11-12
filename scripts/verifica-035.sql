-- Verificação da migration 035 — financeiro não desmarca "Pago" de cupom que
-- está em lançamento pago (coupons_guard_non_admin_update).
--
-- Rodar no SQL Editor do Supabase, "Run without RLS" (ver verifica-031.sql: o
-- aviso de tabela sem RLS é falso positivo, `r` é temporária). NÃO altera
-- nada: tudo acontece dentro de begin/rollback.
--
-- Mesmas lições do verifica-031/033/034: cada caso confere SQLSTATE e o MOTIVO
-- (pg_temp.tenta), e cada caso usa a sua PRÓPRIA parceria, o seu PRÓPRIO
-- lançamento e os seus PRÓPRIOS cupons (clones de linhas reais; a parceria
-- clonada tem fee_amount 0 para o gatilho da 033 não criar um fixo que
-- sujaria as contagens).
--
-- Sem a 031/033/034 aplicadas o script para no setup ("relation ... does not
-- exist" / função inexistente). Falha alta, não silenciosa.
--
-- RODAR ANTES de aplicar a 035 e DEPOIS dela. Antes, ficam VERMELHOS os casos
-- 1 (o financeiro consegue limpar "Pago": EXECUTOU) e 1.1 (o cupom ficou
-- não-pago), e o RESUMO, que acusa 2 não-OK: 3 linhas vermelhas no total, e é
-- o esperado. Todos os outros casos são o comportamento que NÃO pode mudar e
-- ficam verdes nas duas rodadas. Depois da 035, tudo OK.
--
-- Casos: 1 financeiro NÃO limpa "Pago" de cupom em lançamento pago; 2 financeiro
-- AINDA limpa "Pago" de cupom fora de qualquer lançamento; 3 financeiro AINDA
-- marca e desmarca "Pago" de cupom em lançamento aberto; 4 financeiro AINDA
-- confere e preenche NF, AINDA muda NF de cupom de lançamento pago, e AINDA é
-- barrado ao mexer em dado do cliente (mensagem da 003); 5 ADMIN limpa "Pago"
-- de cupom em lançamento pago (decisão do dono); 6 sem identidade
-- (service_role / SQL Editor) segue passando direto; 7 false -> true em cupom
-- de lançamento já 'pago' passa (é o que settlement_pagar faz por dentro);
-- 8 settlement_pagar chamado pelo financeiro segue funcionando de ponta a ponta.

begin;

create temp table r(ordem numeric, teste text, esperado text, obtido text, veredito text);
grant select, insert on r to authenticated, anon;

create temp table adm as
  select id from public.admin_profiles where role = 'admin' and active = true limit 1;
grant select on adm to authenticated;

do $$ begin
  if not exists (select 1 from adm) then
    raise exception 'fixture adm vazio: nao ha admin ativo no banco';
  end if;
  if not exists (select 1 from public.partnerships) then
    raise exception 'fixture partnerships vazio: nao ha parceria para clonar';
  end if;
  if not exists (select 1 from public.coupons) then
    raise exception 'fixture coupons vazio: nao ha cupom para clonar';
  end if;
end $$;

-- ---------- auxiliares (só existem durante a transação) ----------

create function pg_temp.mkp(p_id uuid) returns void language sql as $f$
  insert into public.partnerships
  select (jsonb_populate_record(null::public.partnerships,
           to_jsonb(b) || jsonb_build_object('id', p_id, 'status', 'encerrada', 'fee_amount', 0))).*
  from (select * from public.partnerships limit 1) b;
$f$;

create function pg_temp.mkc(n int, p_part uuid) returns void language sql as $f$
  insert into public.coupons
  select (jsonb_populate_record(null::public.coupons,
           to_jsonb(b) || jsonb_build_object(
             'id', ('00000000-0000-0000-0035-0000000001' || lpad(n::text, 2, '0'))::uuid,
             'coupon_number', 'T035-' || n,
             'customer_cpf', '9990035' || lpad(n::text, 4, '0'),
             'invoice_number', 'T035-NF-' || n,
             'status', 'used', 'verified', true, 'paid', false,
             'paid_at', null, 'paid_by', null,
             'used_at', now(), 'partnership_id', p_part))).*
  from (select * from public.coupons limit 1) b;
$f$;

create function pg_temp.mks(p_id uuid, p_part uuid, p_valor numeric) returns void language sql as $f$
  insert into public.settlements(id, partnership_id, tipo, status, periodo_de, periodo_ate, valor)
  values (p_id, p_part, 'comissao', 'aberto', date '2026-10-01', date '2026-10-31', p_valor);
$f$;

create function pg_temp.mki(p_set uuid, n int, p_valor numeric) returns void language sql as $f$
  insert into public.settlement_items(settlement_id, coupon_id, valor)
  values (p_set, ('00000000-0000-0000-0035-0000000001' || lpad(n::text, 2, '0'))::uuid, p_valor);
$f$;

create function pg_temp.tenta(o numeric, t text, esperado text, q text, cod text, quem text)
returns void language plpgsql as $f$
declare cn text; ms text; sq text;
begin
  begin
    execute q;
    insert into r values (o, t, esperado, 'EXECUTOU', 'FALHOU -- a trava nao barrou');
    return;
  exception when others then
    get stacked diagnostics cn = constraint_name;
    sq := sqlstate; ms := sqlerrm;
  end;
  insert into r values (o, t, esperado, sq || ' ' || coalesce(nullif(cn, ''), left(ms, 70)),
    case when sq = cod and (quem is null or quem = cn or ms like '%' || quem || '%')
         then 'OK' else 'CONFERIR -- barrou por outro motivo' end);
end $f$;

create function pg_temp.nao_levanta(o numeric, t text, q text) returns void language plpgsql as $f$
begin
  execute q;
  insert into r values (o, t, 'nao levanta excecao', 'nao levantou', 'OK');
exception when others then
  insert into r values (o, t, 'nao levanta excecao', sqlstate || ' ' || left(sqlerrm, 70),
    'FALHOU -- a chamada que deveria funcionar foi barrada');
end $f$;

create function pg_temp.confere(o numeric, t text, q text, esperado text) returns void language plpgsql as $f$
declare v text;
begin
  execute q into v;
  insert into r values (o, t, esperado, coalesce(v, 'null'),
    case when v = esperado then 'OK' else 'FALHOU' end);
exception when others then
  insert into r values (o, t, esperado, sqlstate || ' ' || left(sqlerrm, 70), 'FALHOU -- erro ao consultar');
end $f$;

-- ---------- fixtures (como superusuário, auth.uid() nulo) ----------
-- Parceria a0N = caso N. Cupons:
--   11 pago em lancamento 'pago'      (caso 1)
--   21 pago, fora de lancamento       (caso 2)
--   31 nao pago, em lancamento aberto (caso 3)
--   41 pago em lancamento 'pago'      (caso 4, mexer na NF)
--   51 nao conferido, sem lancamento  (caso 4, conferir)
--   61 pago em lancamento 'pago'      (caso 5, admin)
--   71 pago em lancamento 'pago'      (caso 6, sem identidade)
--   81 NAO pago em lancamento 'pago'  (caso 7, o estado no meio de settlement_pagar)
--   91 nao pago em lancamento aberto  (caso 8, settlement_pagar de verdade)

select pg_temp.mkp(('00000000-0000-0000-0035-000000000a0' || g)::uuid) from generate_series(1, 9) g;

select pg_temp.mkc(11, '00000000-0000-0000-0035-000000000a01');
select pg_temp.mkc(21, '00000000-0000-0000-0035-000000000a02');
select pg_temp.mkc(31, '00000000-0000-0000-0035-000000000a03');
select pg_temp.mkc(41, '00000000-0000-0000-0035-000000000a04');
select pg_temp.mkc(51, '00000000-0000-0000-0035-000000000a04');
select pg_temp.mkc(61, '00000000-0000-0000-0035-000000000a05');
select pg_temp.mkc(71, '00000000-0000-0000-0035-000000000a06');
select pg_temp.mkc(81, '00000000-0000-0000-0035-000000000a07');
select pg_temp.mkc(91, '00000000-0000-0000-0035-000000000a08');

select pg_temp.mks('00000000-0000-0000-0035-000000000b01', '00000000-0000-0000-0035-000000000a01', 10);
select pg_temp.mks('00000000-0000-0000-0035-000000000b03', '00000000-0000-0000-0035-000000000a03', 10);
select pg_temp.mks('00000000-0000-0000-0035-000000000b04', '00000000-0000-0000-0035-000000000a04', 10);
select pg_temp.mks('00000000-0000-0000-0035-000000000b05', '00000000-0000-0000-0035-000000000a05', 10);
select pg_temp.mks('00000000-0000-0000-0035-000000000b06', '00000000-0000-0000-0035-000000000a06', 10);
select pg_temp.mks('00000000-0000-0000-0035-000000000b07', '00000000-0000-0000-0035-000000000a07', 10);
select pg_temp.mks('00000000-0000-0000-0035-000000000b08', '00000000-0000-0000-0035-000000000a08', 10);

select pg_temp.mki('00000000-0000-0000-0035-000000000b01', 11, 10);
select pg_temp.mki('00000000-0000-0000-0035-000000000b03', 31, 10);
select pg_temp.mki('00000000-0000-0000-0035-000000000b04', 41, 10);
select pg_temp.mki('00000000-0000-0000-0035-000000000b05', 61, 10);
select pg_temp.mki('00000000-0000-0000-0035-000000000b06', 71, 10);
select pg_temp.mki('00000000-0000-0000-0035-000000000b07', 81, 10);
select pg_temp.mki('00000000-0000-0000-0035-000000000b08', 91, 10);

-- Cupons pagos (exceto 81 e 91), depois os lançamentos viram 'pago' (exceto 03 e 08).
update public.coupons set paid = true, paid_at = now(), paid_by = 'fixture'
 where id in (select ('00000000-0000-0000-0035-0000000001' || lpad(n::text, 2, '0'))::uuid
                from unnest(array[11, 21, 41, 61, 71]) n);
update public.settlements set status = 'pago', paid_at = now(), forma = 'PIX'
 where id in ('00000000-0000-0000-0035-000000000b01', '00000000-0000-0000-0035-000000000b04',
              '00000000-0000-0000-0035-000000000b05', '00000000-0000-0000-0035-000000000b06',
              '00000000-0000-0000-0035-000000000b07');
update public.coupons set verified = false
 where id = '00000000-0000-0000-0035-000000000151';

-- Guardas de fixture: sem elas um setup que não montou nada passaria em silêncio.
do $$ begin
  if (select count(*) from public.settlement_items
       where settlement_id::text like '00000000-0000-0000-0035-000000000b0%') <> 7 then
    raise exception 'fixture: esperava 7 itens de lancamento';
  end if;
  if (select count(*) from public.settlements
       where id::text like '00000000-0000-0000-0035-000000000b0%' and status = 'pago') <> 5 then
    raise exception 'fixture: esperava 5 lancamentos pagos';
  end if;
  if (select count(*) from public.coupons
       where coupon_number like 'T035-%' and paid) <> 5 then
    raise exception 'fixture: esperava 5 cupons pagos';
  end if;
end $$;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values
 ('00000000-0000-0000-0035-0000000000e3','00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','teste-035-financeiro@exemplo.invalido','x', now(), now(), now());

insert into public.admin_profiles(id, name, email, role, active, influencer_id) values
 ('00000000-0000-0000-0035-0000000000e3','teste financeiro','teste-035-financeiro@exemplo.invalido','finance',true,null);

-- ===== 6: SEM identidade (service_role / SQL Editor) segue passando direto =====
-- Ainda somos superusuário e sem claims: auth.uid() é nulo.
select pg_temp.nao_levanta(6, 'sem identidade limpa Pago de cupom de lancamento pago',
  $q$update public.coupons set paid = false, paid_at = null, paid_by = null
      where id = '00000000-0000-0000-0035-000000000171'$q$);
select pg_temp.confere(6.1, 'o cupom ficou nao pago',
  $q$select paid::text from public.coupons where id = '00000000-0000-0000-0035-000000000171'$q$, 'false');

-- ===== daqui em diante: financeiro =====
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0035-0000000000e3","role":"authenticated"}', true);

-- 1: a trava nova.
select pg_temp.tenta(1, 'financeiro limpa Pago de cupom em lancamento pago',
  'P0001 nao pode ser desmarcado',
  $q$update public.coupons set paid = false, paid_at = null, paid_by = null
      where id = '00000000-0000-0000-0035-000000000111'$q$,
  'P0001', 'nao pode ser desmarcado');
select pg_temp.confere(1.1, 'o cupom segue pago',
  $q$select paid::text from public.coupons where id = '00000000-0000-0000-0035-000000000111'$q$, 'true');

-- 2: fora de qualquer lançamento, o comportamento de antes.
select pg_temp.nao_levanta(2, 'financeiro limpa Pago de cupom fora de lancamento',
  $q$update public.coupons set paid = false, paid_at = null, paid_by = null
      where id = '00000000-0000-0000-0035-000000000121'$q$);
select pg_temp.confere(2.1, 'o cupom ficou nao pago',
  $q$select paid::text from public.coupons where id = '00000000-0000-0000-0035-000000000121'$q$, 'false');

-- 3: lançamento aberto não congela nada.
select pg_temp.nao_levanta(3, 'financeiro marca Pago em cupom de lancamento aberto',
  $q$update public.coupons set paid = true, paid_at = now(), paid_by = 'Financeiro'
      where id = '00000000-0000-0000-0035-000000000131'$q$);
select pg_temp.nao_levanta(3.1, 'financeiro desmarca Pago em cupom de lancamento aberto',
  $q$update public.coupons set paid = false, paid_at = null, paid_by = null
      where id = '00000000-0000-0000-0035-000000000131'$q$);

-- 4: conferência e NF como antes; dado do cliente segue barrado com a mensagem da 003.
select pg_temp.nao_levanta(4, 'financeiro confere e preenche NF',
  $q$update public.coupons set verified = true, invoice_number = 'NF-35', verified_at = now(), verified_by = 'Financeiro'
      where id = '00000000-0000-0000-0035-000000000151'$q$);
select pg_temp.confere(4.1, 'cupom conferido com a NF',
  $q$select verified::text || '|' || invoice_number from public.coupons
      where id = '00000000-0000-0000-0035-000000000151'$q$, 'true|NF-35');
select pg_temp.tenta(4.2, 'financeiro mexe em dado do cliente', 'P0001 Financeiro so pode',
  $q$update public.coupons set customer_name = 'Trocado' where id = '00000000-0000-0000-0035-000000000151'$q$,
  'P0001', 'Financeiro so pode');
select pg_temp.nao_levanta(4.3, 'financeiro muda a NF de cupom de lancamento pago',
  $q$update public.coupons set invoice_number = 'NF-corrigida' where id = '00000000-0000-0000-0035-000000000141'$q$);

-- 7: false -> true em cupom de lançamento 'pago' (o meio de settlement_pagar).
select pg_temp.nao_levanta(7, 'financeiro marca Pago (false -> true) em cupom de lancamento pago',
  $q$update public.coupons set paid = true, paid_at = now(), paid_by = 'Financeiro'
      where id = '00000000-0000-0000-0035-000000000181'$q$);

-- 8: settlement_pagar de ponta a ponta, com a identidade do financeiro.
select pg_temp.confere(8, 'financeiro paga lancamento: devolve 1 cupom marcado',
  $q$select public.settlement_pagar('00000000-0000-0000-0035-000000000b08',
       '2026-11-10T12:00:00Z', 'PIX', null, 'Teste Quem')::text$q$, '1');
select pg_temp.confere(8.1, 'lancamento pago e cupom pago',
  $q$select s.status || '|' || c.paid::text
       from public.settlements s, public.coupons c
      where s.id = '00000000-0000-0000-0035-000000000b08'
        and c.id = '00000000-0000-0000-0035-000000000191'$q$, 'pago|true');

-- 5: ADMIN limpa Pago de cupom em lançamento pago (decisão do dono).
reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub',(select id from adm),'role','authenticated')::text, true);

select pg_temp.nao_levanta(5, 'admin limpa Pago de cupom em lancamento pago',
  $q$update public.coupons set paid = false, paid_at = null, paid_by = null
      where id = '00000000-0000-0000-0035-000000000161'$q$);
select pg_temp.confere(5.1, 'o cupom ficou nao pago',
  $q$select paid::text from public.coupons where id = '00000000-0000-0000-0035-000000000161'$q$, 'false');

-- Resumo. 17 casos: 1, 1.1 (2); 2, 2.1 (2); 3, 3.1 (2); 4, 4.1, 4.2, 4.3 (4);
-- 5, 5.1 (2); 6, 6.1 (2); 7 (1); 8, 8.1 (2) = 17.
-- (recontar se casos mudarem)
insert into r
select 999, 'RESUMO', 'total 17, nenhum nao-OK',
       count(*) || ' linhas, ' || count(*) filter (where veredito not like 'OK%') || ' nao-OK',
       case when count(*) = 17 and count(*) filter (where veredito not like 'OK%') = 0
            then 'OK' else 'FALHOU -- linhas faltando ou casos nao-OK' end
  from r;

reset role;
select * from r order by ordem;

rollback;
