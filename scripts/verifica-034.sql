-- Verificação da migration 034 — settlement_pagar: pagar vira uma transação só.
--
-- Rodar no SQL Editor do Supabase, "Run without RLS" (ver verifica-031.sql: o
-- aviso de tabela sem RLS é falso positivo, `r` é temporária). NÃO altera
-- nada: tudo acontece dentro de begin/rollback.
--
-- Mesmas lições do verifica-031/033: cada caso confere SQLSTATE e o MOTIVO
-- (pg_temp.tenta), e cada caso usa a sua PRÓPRIA parceria, o seu PRÓPRIO
-- lançamento e os seus PRÓPRIOS cupons. Parcerias e cupons de teste são clones
-- de linhas reais; a parceria clonada tem fee_amount 0 para o gatilho da 033
-- não criar um fixo que sujaria as contagens.
--
-- Sem a 031/033 aplicadas o script para no setup ("relation ... does not
-- exist"). Falha alta, não silenciosa.
--
-- RODAR ANTES de aplicar a 034 e DEPOIS dela. Antes, os casos 1, 1.1, 1.2, 2,
-- 3, 3.1, 3.2, 4, 5, 6, 7, 7.1 e 8 (13 casos, todos os que chamam a função)
-- têm que ficar VERMELHOS: a função não existe (42883). O RESUMO também fica
-- vermelho, acusando 13 não-OK — são 14 linhas vermelhas no total, e é o
-- esperado. Ficam verdes nas duas rodadas os casos de "nada foi gravado":
-- 2.1, 2.2, 4.1, 5.1 e 6.1. Depois da 034, tudo OK.
--
-- Casos: 1 caminho feliz (lançamento e todos os cupons); 2 cupom desmarcado
-- de "Conferido" depois de entrar no lançamento (o cenário que motivou a
-- migration: a chamada INTEIRA falha e nada fica gravado); 3 segunda chamada
-- no mesmo lançamento; 4 lojista (nem admin nem financeiro); 5 sem identidade
-- (service_role / SQL Editor), recusado de propósito; 6 comissão sem itens;
-- 7 fixo sem itens (legítimo); 8 lançamento inexistente.

begin;

create temp table r(ordem numeric, teste text, esperado text, obtido text, veredito text);
grant select, insert on r to authenticated, anon;

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
             'id', ('00000000-0000-0000-0034-0000000001' || lpad(n::text, 2, '0'))::uuid,
             'coupon_number', 'T034-' || n,
             'customer_cpf', '9990034' || lpad(n::text, 4, '0'),
             'invoice_number', 'T034-NF-' || n,
             'status', 'used', 'verified', true, 'paid', false,
             'paid_at', null, 'paid_by', null,
             'used_at', now(), 'partnership_id', p_part))).*
  from (select * from public.coupons limit 1) b;
$f$;

create function pg_temp.mks(p_id uuid, p_part uuid, p_tipo text, p_valor numeric) returns void language sql as $f$
  insert into public.settlements(id, partnership_id, tipo, status, periodo_de, periodo_ate, valor)
  values (p_id, p_part, p_tipo, 'aberto',
          case when p_tipo = 'comissao' then date '2026-10-01' end,
          case when p_tipo = 'comissao' then date '2026-10-31' end,
          p_valor);
$f$;

create function pg_temp.mki(p_set uuid, n int, p_valor numeric) returns void language sql as $f$
  insert into public.settlement_items(settlement_id, coupon_id, valor)
  values (p_set, ('00000000-0000-0000-0034-0000000001' || lpad(n::text, 2, '0'))::uuid, p_valor);
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

select pg_temp.mkp(('00000000-0000-0000-0034-000000000a0' || g)::uuid) from generate_series(1, 7) g;

-- 1: dois cupons conferidos | 2: dois, um será desmarcado | 3, 4, 5: um cada
select pg_temp.mkc(11, '00000000-0000-0000-0034-000000000a01');
select pg_temp.mkc(12, '00000000-0000-0000-0034-000000000a01');
select pg_temp.mkc(21, '00000000-0000-0000-0034-000000000a02');
select pg_temp.mkc(22, '00000000-0000-0000-0034-000000000a02');
select pg_temp.mkc(31, '00000000-0000-0000-0034-000000000a03');
select pg_temp.mkc(41, '00000000-0000-0000-0034-000000000a04');
select pg_temp.mkc(51, '00000000-0000-0000-0034-000000000a05');

