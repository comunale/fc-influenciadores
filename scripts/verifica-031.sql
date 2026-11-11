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
--   1. Cada caso confere o SQLSTATE, e quando há mais de uma causa possível
--      para o mesmo código, confere também QUAL constraint ou QUAL motivo
--      barrou. `exception when others` genérico esconde a causa. Exemplo: um
--      DELETE de parceria dá 23503 tanto pelo livro quanto por qualquer outra
--      tabela que aponte para ela; só o nome da constraint prova que foi o
--      livro.
--   2. Cada caso usa os seus PRÓPRIOS dados (parceria, lançamento, cupom).
--      Nenhum caso depende do resultado de outro.
--
-- Os registros de teste são clonados de linhas reais (parceria e cupom) por
-- jsonb_populate_record, só trocando o que importa; assim o script não precisa
-- conhecer todas as colunas obrigatórias das tabelas. Exige existir pelo menos
-- uma parceria e um cupom no banco (existem). Se o INSERT dos clones falhar,
-- o script inteiro para: o problema está no fixture, não na migration.
--
-- Se a 031 NÃO estiver aplicada, os casos acusam "migration 031 nao aplicada".

begin;

create temp table r(ordem numeric, teste text, esperado text, obtido text, veredito text);
grant select, insert on r to authenticated, anon;

-- O admin de verdade, lido do banco para não gravar uuid neste arquivo.
create temp table adm as
  select id from public.admin_profiles where role = 'admin' and active = true limit 1;
grant select on adm to authenticated;

-- ---------- fábricas de fixture (só existem durante a transação) ----------

-- Parceria clonada de uma real, 'encerrada' para não colidir com o índice de
-- "uma ativa por influenciador".
create function pg_temp.mkp(p_id uuid) returns void language sql as $f$
  insert into public.partnerships
  select (jsonb_populate_record(null::public.partnerships,
           to_jsonb(b) || jsonb_build_object('id', p_id, 'status', 'encerrada'))).*
  from (select * from public.partnerships limit 1) b;
$f$;

-- Cupom clonado de um real. Id, número, CPF e NF únicos por n.
create function pg_temp.mkc(n int, p_part uuid, p_status text, p_verified boolean,
                            p_used_at timestamptz) returns uuid language plpgsql as $f$
declare cid uuid := ('00000000-0000-0000-0031-0000000001' || lpad(n::text, 2, '0'))::uuid;
begin
  insert into public.coupons
  select (jsonb_populate_record(null::public.coupons,
           to_jsonb(b) || jsonb_build_object(
             'id', cid,
             'coupon_number', 'T031-' || n,
             'customer_cpf', '9990031' || lpad(n::text, 4, '0'),
             'invoice_number', case when p_verified then 'T031-NF-' || n end,
             'status', p_status,
             'verified', p_verified,
             'paid', false,
             'used_at', p_used_at,
             'partnership_id', p_part))).*
  from (select * from public.coupons limit 1) b;
  return cid;
end $f$;

-- ---------- fixtures (como superusuário, antes de trocar de papel) ----------

select pg_temp.mkp('00000000-0000-0000-0031-000000000a01');  -- PA
select pg_temp.mkp('00000000-0000-0000-0031-000000000a02');  -- PB
select pg_temp.mkp('00000000-0000-0000-0031-000000000a03');  -- P6 (só do caso 6)

-- Contas por papel. O influenciador precisa de influencer_id (constraint da 014).
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

-- Cupons: um conjunto por caso.
select pg_temp.mkc(1,  '00000000-0000-0000-0031-000000000a01', 'used', true,  now());  -- caso 1
select pg_temp.mkc(2,  '00000000-0000-0000-0031-000000000a01', 'used', true,  null);   -- caso 2: used_at nulo
select pg_temp.mkc(3,  '00000000-0000-0000-0031-000000000a02', 'used', true,  now());  -- caso 3: outra parceria
select pg_temp.mkc(4,  '00000000-0000-0000-0031-000000000a01', 'used', false, now());  -- caso 4: nao conferido
select pg_temp.mkc(71, '00000000-0000-0000-0031-000000000a01', 'used', true,  now());  -- caso 7
select pg_temp.mkc(72, '00000000-0000-0000-0031-000000000a01', 'used', true,  now());  -- caso 7
select pg_temp.mkc(10, '00000000-0000-0000-0031-000000000a01', 'used', true,  now());  -- caso 10
select pg_temp.mkc(11, '00000000-0000-0000-0031-000000000a01', 'used', true,  now());  -- caso 11

