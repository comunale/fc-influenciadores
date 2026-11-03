-- Verificação da migration 030 — escalada de privilégio em admin_profiles.
--
-- Rodar no SQL Editor do Supabase. NÃO altera nada: tudo acontece dentro de
-- begin/rollback, inclusive as contas de teste no auth.users.
--
-- O editor avisa "creates tables without enabling RLS": é falso positivo. As
-- duas tabelas são `create temp table`, vivem em pg_temp, não são expostas pelo
-- PostgREST e somem no rollback. Escolher "Run without RLS" -- "Run and enable
-- RLS" ligaria RLS na tabela de resultados, que é escrita pelo papel
-- authenticated, e o teste passaria a medir a si mesmo.
--
-- Por que o teste é assim, versão curta de dois erros reais de 03/11/2026:
--
--   1. A primeira tentativa de provar a brecha usou UID inexistente, e os três
--      casos deram "bloqueado" -- mas pela CHAVE ESTRANGEIRA para auth.users,
--      não pela política. Falso negativo que diz "está seguro". Por isso as
--      contas são criadas de verdade na transação, e o teste confere o SQLSTATE
--      (42501 = violação de RLS) em vez de só "falhou".
--
--   2. A primeira versão deste script usava o MESMO UID no teste da escalada e
--      no controle positivo. Com a brecha aberta, a escalada insere a linha e o
--      controle positivo morre de chave duplicada, acusando a migration de
--      quebrar a criação de usuários -- quando ela nem estava aplicada. Cada
--      teste agora tem a sua própria conta, e o controle positivo não depende
--      do resultado de ninguém.

begin;

create temp table r(ordem int, teste text, esperado text, obtido text, veredito text);
grant select, insert on r to authenticated, anon;

-- O admin de verdade, lido do banco para não gravar uuid neste arquivo.
create temp table adm as
  select id from public.admin_profiles where role = 'admin' and active = true limit 1;
grant select on adm to authenticated;

-- Duas contas distintas: a do invasor e a que o admin vai criar.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values ('00000000-0000-0000-0000-0000000000aa','00000000-0000-0000-0000-000000000000',
        'authenticated','authenticated','teste-030-invasor@exemplo.invalido','x', now(), now(), now()),
       ('00000000-0000-0000-0000-0000000000cc','00000000-0000-0000-0000-000000000000',
        'authenticated','authenticated','teste-030-legitimo@exemplo.invalido','x', now(), now(), now());

-- ===== 1: a escalada tem de falhar, e falhar PELA POLÍTICA =====
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000aa","role":"authenticated"}', true);

do $$
begin
  insert into public.admin_profiles(id,name,email,role,active)
  values ('00000000-0000-0000-0000-0000000000aa','teste invasor',
          'teste-030-invasor@exemplo.invalido','admin',true);
  insert into r values (1,'conta nova se insere como admin','bloqueado pela politica',
                        'INSERIU','FALHOU -- BRECHA ABERTA, rode a migration 030');
exception
  when insufficient_privilege then
    insert into r values (1,'conta nova se insere como admin','bloqueado pela politica',
                          '42501 violacao de RLS','OK');
  when others then
    insert into r values (1,'conta nova se insere como admin','bloqueado pela politica',
                          sqlstate||' '||left(sqlerrm,60),'CONFERIR -- barrou por outro motivo');
end $$;

-- ===== 2: o ramo do setup não pode dar true para quem não tem perfil =====
do $$
declare ramo1 boolean; visiveis int;
begin
  select public.sem_nenhum_perfil() into ramo1;
  select count(*) into visiveis from public.admin_profiles;
  insert into r values (2,'ramo do setup (sem_nenhum_perfil) para conta nova','false',
    ramo1::text||' (a conta ve '||visiveis||' linhas via RLS)',
    case when ramo1 then 'FALHOU -- ramo do setup ainda libera' else 'OK' end);
exception when undefined_function then
  insert into r values (2,'ramo do setup (sem_nenhum_perfil) para conta nova','false',
                        'funcao nao existe','FALHOU -- migration 030 nao foi aplicada');
end $$;

-- ===== 3: controle POSITIVO — admin ativo cria perfil, em conta só dele =====
reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub',(select id from adm),'role','authenticated')::text, true);

do $$
begin
  insert into public.admin_profiles(id,name,email,role,active)
  values ('00000000-0000-0000-0000-0000000000cc','teste moderador',
          'teste-030-legitimo@exemplo.invalido','moderator',true);
  insert into r values (3,'admin ativo cria perfil (controle positivo)','funciona','INSERIU','OK');
exception
  when insufficient_privilege then
    insert into r values (3,'admin ativo cria perfil (controle positivo)','funciona',
                          '42501 violacao de RLS','FALHOU -- a 030 quebrou a criacao de usuarios');
  when others then
    insert into r values (3,'admin ativo cria perfil (controle positivo)','funciona',
                          sqlstate||' '||left(sqlerrm,60),'CONFERIR -- falhou por outro motivo');
end $$;

reset role;
select * from r order by ordem;

rollback;