select pg_temp.mks('00000000-0000-0000-0034-000000000b01', '00000000-0000-0000-0034-000000000a01', 'comissao', 20);
select pg_temp.mks('00000000-0000-0000-0034-000000000b02', '00000000-0000-0000-0034-000000000a02', 'comissao', 20);
select pg_temp.mks('00000000-0000-0000-0034-000000000b03', '00000000-0000-0000-0034-000000000a03', 'comissao', 10);
select pg_temp.mks('00000000-0000-0000-0034-000000000b04', '00000000-0000-0000-0034-000000000a04', 'comissao', 10);
select pg_temp.mks('00000000-0000-0000-0034-000000000b05', '00000000-0000-0000-0034-000000000a05', 'comissao', 10);
select pg_temp.mks('00000000-0000-0000-0034-000000000b06', '00000000-0000-0000-0034-000000000a06', 'comissao', 0);
select pg_temp.mks('00000000-0000-0000-0034-000000000b07', '00000000-0000-0000-0034-000000000a07', 'fixo', 500);

select pg_temp.mki('00000000-0000-0000-0034-000000000b01', 11, 10);
select pg_temp.mki('00000000-0000-0000-0034-000000000b01', 12, 10);
select pg_temp.mki('00000000-0000-0000-0034-000000000b02', 21, 10);
select pg_temp.mki('00000000-0000-0000-0034-000000000b02', 22, 10);
select pg_temp.mki('00000000-0000-0000-0034-000000000b03', 31, 10);
select pg_temp.mki('00000000-0000-0000-0034-000000000b04', 41, 10);
select pg_temp.mki('00000000-0000-0000-0034-000000000b05', 51, 10);

-- O cenário que motivou a migration: o cupom ENTROU no lançamento conferido e
-- depois o Financeiro desmarcou "Conferido" (corrigir NF).
update public.coupons set verified = false
 where id = '00000000-0000-0000-0034-000000000122';

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values
 ('00000000-0000-0000-0034-0000000000e1','00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','teste-034-lojista@exemplo.invalido','x', now(), now(), now()),
 ('00000000-0000-0000-0034-0000000000e3','00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','teste-034-financeiro@exemplo.invalido','x', now(), now(), now());

insert into public.admin_profiles(id, name, email, role, active, influencer_id) values
 ('00000000-0000-0000-0034-0000000000e1','teste lojista','teste-034-lojista@exemplo.invalido','moderator',true,null),
 ('00000000-0000-0000-0034-0000000000e3','teste financeiro','teste-034-financeiro@exemplo.invalido','finance',true,null);

-- ===== 5: SEM identidade (service_role / SQL Editor) é recusado, de propósito =====
-- Ainda somos superusuário e sem claims: auth.uid() é nulo. Este caso existe
-- para a próxima pessoa não "consertar" a função liberando auth.uid() nulo
-- (Ruling 21): com a chave de serviço os triggers de imutabilidade deixam
-- tudo passar, e a rota passaria a ser a única guarda.
select pg_temp.tenta(5, 'sem identidade chamando settlement_pagar', 'P0001 apenas admin ou financeiro',
  $q$select public.settlement_pagar('00000000-0000-0000-0034-000000000b05', now(), 'PIX', null, 'x')$q$,
  'P0001', 'apenas admin ou financeiro');
select pg_temp.confere(5.1, 'recusa sem identidade nao gravou nada (aberto, cupom nao pago)',
  $q$select (select status from public.settlements where id = '00000000-0000-0000-0034-000000000b05')
          || '|' || (select paid::text from public.coupons where id = '00000000-0000-0000-0034-000000000151')$q$,
  'aberto|false');

-- ===== 4: lojista (nem admin nem financeiro) =====
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0034-0000000000e1","role":"authenticated"}', true);

select pg_temp.tenta(4, 'lojista chamando settlement_pagar', 'P0001 apenas admin ou financeiro',
  $q$select public.settlement_pagar('00000000-0000-0000-0034-000000000b04', now(), 'PIX', null, 'x')$q$,
  'P0001', 'apenas admin ou financeiro');

reset role;
select pg_temp.confere(4.1, 'recusa do lojista nao gravou nada (aberto, cupom nao pago)',
  $q$select (select status from public.settlements where id = '00000000-0000-0000-0034-000000000b04')
          || '|' || (select paid::text from public.coupons where id = '00000000-0000-0000-0034-000000000141')$q$,
  'aberto|false');

-- ===== daqui em diante: financeiro =====
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0034-0000000000e3","role":"authenticated"}', true);

-- 1: caminho feliz.
select pg_temp.confere(1, 'financeiro paga: devolve 2 cupons marcados',
  $q$select public.settlement_pagar('00000000-0000-0000-0034-000000000b01',
       '2026-11-10T12:00:00Z', 'PIX', 'E123', 'Teste Quem')::text$q$, '2');
