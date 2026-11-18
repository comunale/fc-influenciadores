-- Verificação da migration 036 — Programa de Indicação.
--
-- Rodar no SQL Editor do Supabase, "Run without RLS" (ver verifica-031.sql: o
-- aviso de tabela sem RLS é falso positivo, `r` é temporária). NÃO altera
-- nada: tudo acontece dentro de begin/rollback.
--
-- Mesmas lições do verifica-031/033/034/035: cada caso confere SQLSTATE e o
-- MOTIVO (pg_temp.tenta), e cada caso usa as suas PRÓPRIAS fixtures.
--
-- A RODADA ANTES DA MIGRAÇÃO
--
-- Este script é diferente dos anteriores: 14 dos 16 casos testam objetos que a
-- 036 CRIA (tabela indicadores, colunas indicador_id/indicador_cpf, os três
-- CHECKs novos, o vínculo de três casos em admin_profiles). Antes da migração
-- não há o que ficar vermelho — não existe sequer onde inserir. Então a prova
-- da rodada "antes" é a exceção nomeada do guard abaixo:
--
--   "036 NAO aplicada: tabela public.indicadores nao existe."
--
-- Se você rodar antes da migração e receber QUALQUER OUTRA COISA, pare: ou a
-- migração já foi aplicada, ou o script está olhando para outro banco.
-- Depois da migração: 16 de 16 OK.
--
-- Casos: 1 cupom com os dois donos; 2 cupom sem dono; 3 autoindicação;
-- 4 indicador sem o CPF desnormalizado; 5 cupom de indicação válido (sem
-- e-mail e sem vencimento) passa; 6 cupom de influenciador como hoje passa
-- (nada regrediu); 7 cadastro sem aceite dos termos; 8 encerrado sem data;
-- 9 teto zero; 10 CPF repetido em indicadores; 11 perfil 'indicador' sem
-- indicador_id; 12 perfil 'indicador' com influencer_id também; 13 perfil
-- 'admin' com indicador_id; 13.1 perfil de influenciador VIRA indicador e isso
-- é permitido; 14 dois cupons do mesmo CPF na campanha do programa; 15 duas
-- notas fiscais iguais (o indice ja existia: coupons_invoice_number_unico; a 036
-- criou um duplicado por engano, e o caso confere a UNICIDADE, nao o nome).

begin;

create temp table r(ordem numeric, teste text, esperado text, obtido text, veredito text);

do $$ begin
  if to_regclass('public.indicadores') is null then
    raise exception '036 NAO aplicada: tabela public.indicadores nao existe. Esta e a resposta esperada na rodada ANTES da migracao.';
  end if;
  if not exists (select 1 from public.campaigns where name = 'Programa de Indicação') then
    raise exception '036 incompleta: a campanha Programa de Indicacao nao foi criada';
  end if;
  if not exists (select 1 from public.influencers) then
    raise exception 'fixture influencers vazio: nao ha influenciador para o caso 6';
  end if;
  if not exists (select 1 from public.admin_profiles where role = 'admin') then
    raise exception 'fixture admin_profiles vazio: nao ha perfil admin para os casos 11 e 13';
  end if;
  if not exists (select 1 from public.admin_profiles where role = 'influencer') then
    raise exception 'fixture admin_profiles vazio: nao ha perfil de influenciador para os casos 12 e 13.1';
  end if;
end $$;

-- ---------- auxiliares (só existem durante a transação) ----------

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

-- ---------- fixtures ----------

create temp table camp as
  select id from public.campaigns where name = 'Programa de Indicação' limit 1;
create temp table inf as
  select id from public.influencers limit 1;
create temp table perfil_admin as
  select id from public.admin_profiles where role = 'admin' limit 1;
create temp table perfil_infl as
  select id from public.admin_profiles where role = 'influencer' limit 1;

insert into public.indicadores
  (id, nome, cpf, telefone, sexo, data_nascimento, codigo, aceite_termos)
values
  ('00000000-0000-0000-0036-000000000001', 'Teste 036 Um',   '99900360001',
   '11999990001', 'F', '1990-01-01', 'IND-T36001', true),
  ('00000000-0000-0000-0036-000000000002', 'Teste 036 Dois', '99900360002',
   '11999990002', 'M', '1990-01-01', 'IND-T36002', true);