-- Lançamentos de fixture (o que os casos de leitura precisam encontrar).
-- Um lançamento por caso; só entram aqui os que o caso não cria sozinho.
insert into public.settlements(id, partnership_id, tipo, valor, periodo_de, periodo_ate) values
 ('00000000-0000-0000-0031-000000000b01','00000000-0000-0000-0031-000000000a01','comissao',100,'2026-10-01','2026-10-31'),
 ('00000000-0000-0000-0031-000000000b02','00000000-0000-0000-0031-000000000a01','comissao',100,'2026-10-01','2026-10-31'),
 ('00000000-0000-0000-0031-000000000b03','00000000-0000-0000-0031-000000000a01','comissao',100,'2026-10-01','2026-10-31'),
 ('00000000-0000-0000-0031-000000000b04','00000000-0000-0000-0031-000000000a01','comissao',100,'2026-10-01','2026-10-31'),
 ('00000000-0000-0000-0031-000000000b06','00000000-0000-0000-0031-000000000a03','fixo',500,null,null),
 ('00000000-0000-0000-0031-000000000b08','00000000-0000-0000-0031-000000000a01','fixo',500,null,null),
 ('00000000-0000-0000-0031-000000000b09','00000000-0000-0000-0031-000000000a01','fixo',500,null,null),
 ('00000000-0000-0000-0031-000000000b10','00000000-0000-0000-0031-000000000a01','fixo',500,null,null);

-- ===== 1: o mesmo cupom duas vezes => índice único =====
do $$
declare cn text;
begin
  insert into public.settlement_items(settlement_id, coupon_id, valor)
  values ('00000000-0000-0000-0031-000000000b01','00000000-0000-0000-0031-000000000101',10);
  begin
    insert into public.settlement_items(settlement_id, coupon_id, valor)
    values ('00000000-0000-0000-0031-000000000b01','00000000-0000-0000-0031-000000000101',10);
    insert into r values (1,'mesmo cupom duas vezes','23505 settlement_items_coupon_unico',
                          'INSERIU','FALHOU -- cupom pode ser pago duas vezes');
  exception when unique_violation then
    get stacked diagnostics cn = constraint_name;
    insert into r values (1,'mesmo cupom duas vezes','23505 settlement_items_coupon_unico',
      '23505 '||coalesce(cn,'?'),
      case when cn = 'settlement_items_coupon_unico' then 'OK' else 'CONFERIR -- barrou por outro indice' end);
  end;
exception
  when undefined_table then
    insert into r values (1,'mesmo cupom duas vezes','23505','tabela nao existe','FALHOU -- migration 031 nao aplicada');
  when others then
    insert into r values (1,'mesmo cupom duas vezes','23505',
      sqlstate||' '||left(sqlerrm,60),'CONFERIR -- falhou antes de chegar no teste');
end $$;

-- ===== 2: cupom 'used' com used_at nulo => trigger =====
do $$
begin
  insert into public.settlement_items(settlement_id, coupon_id, valor)
  values ('00000000-0000-0000-0031-000000000b02','00000000-0000-0000-0031-000000000102',10);
  insert into r values (2,'cupom used com used_at nulo','recusa pelo trigger (sem data de uso)',
                        'INSERIU','FALHOU -- trigger ausente ou frouxo');
exception
  when raise_exception then
    insert into r values (2,'cupom used com used_at nulo','recusa pelo trigger (sem data de uso)',
      sqlstate||' '||left(sqlerrm,70),
      case when sqlerrm like '%sem data de uso%' then 'OK' else 'CONFERIR -- trigger recusou por outro motivo' end);
  when undefined_table then
    insert into r values (2,'cupom used com used_at nulo','recusa pelo trigger','tabela nao existe','FALHOU -- migration 031 nao aplicada');
  when others then
    insert into r values (2,'cupom used com used_at nulo','recusa pelo trigger (sem data de uso)',
      sqlstate||' '||left(sqlerrm,60),'CONFERIR -- barrou por outro motivo');
end $$;

-- ===== 3: cupom de outra parceria => trigger =====
do $$
begin
  insert into public.settlement_items(settlement_id, coupon_id, valor)
  values ('00000000-0000-0000-0031-000000000b03','00000000-0000-0000-0031-000000000103',10);
  insert into r values (3,'cupom de outra parceria','recusa pelo trigger (outra parceria)',
                        'INSERIU','FALHOU -- trigger ausente ou frouxo');
exception
  when raise_exception then
    insert into r values (3,'cupom de outra parceria','recusa pelo trigger (outra parceria)',
      sqlstate||' '||left(sqlerrm,70),
      case when sqlerrm like '%outra parceria%' then 'OK' else 'CONFERIR -- trigger recusou por outro motivo' end);
  when undefined_table then
    insert into r values (3,'cupom de outra parceria','recusa pelo trigger','tabela nao existe','FALHOU -- migration 031 nao aplicada');
  when others then
    insert into r values (3,'cupom de outra parceria','recusa pelo trigger (outra parceria)',
      sqlstate||' '||left(sqlerrm,60),'CONFERIR -- barrou por outro motivo');