select pg_temp.confere(1.1, 'lancamento pago com forma, identificador e data',
  $q$select status || '|' || forma || '|' || identificador || '|' || (paid_at = '2026-11-10T12:00:00Z')::text
       from public.settlements where id = '00000000-0000-0000-0034-000000000b01'$q$,
  'pago|PIX|E123|true');
select pg_temp.confere(1.2, 'os 2 cupons ficaram pagos, com paid_by e paid_at',
  $q$select count(*) || '|' || min(paid_by) || '|' || bool_and(paid_at = '2026-11-10T12:00:00Z')::text
       from public.coupons
      where id in ('00000000-0000-0000-0034-000000000111','00000000-0000-0000-0034-000000000112') and paid$q$,
  '2|Teste Quem|true');

-- 2: cupom desmarcado depois de entrar no lançamento. A chamada INTEIRA falha.
select pg_temp.tenta(2, 'cupom nao conferido derruba a chamada inteira', 'P0001 cupom nao conferido: T034-22',
  $q$select public.settlement_pagar('00000000-0000-0000-0034-000000000b02', now(), 'PIX', null, 'x')$q$,
  'P0001', 'cupom nao conferido: T034-22');
select pg_temp.confere(2.1, 'lancamento segue aberto',
  $q$select status from public.settlements where id = '00000000-0000-0000-0034-000000000b02'$q$, 'aberto');
select pg_temp.confere(2.2, 'nenhum cupom do lancamento foi marcado (nem o conferido)',
  $q$select count(*)::text from public.coupons
      where id in ('00000000-0000-0000-0034-000000000121','00000000-0000-0000-0034-000000000122') and paid$q$,
  '0');

-- 3: segunda chamada no mesmo lançamento.
select pg_temp.nao_levanta(3, 'primeira chamada',
  $q$select public.settlement_pagar('00000000-0000-0000-0034-000000000b03', '2026-11-10T12:00:00Z', 'PIX', null, 'Primeiro')$q$);
select pg_temp.tenta(3.1, 'segunda chamada no mesmo lancamento', 'P0001 nao esta aberto',
  $q$select public.settlement_pagar('00000000-0000-0000-0034-000000000b03', now(), 'TED', null, 'Segundo')$q$,
  'P0001', 'nao esta aberto');
select pg_temp.confere(3.2, 'a segunda nao sobrescreveu nada (forma PIX, paid_by Primeiro)',
  $q$select s.forma || '|' || c.paid_by
       from public.settlements s, public.coupons c
      where s.id = '00000000-0000-0000-0034-000000000b03'
        and c.id = '00000000-0000-0000-0034-000000000131'$q$,
  'PIX|Primeiro');

-- 6: comissão sem itens.
select pg_temp.tenta(6, 'comissao sem itens', 'P0001 comissao sem itens',
  $q$select public.settlement_pagar('00000000-0000-0000-0034-000000000b06', now(), 'PIX', null, 'x')$q$,
  'P0001', 'comissao sem itens');
select pg_temp.confere(6.1, 'comissao sem itens segue aberta',
  $q$select status from public.settlements where id = '00000000-0000-0000-0034-000000000b06'$q$, 'aberto');

-- 7: fixo sem itens é legítimo.
select pg_temp.nao_levanta(7, 'fixo sem itens paga',
  $q$select public.settlement_pagar('00000000-0000-0000-0034-000000000b07', now(), 'PIX', null, 'x')$q$);
select pg_temp.confere(7.1, 'fixo ficou pago',
  $q$select status from public.settlements where id = '00000000-0000-0000-0034-000000000b07'$q$, 'pago');

-- 8: lançamento inexistente.
select pg_temp.tenta(8, 'lancamento inexistente', 'P0001 inexistente ou nao esta aberto',
  $q$select public.settlement_pagar('00000000-0000-0000-0034-00000000dead', now(), 'PIX', null, 'x')$q$,
  'P0001', 'inexistente ou nao esta aberto');

-- Resumo. 18 casos: 1, 1.1, 1.2 (3); 2, 2.1, 2.2 (3); 3, 3.1, 3.2 (3);
-- 4, 4.1 (2); 5, 5.1 (2); 6, 6.1 (2); 7, 7.1 (2); 8 (1) = 18.
-- (recontar se casos mudarem)
insert into r
select 999, 'RESUMO', 'total 18, nenhum nao-OK',
       count(*) || ' linhas, ' || count(*) filter (where veredito not like 'OK%') || ' nao-OK',
       case when count(*) = 18 and count(*) filter (where veredito not like 'OK%') = 0
            then 'OK' else 'FALHOU -- linhas faltando ou casos nao-OK' end
  from r;

reset role;
select * from r order by ordem;

rollback;