-- ---------- cupom: quem é o dono ----------

select pg_temp.tenta(1, 'cupom com influencer_id E indicador_id', 'recusa coupons_dono_unico',
  $q$insert into public.coupons (campaign_id, coupon_number, customer_name, customer_cpf,
        customer_phone, influencer_id, indicador_id, indicador_cpf)
     select (select id from camp), 'T036-1', 'Cliente Um', '99900361001', '11999991001',
            (select id from inf), '00000000-0000-0000-0036-000000000001', '99900360001'$q$,
  '23514', 'coupons_dono_unico');

select pg_temp.tenta(2, 'cupom sem influencer_id e sem indicador_id', 'recusa coupons_dono_unico',
  $q$insert into public.coupons (campaign_id, coupon_number, customer_name, customer_cpf,
        customer_phone)
     select (select id from camp), 'T036-2', 'Cliente Dois', '99900362001', '11999992001'$q$,
  '23514', 'coupons_dono_unico');

select pg_temp.tenta(3, 'autoindicacao: indicador_cpf = customer_cpf',
  'recusa coupons_sem_autoindicacao',
  $q$insert into public.coupons (campaign_id, coupon_number, customer_name, customer_cpf,
        customer_phone, indicador_id, indicador_cpf)
     select (select id from camp), 'T036-3', 'Teste 036 Um', '99900360001', '11999990001',
            '00000000-0000-0000-0036-000000000001', '99900360001'$q$,
  '23514', 'coupons_sem_autoindicacao');

select pg_temp.tenta(4, 'cupom de indicacao sem o CPF do indicador',
  'recusa coupons_indicacao_coerente',
  $q$insert into public.coupons (campaign_id, coupon_number, customer_name, customer_cpf,
        customer_phone, indicador_id)
     select (select id from camp), 'T036-4', 'Cliente Quatro', '99900364001', '11999994001',
            '00000000-0000-0000-0036-000000000001'$q$,
  '23514', 'coupons_indicacao_coerente');

-- ---------- cupom: o que TEM de passar ----------

select pg_temp.nao_levanta(5, 'cupom de indicacao sem e-mail e sem vencimento',
  $q$insert into public.coupons (campaign_id, coupon_number, customer_name, customer_cpf,
        customer_phone, indicador_id, indicador_cpf, discount_type, discount_value,
        commission_per_sale)
     select (select id from camp), 'T036-5', 'Cliente Cinco', '99900365001', '11999995001',
            '00000000-0000-0000-0036-000000000001', '99900360001', 'fixed', 300, 200$q$);

select pg_temp.nao_levanta(6, 'cupom de influenciador como hoje, com NF',
  $q$insert into public.coupons (campaign_id, coupon_number, customer_name, customer_cpf,
        customer_phone, customer_email, expires_at, influencer_id, invoice_number)
     select (select id from camp), 'T036-6', 'Cliente Seis', '99900366001', '11999996001',
            'seis@exemplo.com', now() + interval '30 days', (select id from inf),
            'NF-T036-9999'$q$);

-- ---------- cadastro do indicador ----------

select pg_temp.tenta(7, 'cadastro sem aceite dos termos', 'recusa o aceite obrigatorio',
  $q$insert into public.indicadores (nome, cpf, telefone, sexo, data_nascimento, codigo,
        aceite_termos)
     values ('Sem Aceite', '99900367001', '11999997001', 'F', '1990-01-01', 'IND-T36007', false)$q$,
  '23514', 'aceite_termos');

select pg_temp.tenta(8, 'encerrado sem data de encerramento',
  'recusa indicadores_encerramento_coerente',
  $q$insert into public.indicadores (nome, cpf, telefone, sexo, data_nascimento, codigo,
        aceite_termos, ativo)
     values ('Sem Data', '99900368001', '11999998001', 'F', '1990-01-01', 'IND-T36008', true, false)$q$,
  '23514', 'indicadores_encerramento_coerente');

