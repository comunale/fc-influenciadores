-- Verificação da migration 031 — o livro de lançamentos (settlements).
--
-- Rodar no SQL Editor do Supabase. NÃO altera nada: tudo acontece dentro de
-- begin/rollback, inclusive parcerias, cupons, lançamentos e contas de teste.
--
-- O editor avisa "creates tables without enabling RLS": é falso positivo. A
-- tabela `r` é `create temp table`, vive em pg_temp, não é exposta pelo
-- PostgREST e some no rollback. Escolher "Run without RLS" -- "Run and enable
-- RLS" ligaria RLS na tabela de resultados, que é escrita pelo papel
-- authenticated, e o teste passaria a medir a si mesmo.
--
-- As duas lições de 03/11/2026 (ver verifica-030.sql) valem aqui:
--
--   1. Cada caso confere o SQLSTATE e QUAL constraint ou QUAL motivo barrou
--      (pg_temp.tenta). `exception when others` genérico esconde a causa:
--      um DELETE de parceria dá 23503 por qualquer FK; só o nome da constraint
--      prova que foi o livro.
--   2. Cada caso usa os seus PRÓPRIOS dados (parceria, lançamento, cupom).
--      Nenhum caso depende do resultado de outro.
--
-- Os registros de teste são clonados de linhas reais (parceria e cupom) por
-- jsonb_populate_record, trocando só o que importa. Exige ao menos uma
-- parceria e um cupom no banco. Se o INSERT dos clones falhar, o script para:
-- o problema está no fixture, não na migration. Se a 031 NÃO estiver
-- aplicada, também para no setup com "relation ... does not exist" (é o
-- controle negativo). Cupons e parcerias são inseridos ANTES de qualquer
-- `set local role`, porque o trigger de insert de `coupons` só passa direto
-- quando auth.uid() é nulo.

begin;

create temp table r(ordem numeric, teste text, esperado text, obtido text, veredito text);
grant select, insert on r to authenticated, anon;

create temp table adm as
  select id from public.admin_profiles where role = 'admin' and active = true limit 1;
grant select on adm to authenticated;

-- ---------- fábricas e auxiliares (só existem durante a transação) ----------

-- Parceria clonada, 'encerrada' para não colidir com "uma ativa por influenciador".
create function pg_temp.mkp(p_id uuid) returns void language sql as $f$
  insert into public.partnerships
  select (jsonb_populate_record(null::public.partnerships,
           to_jsonb(b) || jsonb_build_object('id', p_id, 'status', 'encerrada'))).*
  from (select * from public.partnerships limit 1) b;
$f$;

-- Cupom clonado. Id, número, CPF e NF únicos por n (NF só se conferido).
create function pg_temp.mkc(n int, p_part uuid, p_status text, p_verified boolean,
                            p_used_at timestamptz) returns void language sql as $f$
  insert into public.coupons
  select (jsonb_populate_record(null::public.coupons,
           to_jsonb(b) || jsonb_build_object(
             'id', ('00000000-0000-0000-0031-0000000001' || lpad(n::text, 2, '0'))::uuid,
             'coupon_number', 'T031-' || n,
             'customer_cpf', '9990031' || lpad(n::text, 4, '0'),
             'invoice_number', case when p_verified then 'T031-NF-' || n end,
             'status', p_status, 'verified', p_verified, 'paid', false,
             'used_at', p_used_at, 'partnership_id', p_part))).*
  from (select * from public.coupons limit 1) b;
$f$;

-- Executa q e confere SQLSTATE (cod) e, se informado, a constraint OU um
-- trecho da mensagem (quem). Se q não falhar, o caso FALHOU.
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
  insert into r values (o, t, esperado, sq || ' ' || coalesce(cn, left(ms, 70)),
    case when sq = cod and (quem is null or quem = cn or ms like '%' || quem || '%')
         then 'OK' else 'CONFERIR -- barrou por outro motivo' end);
end $f$;

-- Executa q e espera que FUNCIONE (controle positivo / porta do admin).
create function pg_temp.funciona(o numeric, t text, q text) returns void language plpgsql as $f$
begin
  execute q;
  insert into r values (o, t, 'funciona', 'EXECUTOU', 'OK');