end $$;

-- ===== 4: cupom verified = false => trigger =====
do $$
begin
  insert into public.settlement_items(settlement_id, coupon_id, valor)
  values ('00000000-0000-0000-0031-000000000b04','00000000-0000-0000-0031-000000000104',10);
  insert into r values (4,'cupom nao conferido (verified=false)','recusa pelo trigger (nao conferido)',
                        'INSERIU','FALHOU -- trigger ausente ou frouxo');
exception
  when raise_exception then
    insert into r values (4,'cupom nao conferido (verified=false)','recusa pelo trigger (nao conferido)',
      sqlstate||' '||left(sqlerrm,70),
      case when sqlerrm like '%nao conferido%' then 'OK' else 'CONFERIR -- trigger recusou por outro motivo' end);
  when undefined_table then
    insert into r values (4,'cupom nao conferido (verified=false)','recusa pelo trigger','tabela nao existe','FALHOU -- migration 031 nao aplicada');
  when others then
    insert into r values (4,'cupom nao conferido (verified=false)','recusa pelo trigger (nao conferido)',
      sqlstate||' '||left(sqlerrm,60),'CONFERIR -- barrou por outro motivo');
end $$;

-- ===== 5: status 'pago' sem paid_at / sem forma / forma em branco => check =====
-- tipo 'fixo' de propósito: assim a regra do período da comissão não interfere.
do $$
declare cn text;
begin
  begin
    insert into public.settlements(partnership_id, tipo, status, valor, forma)
    values ('00000000-0000-0000-0031-000000000a01','fixo','pago',10,'pix');
    insert into r values (5,'pago sem paid_at','23514 settlements_pago_exige_dados','INSERIU','FALHOU -- check ausente');
  exception when check_violation then
    get stacked diagnostics cn = constraint_name;
    insert into r values (5,'pago sem paid_at','23514 settlements_pago_exige_dados','23514 '||coalesce(cn,'?'),
      case when cn = 'settlements_pago_exige_dados' then 'OK' else 'CONFERIR -- outra constraint barrou' end);
  end;
  begin
    insert into public.settlements(partnership_id, tipo, status, valor, paid_at)
    values ('00000000-0000-0000-0031-000000000a01','fixo','pago',10,now());
    insert into r values (5.1,'pago sem forma','23514 settlements_pago_exige_dados','INSERIU','FALHOU -- check ausente');
  exception when check_violation then
    get stacked diagnostics cn = constraint_name;
    insert into r values (5.1,'pago sem forma','23514 settlements_pago_exige_dados','23514 '||coalesce(cn,'?'),
      case when cn = 'settlements_pago_exige_dados' then 'OK' else 'CONFERIR -- outra constraint barrou' end);
  end;
  begin
    insert into public.settlements(partnership_id, tipo, status, valor, paid_at, forma)
    values ('00000000-0000-0000-0031-000000000a01','fixo','pago',10,now(),'   ');
    insert into r values (5.2,'pago com forma em branco','23514 settlements_pago_exige_dados','INSERIU','FALHOU -- check ausente');
  exception when check_violation then
    get stacked diagnostics cn = constraint_name;
    insert into r values (5.2,'pago com forma em branco','23514 settlements_pago_exige_dados','23514 '||coalesce(cn,'?'),
      case when cn = 'settlements_pago_exige_dados' then 'OK' else 'CONFERIR -- outra constraint barrou' end);
  end;
  begin
    insert into public.settlements(partnership_id, tipo, valor)
    values ('00000000-0000-0000-0031-000000000a01','comissao',10);
    insert into r values (5.3,'comissao sem periodo','23514 settlements_comissao_exige_periodo','INSERIU','FALHOU -- check ausente');
  exception when check_violation then
    get stacked diagnostics cn = constraint_name;
    insert into r values (5.3,'comissao sem periodo','23514 settlements_comissao_exige_periodo','23514 '||coalesce(cn,'?'),
      case when cn = 'settlements_comissao_exige_periodo' then 'OK' else 'CONFERIR -- outra constraint barrou' end);
  end;
exception
  when undefined_table then
    insert into r values (5,'checks de settlements','23514','tabela nao existe','FALHOU -- migration 031 nao aplicada');
  when others then
    insert into r values (5,'checks de settlements','23514',
      sqlstate||' '||left(sqlerrm,60),'CONFERIR -- falhou por outro motivo');
end $$;