select pg_temp.tenta(9, 'teto de usos igual a zero', 'recusa o teto',
  $q$insert into public.indicadores (nome, cpf, telefone, sexo, data_nascimento, codigo,
        aceite_termos, teto_usos)
     values ('Teto Zero', '99900369001', '11999999001', 'F', '1990-01-01', 'IND-T36009', true, 0)$q$,
  '23514', 'teto_usos');

select pg_temp.tenta(10, 'dois indicadores com o mesmo CPF', 'recusa indicadores_cpf_key',
  $q$insert into public.indicadores (nome, cpf, telefone, sexo, data_nascimento, codigo,
        aceite_termos)
     values ('CPF Repetido', '99900360001', '11999990003', 'F', '1990-01-01', 'IND-T36010', true)$q$,
  '23505', 'indicadores_cpf_key');

-- ---------- vínculo do perfil ----------

select pg_temp.tenta(11, 'perfil indicador sem indicador_id',
  'recusa admin_profiles_vinculo_coerente',
  $q$update public.admin_profiles set role = 'indicador'
      where id = (select id from perfil_admin)$q$,
  '23514', 'admin_profiles_vinculo_coerente');

select pg_temp.tenta(12, 'perfil indicador com influencer_id tambem',
  'recusa admin_profiles_vinculo_coerente',
  $q$update public.admin_profiles
        set role = 'indicador', indicador_id = '00000000-0000-0000-0036-000000000001'
      where id = (select id from perfil_infl)$q$,
  '23514', 'admin_profiles_vinculo_coerente');

select pg_temp.tenta(13, 'perfil admin com indicador_id',
  'recusa admin_profiles_vinculo_coerente',
  $q$update public.admin_profiles
        set indicador_id = '00000000-0000-0000-0036-000000000001'
      where id = (select id from perfil_admin)$q$,
  '23514', 'admin_profiles_vinculo_coerente');

select pg_temp.nao_levanta(13.1, 'perfil de influenciador vira indicador: permitido',
  $q$update public.admin_profiles
        set role = 'indicador', influencer_id = null,
            indicador_id = '00000000-0000-0000-0036-000000000002'
      where id = (select id from perfil_infl)$q$);

-- ---------- unicidades que já existiam, e a que entrou agora ----------

select pg_temp.tenta(14, 'dois cupons do mesmo CPF na campanha do programa',
  'recusa coupons_customer_cpf_campaign_id_key',
  $q$insert into public.coupons (campaign_id, coupon_number, customer_name, customer_cpf,
        customer_phone, indicador_id, indicador_cpf)
     select (select id from camp), 'T036-14', 'Cliente Cinco de Novo', '99900365001',
            '11999995001', '00000000-0000-0000-0036-000000000002', '99900360002'$q$,
  '23505', 'coupons_customer_cpf_campaign_id_key');

select pg_temp.tenta(15, 'duas notas fiscais iguais', 'recusa a unicidade de invoice_number',
  $q$insert into public.coupons (campaign_id, coupon_number, customer_name, customer_cpf,
        customer_phone, customer_email, expires_at, influencer_id, invoice_number)
     select (select id from camp), 'T036-15', 'Cliente Quinze', '99900365015', '11999995015',
            'quinze@exemplo.com', now() + interval '30 days', (select id from inf),
            'NF-T036-9999'$q$,
  '23505', 'invoice_number');

-- Resumo. 16 casos: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 13.1, 14, 15 = 16.
-- (recontar se casos mudarem)
--
-- O RESUMO tem de ser o ÚLTIMO insert em `r`, depois de TODOS os casos: ele
-- conta o que já está na tabela. Em 13/11 isso foi violado no verifica-035 e o
-- resumo passou a contar menos casos do que exigia. E o `select * from r`
-- abaixo é a última instrução do arquivo — é o que você lê.
insert into r
select 999, 'RESUMO', 'total 16, nenhum nao-OK',
       count(*) || ' linhas, ' || count(*) filter (where veredito not like 'OK%') || ' nao-OK',
       case when count(*) = 16 and count(*) filter (where veredito not like 'OK%') = 0
            then 'OK' else 'FALHOU -- linhas faltando ou casos nao-OK' end
  from r;

select * from r order by ordem;

rollback;