exception when others then
  insert into r values (o, t, 'funciona', sqlstate || ' ' || left(sqlerrm, 70),
    'FALHOU -- a trava barrou quem deveria passar');
end $f$;

-- ---------- fixtures (como superusuário) ----------

select pg_temp.mkp('00000000-0000-0000-0031-000000000a01');  -- PA
select pg_temp.mkp('00000000-0000-0000-0031-000000000a02');  -- PB
select pg_temp.mkp('00000000-0000-0000-0031-000000000a03');  -- P6 (só do caso 6)

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values
 ('00000000-0000-0000-0031-0000000000e1','00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','teste-031-lojista@exemplo.invalido','x', now(), now(), now()),
 ('00000000-0000-0000-0031-0000000000e2','00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','teste-031-influ@exemplo.invalido','x', now(), now(), now()),
 ('00000000-0000-0000-0031-0000000000e3','00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','teste-031-financeiro@exemplo.invalido','x', now(), now(), now());

insert into public.admin_profiles(id, name, email, role, active, influencer_id) values
 ('00000000-0000-0000-0031-0000000000e1','teste lojista','teste-031-lojista@exemplo.invalido','moderator',true,null),
 ('00000000-0000-0000-0031-0000000000e2','teste influ','teste-031-influ@exemplo.invalido','influencer',true,
    (select influencer_id from public.partnerships where id = '00000000-0000-0000-0031-000000000a01')),
 ('00000000-0000-0000-0031-0000000000e3','teste financeiro','teste-031-financeiro@exemplo.invalido','finance',true,null);

-- Cupons, um conjunto por caso (n = número do caso; 71/72 = caso 7).
select pg_temp.mkc(1,  '00000000-0000-0000-0031-000000000a01', 'used', true,  now());
select pg_temp.mkc(2,  '00000000-0000-0000-0031-000000000a01', 'used', true,  null);   -- used_at nulo
select pg_temp.mkc(3,  '00000000-0000-0000-0031-000000000a02', 'used', true,  now());  -- outra parceria
select pg_temp.mkc(4,  '00000000-0000-0000-0031-000000000a01', 'used', false, now());  -- nao conferido
select pg_temp.mkc(71, '00000000-0000-0000-0031-000000000a01', 'used', true,  now());
select pg_temp.mkc(72, '00000000-0000-0000-0031-000000000a01', 'used', true,  now());
select pg_temp.mkc(10, '00000000-0000-0000-0031-000000000a01', 'used', true,  now());
select pg_temp.mkc(11, '00000000-0000-0000-0031-000000000a01', 'used', true,  now());
select pg_temp.mkc(14, '00000000-0000-0000-0031-000000000a01', 'used', true,  now());
select pg_temp.mkc(15, '00000000-0000-0000-0031-000000000a01', 'used', true,  now());
select pg_temp.mkc(16, '00000000-0000-0000-0031-000000000a01', 'used', true,  now());
select pg_temp.mkc(17, '00000000-0000-0000-0031-000000000a01', 'used', true,  now());
select pg_temp.mkc(18, '00000000-0000-0000-0031-000000000a01', 'used', true,  now());
select pg_temp.mkc(21, '00000000-0000-0000-0031-000000000a01', 'used', true,  now());
select pg_temp.mkc(22, '00000000-0000-0000-0031-000000000a01', 'used', true,  now());

