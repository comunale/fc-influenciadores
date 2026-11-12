-- Verificação da migration 033 — fixo e restituição nascem como conta a pagar.
--
-- Rodar no SQL Editor do Supabase, "Run without RLS" (ver verifica-031.sql: o
-- aviso de tabela sem RLS é falso positivo, `r` é temporária). NÃO altera
-- nada: tudo acontece dentro de begin/rollback.
--
-- Mesmas lições do verifica-031: cada caso confere SQLSTATE e o MOTIVO
-- (pg_temp.tenta), e cada caso usa a sua PRÓPRIA parceria e o seu PRÓPRIO
-- contrato. Parcerias de teste são clones de uma parceria real, com fee_amount
-- trocado. Se a 031 não estiver aplicada, o script para no setup.
--
-- RODAR ANTES de aplicar a 033 e DEPOIS dela. Antes, os casos 1, 1.1, 3.1, 5.2,
-- 8.1 e 8.2 têm que ficar VERMELHOS (nada cria fixo nem restituição ainda):
-- é isso que prova que o script mede alguma coisa. Os demais ficam verdes nas
-- duas rodadas, inclusive o 3 e o 4 (a função antiga já funciona para admin).
--
-- registrar_descumprimento exige admin: os casos que a chamam assumem a
-- identidade de um admin ativo (claims), como o caso 11 do verifica-031.
--
-- Casos: 1-2 fixo na criação; 3 restituição com fixo; 4 contrato aceito com
-- fixo ZERO (a regressão que a guarda `fee > 0` evita: é o único cenário que
-- existe no banco hoje); 5 chamada dupla; 6 quem não é admin; 7 sem
-- identidade nenhuma (service_role); 8-9 o fixo nasce também por UPDATE.

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
end $$;

-- Influenciador sem nenhuma parceria ativa: a fixture 'ativa' do caso 4 não
-- colide com "uma ativa por influenciador".
create temp table base as
  select influencer_id from public.partnerships
   group by influencer_id
  having count(*) filter (where status = 'ativa') = 0
   limit 1;

do $$ begin
  if not exists (select 1 from base) then
    raise exception 'fixture base vazio: todo influenciador ja tem parceria ativa';
  end if;
end $$;

-- ---------- auxiliares (só existem durante a transação) ----------

-- Parceria clonada de uma parceria do influenciador `base` (um que NÃO tem
-- parceria ativa: o índice único parcial só vale para status 'ativa'), com o
-- fee, o status e o ends_at informados (ends_at nulo = mantém o do clone) e com
-- contract_accepted_at preenchido (para provar que o descumprimento zera). O
-- INSERT dispara o trigger da 033.
create function pg_temp.mkp(p_id uuid, p_fee numeric, p_status text, p_ends date) returns void language sql as $f$
  insert into public.partnerships
  select (jsonb_populate_record(null::public.partnerships,
           to_jsonb(b) || jsonb_build_object('id', p_id, 'status', p_status,
             'fee_amount', p_fee, 'contract_accepted_at', now())
           || case when p_ends is null then '{}'::jsonb
                   else jsonb_build_object('ends_at', p_ends) end)).*
  from (select * from public.partnerships
         where influencer_id = (select influencer_id from base) limit 1) b;
$f$;

create function pg_temp.mkct(p_id uuid, p_part uuid) returns void language sql as $f$
  insert into public.contracts(id, partnership_id, corpo, status, accepted_at)
  values (p_id, p_part, 'contrato de teste 033', 'aceito', now());
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
  -- Só prova que NÃO levantou exceção (um select de função void devolve sempre
  -- 1 linha, então contar linhas não mediria nada). O efeito é medido pelos
  -- casos `confere` que vêm depois.
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