-- ===== 6: apagar parceria que tem lançamento => restrict =====
-- P6 só tem um lançamento e nenhum cupom: o 23503 só pode vir do livro.
do $$
declare cn text;
begin
  delete from public.partnerships where id = '00000000-0000-0000-0031-000000000a03';
  insert into r values (6,'apagar parceria com lancamento','23503 settlements_partnership_id_fkey',
                        'APAGOU','FALHOU -- livro perde a referencia de quem foi pago');
exception
  when foreign_key_violation then
    get stacked diagnostics cn = constraint_name;
    insert into r values (6,'apagar parceria com lancamento','23503 settlements_partnership_id_fkey',
      '23503 '||coalesce(cn,'?'),
      case when cn = 'settlements_partnership_id_fkey' then 'OK' else 'CONFERIR -- outra FK barrou' end);
  when undefined_table then
    insert into r values (6,'apagar parceria com lancamento','23503','tabela nao existe','FALHOU -- migration 031 nao aplicada');
  when others then
    insert into r values (6,'apagar parceria com lancamento','23503',
      sqlstate||' '||left(sqlerrm,60),'CONFERIR -- falhou por outro motivo');
end $$;

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
exception
  when undefined_table then
    insert into r values (7,'fechar, incluir 2 cupons validos, pagar (controle positivo)','funciona',
      'tabela nao existe','FALHOU -- migration 031 nao aplicada');
  when others then
    insert into r values (7,'fechar, incluir 2 cupons validos, pagar (controle positivo)','funciona',
      sqlstate||' '||left(sqlerrm,70),'FALHOU -- a 031 barrou o caminho legitimo');
end $$;

-- ===== 8: lojista (moderator) lendo e escrevendo: nada =====
reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0031-0000000000e1","role":"authenticated"}', true);

do $$
declare n int;
begin
  select count(*) into n from public.settlements
   where id = '00000000-0000-0000-0031-000000000b08';
  insert into r values (8,'lojista lendo settlements (existe 1 linha para admin)','0 linhas',
    n||' linhas', case when n = 0 then 'OK' else 'FALHOU -- lojista enxerga o livro' end);
exception
  when insufficient_privilege then
    insert into r values (8,'lojista lendo settlements','0 linhas','42501 sem grant','CONFERIR -- esperava 0 linhas por RLS');
  when undefined_table then
    insert into r values (8,'lojista lendo settlements','0 linhas','tabela nao existe','FALHOU -- migration 031 nao aplicada');
end $$;

do $$
begin
  insert into public.settlements(partnership_id, tipo, valor)
  values ('00000000-0000-0000-0031-000000000a01','fixo',1);
  insert into r values (8.1,'lojista inserindo em settlements','42501 violacao de RLS','INSERIU','FALHOU -- lojista escreve no livro');
exception
  when insufficient_privilege then
    insert into r values (8.1,'lojista inserindo em settlements','42501 violacao de RLS','42501','OK');
  when others then
    insert into r values (8.1,'lojista inserindo em settlements','42501 violacao de RLS',
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
  select count(*) into n from public.settlements
   where id = '00000000-0000-0000-0031-000000000b09';
  insert into r values (9,'influenciador lendo settlements (existe 1 linha para admin)','0 linhas',
    n||' linhas', case when n = 0 then 'OK' else 'FALHOU -- influenciador enxerga o livro' end);
exception
  when insufficient_privilege then
    insert into r values (9,'influenciador lendo settlements','0 linhas','42501 sem grant','CONFERIR -- esperava 0 linhas por RLS');
  when undefined_table then
    insert into r values (9,'influenciador lendo settlements','0 linhas','tabela nao existe','FALHOU -- migration 031 nao aplicada');
end $$;

do $$
begin
  insert into public.settlements(partnership_id, tipo, valor)
  values ('00000000-0000-0000-0031-000000000a01','fixo',1);
  insert into r values (9.1,'influenciador inserindo em settlements','42501 violacao de RLS','INSERIU','FALHOU -- influenciador escreve no livro');
exception
  when insufficient_privilege then
    insert into r values (9.1,'influenciador inserindo em settlements','42501 violacao de RLS','42501','OK');
  when others then
    insert into r values (9.1,'influenciador inserindo em settlements','42501 violacao de RLS',
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
  select count(*) into n from public.settlements
   where id = '00000000-0000-0000-0031-000000000b10';
  insert into r values (10,'financeiro lendo settlements','1 linha',
    n||' linhas', case when n = 1 then 'OK' else 'FALHOU -- financeiro nao enxerga o livro' end);
exception when others then
  insert into r values (10,'financeiro lendo settlements','1 linha',
    sqlstate||' '||left(sqlerrm,60),'FALHOU');
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

reset role;
select * from r order by ordem;

rollback;