-- Lançamentos de fixture: um por caso (b12/b13 já nascem pagos).
insert into public.settlements(id, partnership_id, tipo, status, valor, periodo_de, periodo_ate, paid_at, forma) values
 ('00000000-0000-0000-0031-000000000b01','00000000-0000-0000-0031-000000000a01','comissao','aberto',100,'2026-10-01','2026-10-31',null,null),
 ('00000000-0000-0000-0031-000000000b02','00000000-0000-0000-0031-000000000a01','comissao','aberto',100,'2026-10-01','2026-10-31',null,null),
 ('00000000-0000-0000-0031-000000000b03','00000000-0000-0000-0031-000000000a01','comissao','aberto',100,'2026-10-01','2026-10-31',null,null),
 ('00000000-0000-0000-0031-000000000b04','00000000-0000-0000-0031-000000000a01','comissao','aberto',100,'2026-10-01','2026-10-31',null,null),
 ('00000000-0000-0000-0031-000000000b06','00000000-0000-0000-0031-000000000a03','fixo','aberto',500,null,null,null,null),
 ('00000000-0000-0000-0031-000000000b08','00000000-0000-0000-0031-000000000a01','fixo','aberto',500,null,null,null,null),
 ('00000000-0000-0000-0031-000000000b09','00000000-0000-0000-0031-000000000a01','fixo','aberto',500,null,null,null,null),
 ('00000000-0000-0000-0031-000000000b10','00000000-0000-0000-0031-000000000a01','fixo','aberto',500,null,null,null,null),
 ('00000000-0000-0000-0031-000000000b12','00000000-0000-0000-0031-000000000a01','fixo','pago',100,null,null,now(),'pix'),
 ('00000000-0000-0000-0031-000000000b13','00000000-0000-0000-0031-000000000a01','fixo','pago',100,null,null,now(),'pix'),
 ('00000000-0000-0000-0031-000000000b14','00000000-0000-0000-0031-000000000a01','fixo','aberto',100,null,null,null,null),
 ('00000000-0000-0000-0031-000000000b15','00000000-0000-0000-0031-000000000a01','fixo','aberto',100,null,null,null,null),
 ('00000000-0000-0000-0031-000000000b16','00000000-0000-0000-0031-000000000a01','fixo','aberto',100,null,null,null,null),
 ('00000000-0000-0000-0031-000000000b17','00000000-0000-0000-0031-000000000a01','fixo','aberto',100,null,null,null,null),
 ('00000000-0000-0000-0031-000000000b18','00000000-0000-0000-0031-000000000a01','fixo','aberto',100,null,null,null,null),
 ('00000000-0000-0000-0031-000000000b19','00000000-0000-0000-0031-000000000a01','fixo','pago',100,null,null,now(),'pix'),
 ('00000000-0000-0000-0031-000000000b20','00000000-0000-0000-0031-000000000a01','fixo','pago',100,null,null,now(),'pix'),
 ('00000000-0000-0000-0031-000000000b21','00000000-0000-0000-0031-000000000a01','fixo','aberto',100,null,null,null,null),
 ('00000000-0000-0000-0031-000000000b22','00000000-0000-0000-0031-000000000a01','fixo','aberto',100,null,null,null,null),
 ('00000000-0000-0000-0031-000000000b23','00000000-0000-0000-0031-000000000a01','fixo','pago',100,null,null,now(),'pix');

-- Itens de fixture (os de b14/b15 entram com o lançamento aberto e só depois ele vira pago).
insert into public.settlement_items(id, settlement_id, coupon_id, valor) values
 ('00000000-0000-0000-0031-0000000000d1','00000000-0000-0000-0031-000000000b01','00000000-0000-0000-0031-000000000101',10),
 ('00000000-0000-0000-0031-0000000000d4','00000000-0000-0000-0031-000000000b14','00000000-0000-0000-0031-000000000114',10),
 ('00000000-0000-0000-0031-0000000000d5','00000000-0000-0000-0031-000000000b15','00000000-0000-0000-0031-000000000115',10),
 ('00000000-0000-0000-0031-0000000000d6','00000000-0000-0000-0031-000000000b16','00000000-0000-0000-0031-000000000116',10),
 ('00000000-0000-0000-0031-0000000000d8','00000000-0000-0000-0031-000000000b18','00000000-0000-0000-0031-000000000118',10),
 ('00000000-0000-0000-0031-0000000000d9','00000000-0000-0000-0031-000000000b21','00000000-0000-0000-0031-000000000121',10),
 ('00000000-0000-0000-0031-0000000000da','00000000-0000-0000-0031-000000000b22','00000000-0000-0000-0031-000000000122',10);

update public.settlements set status = 'pago', paid_at = now(), forma = 'pix'
 where id in ('00000000-0000-0000-0031-000000000b14','00000000-0000-0000-0031-000000000b15',
                '00000000-0000-0000-0031-000000000b21','00000000-0000-0000-0031-000000000b22');