-- ---------- fixtures (como superusuário, auth.uid() nulo = service_role) ----------
-- a01 fee 1500 | a02 fee 0 | a03 fee 800 | a04 fee 0 ATIVA | a05 fee 600 | a06 fee 700
-- a07 fee 900 | a08 fee 0 (UPDATE 0->500->800) | a09 fee 0 (UPDATE para 0)

select pg_temp.mkp('00000000-0000-0000-0033-000000000a01', 1500, 'encerrada', null);
select pg_temp.mkp('00000000-0000-0000-0033-000000000a02', 0, 'encerrada', null);
select pg_temp.mkp('00000000-0000-0000-0033-000000000a03', 800, 'encerrada', null);
select pg_temp.mkp('00000000-0000-0000-0033-000000000a04', 0, 'ativa', current_date + 30);
select pg_temp.mkp('00000000-0000-0000-0033-000000000a05', 600, 'encerrada', null);
select pg_temp.mkp('00000000-0000-0000-0033-000000000a06', 700, 'encerrada', null);
select pg_temp.mkp('00000000-0000-0000-0033-000000000a07', 900, 'encerrada', null);
select pg_temp.mkp('00000000-0000-0000-0033-000000000a08', 0, 'encerrada', null);
select pg_temp.mkp('00000000-0000-0000-0033-000000000a09', 0, 'encerrada', null);

-- Contratos aceitos para os casos 3 a 6.
select pg_temp.mkct('00000000-0000-0000-0033-000000000c03', '00000000-0000-0000-0033-000000000a03');
select pg_temp.mkct('00000000-0000-0000-0033-000000000c04', '00000000-0000-0000-0033-000000000a04');
select pg_temp.mkct('00000000-0000-0000-0033-000000000c05', '00000000-0000-0000-0033-000000000a05');
select pg_temp.mkct('00000000-0000-0000-0033-000000000c06', '00000000-0000-0000-0033-000000000a06');
select pg_temp.mkct('00000000-0000-0000-0033-000000000c07', '00000000-0000-0000-0033-000000000a07');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values
 ('00000000-0000-0000-0033-0000000000e3','00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','teste-033-financeiro@exemplo.invalido','x', now(), now(), now());

insert into public.admin_profiles(id, name, email, role, active, influencer_id) values
 ('00000000-0000-0000-0033-0000000000e3','teste financeiro','teste-033-financeiro@exemplo.invalido','finance',true,null);

-- ===== 1-2: o fixo nasce com a parceria (inserida sem identidade) =====
-- 1 é também o controle positivo do 2: sem ele, "nada nasceu" não distingue
-- "fee 0 não gera" de "o trigger não existe".
select pg_temp.confere(1,   'fee 1500: nasce 1 fixo aberto de 1500',
  $q$select count(*) || '|' || coalesce(min(valor)::text, 'null') from public.settlements
     where partnership_id = '00000000-0000-0000-0033-000000000a01' and tipo = 'fixo' and status = 'aberto'$q$,
  '1|1500');
select pg_temp.confere(1.1, 'fee 1500: nenhum outro lancamento alem do fixo',
  $q$select count(*)::text from public.settlements where partnership_id = '00000000-0000-0000-0033-000000000a01'$q$,
  '1');
select pg_temp.confere(2,   'fee 0: nenhum lancamento',
  $q$select count(*)::text from public.settlements where partnership_id = '00000000-0000-0000-0033-000000000a02'$q$,
  '0');

-- ===== 7: SEM identidade nenhuma é recusado (de propósito) =====
-- Ainda somos superusuário, sem claims: auth.uid() é nulo, exatamente como para
-- service_role. A recusa é o comportamento CORRETO e deliberado (Ruling 17):
-- registrar_descumprimento continua conferindo is_admin() no banco, e a rota
-- chama com a sessão do admin (createClient), não com a chave de serviço. Este
-- caso existe para a próxima pessoa não "consertar" a função liberando
-- auth.uid() nulo -- o que deixaria a rota como única guarda. (Até a 033 a rota
-- usava service_role e a função recusava sempre: o descumprimento nunca
-- funcionou em produção.)
select pg_temp.tenta(7, 'sem identidade (service_role) chamando registrar_descumprimento',
  'P0001 apenas admin',
  $q$select public.registrar_descumprimento('00000000-0000-0000-0033-000000000c07')$q$,
  'P0001', 'apenas admin');