-- ===== Casos de constraint e de trigger (como superusuário) =====
-- Prefixos: S = lançamento, C = cupom, em uuids '...0031-000000000bNN' / '...01NN'.

select pg_temp.tenta(1,   'mesmo cupom duas vezes', '23505 settlement_items_coupon_unico',
  $q$insert into public.settlement_items(settlement_id, coupon_id, valor)
     values ('00000000-0000-0000-0031-000000000b01','00000000-0000-0000-0031-000000000101',10)$q$,
  '23505', 'settlement_items_coupon_unico');
select pg_temp.tenta(2,   'cupom used com used_at nulo', 'trigger: sem data de uso',
  $q$insert into public.settlement_items(settlement_id, coupon_id, valor)
     values ('00000000-0000-0000-0031-000000000b02','00000000-0000-0000-0031-000000000102',10)$q$,
  'P0001', 'sem data de uso');
select pg_temp.tenta(3,   'cupom de outra parceria', 'trigger: outra parceria',
  $q$insert into public.settlement_items(settlement_id, coupon_id, valor)
     values ('00000000-0000-0000-0031-000000000b03','00000000-0000-0000-0031-000000000103',10)$q$,
  'P0001', 'outra parceria');
select pg_temp.tenta(4,   'cupom verified=false', 'trigger: nao conferido',
  $q$insert into public.settlement_items(settlement_id, coupon_id, valor)
     values ('00000000-0000-0000-0031-000000000b04','00000000-0000-0000-0031-000000000104',10)$q$,
  'P0001', 'nao conferido');

-- 5: tipo 'fixo' nos três primeiros, para a regra do período não interferir.
select pg_temp.tenta(5,   'pago sem paid_at', '23514 settlements_pago_exige_dados',
  $q$insert into public.settlements(partnership_id,tipo,status,valor,forma)
     values ('00000000-0000-0000-0031-000000000a01','fixo','pago',10,'pix')$q$,
  '23514', 'settlements_pago_exige_dados');
select pg_temp.tenta(5.1, 'pago sem forma', '23514 settlements_pago_exige_dados',
  $q$insert into public.settlements(partnership_id,tipo,status,valor,paid_at)
     values ('00000000-0000-0000-0031-000000000a01','fixo','pago',10,now())$q$,
  '23514', 'settlements_pago_exige_dados');
select pg_temp.tenta(5.2, 'pago com forma em branco', '23514 settlements_pago_exige_dados',
  $q$insert into public.settlements(partnership_id,tipo,status,valor,paid_at,forma)
     values ('00000000-0000-0000-0031-000000000a01','fixo','pago',10,now(),'   ')$q$,
  '23514', 'settlements_pago_exige_dados');
select pg_temp.tenta(5.3, 'comissao sem periodo', '23514 settlements_comissao_exige_periodo',
  $q$insert into public.settlements(partnership_id,tipo,valor)
     values ('00000000-0000-0000-0031-000000000a01','comissao',10)$q$,
  '23514', 'settlements_comissao_exige_periodo');

-- 6: P6 só tem lançamento e nenhum cupom: o 23503 só pode vir do livro.
select pg_temp.tenta(6,   'apagar parceria com lancamento', '23503 settlements_partnership_id_fkey',
  $q$delete from public.partnerships where id = '00000000-0000-0000-0031-000000000a03'$q$,
  '23503', 'settlements_partnership_id_fkey');

-- 16: valor é magnitude; o sinal mora em `tipo`.
select pg_temp.tenta(16,   'lancamento com valor negativo', '23514 settlements_valor_nao_negativo',
  $q$insert into public.settlements(partnership_id,tipo,valor)
     values ('00000000-0000-0000-0031-000000000a01','restituicao',-500)$q$,
  '23514', 'settlements_valor_nao_negativo');
select pg_temp.tenta(16.1, 'item com valor negativo', '23514 settlement_items_valor_nao_negativo',
  $q$insert into public.settlement_items(settlement_id, coupon_id, valor)
     values ('00000000-0000-0000-0031-000000000b17','00000000-0000-0000-0031-000000000117',-10)$q$,
  '23514', 'settlement_items_valor_nao_negativo');

-- ===== 7: controle POSITIVO — fechar, incluir 2 cupons válidos, pagar =====
do $$
declare n int; st text;
begin
  insert into public.settlements(id, partnership_id, tipo, valor, periodo_de, periodo_ate)
  values ('00000000-0000-0000-0031-000000000b07','00000000-0000-0000-0031-000000000a01',
          'comissao',20,'2026-10-01','2026-10-31');
  insert into public.settlement_items(settlement_id, coupon_id, valor) values
    ('00000000-0000-0000-0031-000000000b07','00000000-0000-0000-0031-000000000171',10),
    ('00000000-0000-0000-0031-000000000b07','00000000-0000-0000-0031-000000000172',10);
  update public.settlements set status = 'pago', paid_at = now(), forma = 'pix'
   where id = '00000000-0000-0000-0031-000000000b07';
  select count(*) into n from public.settlement_items
   where settlement_id = '00000000-0000-0000-0031-000000000b07';
  select status into st from public.settlements where id = '00000000-0000-0000-0031-000000000b07';
  insert into r values (7,'fechar, incluir 2 cupons validos, pagar (controle positivo)','2 itens, pago',
    n||' itens, '||st, case when n = 2 and st = 'pago' then 'OK' else 'FALHOU' end);
exception when others then
  insert into r values (7,'fechar, incluir 2 cupons validos, pagar (controle positivo)','funciona',
    sqlstate||' '||left(sqlerrm,70),'FALHOU -- a 031 barrou o caminho legitimo');
end $$;

-- ===== 15: controle POSITIVO — em lançamento ABERTO as travas de 12-14 deixam passar =====
-- Sem este caso, uma trava que recusa tudo passaria como aprovada.
do $$
declare v numeric; n int;
begin
  update public.settlement_items set valor = 55 where id = '00000000-0000-0000-0031-0000000000d6';
  select valor into v from public.settlement_items where id = '00000000-0000-0000-0031-0000000000d6';
  insert into r values (15,'editar item de lancamento aberto','valor 55','valor '||v,
    case when v = 55 then 'OK' else 'FALHOU' end);

  delete from public.settlement_items where id = '00000000-0000-0000-0031-0000000000d6';
  select count(*) into n from public.settlement_items where id = '00000000-0000-0000-0031-0000000000d6';
  insert into r values (15.1,'apagar item de lancamento aberto','0 linhas',n||' linhas',
    case when n = 0 then 'OK' else 'FALHOU' end);

  update public.settlements set valor = 20 where id = '00000000-0000-0000-0031-000000000b16';
  select valor into v from public.settlements where id = '00000000-0000-0000-0031-000000000b16';
  insert into r values (15.2,'editar valor de lancamento aberto','valor 20','valor '||v,
    case when v = 20 then 'OK' else 'FALHOU' end);

  -- o fluxo do cancelamento: apagar os itens e depois marcar cancelado
  delete from public.settlement_items where settlement_id = '00000000-0000-0000-0031-000000000b18';
  update public.settlements set status = 'cancelado' where id = '00000000-0000-0000-0031-000000000b18';
  select count(*) into n from public.settlement_items
   where settlement_id = '00000000-0000-0000-0031-000000000b18';
  insert into r values (15.3,'cancelar lancamento aberto apagando itens','0 itens',n||' itens',
    case when n = 0 then 'OK' else 'FALHOU' end);

  delete from public.settlements where id = '00000000-0000-0000-0031-000000000b16';
  insert into r values (15.4,'apagar lancamento aberto','apagou','APAGOU','OK');
exception when others then
  insert into r values (15,'lancamento aberto continua editavel','funciona',
    sqlstate||' '||left(sqlerrm,70),'FALHOU -- a trava recusa tudo, ate o legitimo');
end $$;

-- ===== 17: sem identidade (auth.uid nulo = service_role / SQL Editor) passa =====
-- Sem esta porta, a migration da tarefa seguinte, que insere lançamento já
-- pago, ficaria barrada. Aqui ainda somos superusuário, sem claims.
select pg_temp.funciona(17, 'sem identidade edita lancamento pago',
  $q$update public.settlements set valor = 150 where id = '00000000-0000-0000-0031-000000000b23'$q$);