select pg_temp.confere(7.1, 'recusa sem identidade nao mudou o contrato',
  $q$select status from public.contracts where id = '00000000-0000-0000-0033-000000000c07'$q$, 'aceito');

-- ===== 8-9: o fixo nasce também por UPDATE do fee_amount =====
-- É assim que o valor chega às parcerias existentes (influencer-save). Nasce
-- uma vez; mudar o fee depois não mexe no lançamento (decisão do Financeiro).
select pg_temp.confere(8,   'antes do UPDATE: fee 0, nenhum lancamento',
  $q$select count(*)::text from public.settlements where partnership_id = '00000000-0000-0000-0033-000000000a08'$q$,
  '0');
update public.partnerships set fee_amount = 500 where id = '00000000-0000-0000-0033-000000000a08';
select pg_temp.confere(8.1, 'UPDATE 0 -> 500: nasce 1 fixo aberto de 500',
  $q$select count(*) || '|' || coalesce(min(valor)::text, 'null') from public.settlements
     where partnership_id = '00000000-0000-0000-0033-000000000a08' and tipo = 'fixo' and status = 'aberto'$q$,
  '1|500');
update public.partnerships set fee_amount = 800 where id = '00000000-0000-0000-0033-000000000a08';
select pg_temp.confere(8.2, 'UPDATE 500 -> 800: nao duplica e nao ajusta (segue 1 de 500)',
  $q$select count(*) || '|' || coalesce(min(valor)::text, 'null') from public.settlements
     where partnership_id = '00000000-0000-0000-0033-000000000a08' and tipo = 'fixo'$q$,
  '1|500');
update public.partnerships set fee_amount = 0 where id = '00000000-0000-0000-0033-000000000a09';
select pg_temp.confere(9,   'UPDATE para 0: nenhum lancamento',
  $q$select count(*)::text from public.settlements where partnership_id = '00000000-0000-0000-0033-000000000a09'$q$,
  '0');

-- ===== 6: quem não é admin (financeiro) é recusado =====
reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0033-0000000000e3","role":"authenticated"}', true);

select pg_temp.tenta(6, 'financeiro chamando registrar_descumprimento', 'P0001 apenas admin',
  $q$select public.registrar_descumprimento('00000000-0000-0000-0033-000000000c06')$q$,
  'P0001', 'apenas admin');

-- ===== 3-5: como admin =====
reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub',(select id from adm),'role','authenticated')::text, true);

-- 6.1/6.2: a recusa não deixou rastro (contrato segue aceito, sem restituição).
select pg_temp.confere(6.1, 'recusa nao mudou o contrato',
  $q$select status from public.contracts where id = '00000000-0000-0000-0033-000000000c06'$q$, 'aceito');
select pg_temp.confere(6.2, 'recusa nao criou restituicao',
  $q$select count(*)::text from public.settlements
     where partnership_id = '00000000-0000-0000-0033-000000000a06' and tipo = 'restituicao'$q$, '0');

-- 3: contrato aceito COM fixo (800).
select pg_temp.nao_levanta(3,   'admin registra descumprimento (fee 800)',
  $q$select public.registrar_descumprimento('00000000-0000-0000-0033-000000000c03')$q$);
select pg_temp.confere(3.1, 'nasce 1 restituicao aberta de 800',
  $q$select count(*) || '|' || coalesce(min(valor)::text, 'null') from public.settlements
     where partnership_id = '00000000-0000-0000-0033-000000000a03' and tipo = 'restituicao' and status = 'aberto'$q$,
  '1|800');