-- ===== 8: lojista (moderator) lendo e escrevendo: nada =====
reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0031-0000000000e1","role":"authenticated"}', true);

do $$
declare n int;
begin
  select count(*) into n from public.settlements where id = '00000000-0000-0000-0031-000000000b08';
  insert into r values (8,'lojista lendo settlements (existe 1 linha para admin)','0 linhas',n||' linhas',
    case when n = 0 then 'OK' else 'FALHOU -- lojista enxerga o livro' end);
exception when others then
  insert into r values (8,'lojista lendo settlements','0 linhas',sqlstate||' '||left(sqlerrm,60),
    'CONFERIR -- esperava 0 linhas por RLS');
end $$;

do $$
begin
  insert into public.settlements(partnership_id, tipo, valor)
  values ('00000000-0000-0000-0031-000000000a01','fixo',1);
  insert into r values (8.1,'lojista inserindo em settlements','42501','INSERIU','FALHOU -- lojista escreve no livro');
exception
  when insufficient_privilege then
    insert into r values (8.1,'lojista inserindo em settlements','42501','42501','OK');
  when others then
    insert into r values (8.1,'lojista inserindo em settlements','42501',
      sqlstate||' '||left(sqlerrm,60),'CONFERIR -- barrou por outro motivo');
end $$;

-- ===== 9: influenciador lendo e escrevendo: nada =====
reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0031-0000000000e2","role":"authenticated"}', true);

do $$
declare n int;
begin
  select count(*) into n from public.settlements where id = '00000000-0000-0000-0031-000000000b09';
  insert into r values (9,'influenciador lendo settlements (existe 1 linha para admin)','0 linhas',n||' linhas',
    case when n = 0 then 'OK' else 'FALHOU -- influenciador enxerga o livro' end);
exception when others then
  insert into r values (9,'influenciador lendo settlements','0 linhas',sqlstate||' '||left(sqlerrm,60),
    'CONFERIR -- esperava 0 linhas por RLS');
end $$;

do $$
begin
  insert into public.settlements(partnership_id, tipo, valor)
  values ('00000000-0000-0000-0031-000000000a01','fixo',1);
  insert into r values (9.1,'influenciador inserindo em settlements','42501','INSERIU','FALHOU -- influenciador escreve no livro');
exception
  when insufficient_privilege then
    insert into r values (9.1,'influenciador inserindo em settlements','42501','42501','OK');
  when others then
    insert into r values (9.1,'influenciador inserindo em settlements','42501',
      sqlstate||' '||left(sqlerrm,60),'CONFERIR -- barrou por outro motivo');
end $$;

-- ===== 10: financeiro lendo e inserindo (lançamento e item) =====
reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0031-0000000000e3","role":"authenticated"}', true);

do $$
declare n int;
begin
  select count(*) into n from public.settlements where id = '00000000-0000-0000-0031-000000000b10';
  insert into r values (10,'financeiro lendo settlements','1 linha',n||' linhas',
    case when n = 1 then 'OK' else 'FALHOU -- financeiro nao enxerga o livro' end);
exception when others then
  insert into r values (10,'financeiro lendo settlements','1 linha',sqlstate||' '||left(sqlerrm,60),'FALHOU');
end $$;

do $$
begin
  insert into public.settlements(id, partnership_id, tipo, valor, periodo_de, periodo_ate)
  values ('00000000-0000-0000-0031-000000000b1a','00000000-0000-0000-0031-000000000a01',
          'comissao',10,'2026-10-01','2026-10-31');
  insert into public.settlement_items(settlement_id, coupon_id, valor)
  values ('00000000-0000-0000-0031-000000000b1a','00000000-0000-0000-0031-000000000110',10);
  insert into r values (10.1,'financeiro inserindo lancamento e item','funciona','INSERIU','OK');
exception when others then
  insert into r values (10.1,'financeiro inserindo lancamento e item','funciona',
    sqlstate||' '||left(sqlerrm,70),'FALHOU -- a 031 barrou o financeiro');
end $$;

-- Financeiro NÃO mexe em lançamento pago nem em itens dele (as travas de
-- 12-14 distinguem papel: o par admin está no caso 11, logo abaixo).
-- 12: pago não muda campo nenhum nem sai de 'pago'; 13: não se apaga.
select pg_temp.tenta(12,   'editar valor de lancamento pago', 'trigger: pago e imutavel',
  $q$update public.settlements set valor = 999 where id = '00000000-0000-0000-0031-000000000b12'$q$,
  'P0001', 'pago e imutavel');
select pg_temp.tenta(12.1, 'editar forma de lancamento pago', 'trigger: pago e imutavel',
  $q$update public.settlements set forma = 'dinheiro' where id = '00000000-0000-0000-0031-000000000b12'$q$,
  'P0001', 'pago e imutavel');
select pg_temp.tenta(12.2, 'reabrir lancamento pago', 'trigger: pago e imutavel',
  $q$update public.settlements set status = 'aberto' where id = '00000000-0000-0000-0031-000000000b12'$q$,
  'P0001', 'pago e imutavel');
select pg_temp.tenta(12.3, 'cancelar lancamento pago', 'trigger: pago e imutavel',
  $q$update public.settlements set status = 'cancelado' where id = '00000000-0000-0000-0031-000000000b12'$q$,
  'P0001', 'pago e imutavel');
select pg_temp.tenta(13,   'apagar lancamento pago', 'trigger: pago e imutavel',
  $q$delete from public.settlements where id = '00000000-0000-0000-0031-000000000b13'$q$,
  'P0001', 'pago e imutavel');

-- 14: itens de lançamento pago não mudam nem somem.
select pg_temp.tenta(14,   'editar item de lancamento pago', 'trigger: itens so mudam em aberto',
  $q$update public.settlement_items set valor = 999 where id = '00000000-0000-0000-0031-0000000000d4'$q$,
  'P0001', 'itens so mudam em lancamento aberto');
select pg_temp.tenta(14.1, 'apagar item de lancamento pago', 'trigger: itens so mudam em aberto',
  $q$delete from public.settlement_items where id = '00000000-0000-0000-0031-0000000000d5'$q$,
  'P0001', 'itens so mudam em lancamento aberto');


-- ===== 11: admin inserindo lançamento e item =====
reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub',(select id from adm),'role','authenticated')::text, true);

do $$
begin
  insert into public.settlements(id, partnership_id, tipo, valor, periodo_de, periodo_ate)
  values ('00000000-0000-0000-0031-000000000b1b','00000000-0000-0000-0031-000000000a01',
          'comissao',10,'2026-10-01','2026-10-31');
  insert into public.settlement_items(settlement_id, coupon_id, valor)
  values ('00000000-0000-0000-0031-000000000b1b','00000000-0000-0000-0031-000000000111',10);
  insert into r values (11,'admin inserindo lancamento e item','funciona','INSERIU','OK');
exception when others then
  insert into r values (11,'admin inserindo lancamento e item','funciona',
    sqlstate||' '||left(sqlerrm,70),'FALHOU -- a 031 barrou o admin');
end $$;

-- Par dos casos 12-14: o MESMO tipo de operação que o financeiro não pode,
-- o admin pode (cada um com o seu próprio lançamento pago).
select pg_temp.funciona(12.4, 'admin edita lancamento pago',
  $q$update public.settlements set valor = 150 where id = '00000000-0000-0000-0031-000000000b19'$q$);
select pg_temp.funciona(13.1, 'admin apaga lancamento pago',
  $q$delete from public.settlements where id = '00000000-0000-0000-0031-000000000b20'$q$);
select pg_temp.funciona(14.2, 'admin edita item de lancamento pago',
  $q$update public.settlement_items set valor = 15 where id = '00000000-0000-0000-0031-0000000000d9'$q$);
select pg_temp.funciona(14.3, 'admin apaga item de lancamento pago',
  $q$delete from public.settlement_items where id = '00000000-0000-0000-0031-0000000000da'$q$);

reset role;
select * from r order by ordem;

rollback;