select pg_temp.confere(3.2, 'contrato descumprido, fee_a_restituir 800',
  $q$select status || '|' || coalesce(fee_a_restituir::text, 'null') from public.contracts
     where id = '00000000-0000-0000-0033-000000000c03'$q$, 'descumprido|800');
select pg_temp.confere(3.3, 'parceria: contract_accepted_at zerado',
  $q$select (contract_accepted_at is null)::text from public.partnerships
     where id = '00000000-0000-0000-0033-000000000a03'$q$, 'true');

-- 4: contrato aceito com fixo ZERO. Regressão P1: sem a guarda `fee > 0` o
-- insert com valor nulo abortaria a função toda e o contrato continuaria aceito.
select pg_temp.nao_levanta(4,   'admin registra descumprimento (fee 0)',
  $q$select public.registrar_descumprimento('00000000-0000-0000-0033-000000000c04')$q$);
select pg_temp.confere(4.1, 'contrato descumprido, fee_a_restituir nulo',
  $q$select status || '|' || coalesce(fee_a_restituir::text, 'null') from public.contracts
     where id = '00000000-0000-0000-0033-000000000c04'$q$, 'descumprido|null');
-- A fixture a04 nasce 'ativa' e com ends_at daqui a 30 dias: status e ends_at
-- só mudam se o UPDATE da parceria realmente rodou (medição, não tautologia).
select pg_temp.confere(4.2, 'parceria: contract_accepted_at zerado',
  $q$select (contract_accepted_at is null)::text from public.partnerships
     where id = '00000000-0000-0000-0033-000000000a04'$q$, 'true');
select pg_temp.confere(4.4, 'parceria ativa passou a encerrada',
  $q$select status from public.partnerships where id = '00000000-0000-0000-0033-000000000a04'$q$, 'encerrada');
select pg_temp.confere(4.5, 'parceria: ends_at encurtado para hoje (least)',
  $q$select (ends_at = current_date)::text from public.partnerships
     where id = '00000000-0000-0000-0033-000000000a04'$q$, 'true');
select pg_temp.confere(4.3, 'fee 0: nenhum lancamento (nem restituicao)',
  $q$select count(*)::text from public.settlements where partnership_id = '00000000-0000-0000-0033-000000000a04'$q$,
  '0');

-- 5: chamar duas vezes. A primeira funciona; a segunda falha e não duplica.
select pg_temp.nao_levanta(5,   'primeira chamada (fee 600)',
  $q$select public.registrar_descumprimento('00000000-0000-0000-0033-000000000c05')$q$);
select pg_temp.tenta(5.1, 'segunda chamada no mesmo contrato', 'P0001 contrato nao esta aceito',
  $q$select public.registrar_descumprimento('00000000-0000-0000-0033-000000000c05')$q$,
  'P0001', 'contrato nao esta aceito');
select pg_temp.confere(5.2, 'continua 1 restituicao so',
  $q$select count(*) || '|' || coalesce(min(valor)::text, 'null') from public.settlements
     where partnership_id = '00000000-0000-0000-0033-000000000a05' and tipo = 'restituicao'$q$,
  '1|600');

-- Resumo. 25 casos: 1, 1.1, 2 (3); 3 a 3.3 (4); 4 a 4.5 (6); 5 a 5.2 (3);
-- 6 a 6.2 (3); 7, 7.1 (2); 8 a 8.2 (3); 9 (1) = 25.
-- (recontar se casos mudarem)
insert into r
select 999, 'RESUMO', 'total 25, nenhum nao-OK',
       count(*) || ' linhas, ' || count(*) filter (where veredito not like 'OK%') || ' nao-OK',
       case when count(*) = 25 and count(*) filter (where veredito not like 'OK%') = 0
            then 'OK' else 'FALHOU -- linhas faltando ou casos nao-OK' end
  from r;

reset role;
select * from r order by ordem;

rollback;
