-- 033 — O fixo e a restituição nascem sozinhos como conta a pagar.
--
-- POR QUE EXISTE
--
-- Depois da 031 o livro (`settlements`) sabe registrar comissão, fixo e
-- restituição, mas só a comissão tem quem a crie (o fechamento do Financeiro).
-- O `fee_amount` da parceria e o `fee_a_restituir` do contrato descumprido
-- continuavam sendo números soltos: ninguém era lembrado de pagar o fixo nem de
-- cobrar a restituição. Nascer `aberto` é uma conta a pagar APARECENDO; fechar
-- um ciclo continua sendo decisão do Financeiro. O fixo já está no contrato no
-- instante em que a parceria existe -- não há o que decidir, só o que lembrar.
--
-- O QUE FAZ
--
--   * Trigger `after insert or update of fee_amount on partnerships`: se o novo
--     `fee_amount > 0` e a parceria AINDA NÃO TEM lançamento `fixo` em nenhum
--     status, insere 1
--     lançamento `tipo 'fixo'`, `status 'aberto'`, `valor = fee_amount`.
--     É regra de DADO, não de identidade: dispara também para service_role e
--     SQL Editor (auth.uid() nulo). Por isso NÃO há bypass de auth.uid().
--     `security definer` com search_path fixo: a RLS de `settlements` é só
--     admin/finance, e quem cria a parceria não pode ser barrado por ela.
--   * `registrar_descumprimento(uuid)` ganha, depois do update do contrato, a
--     inserção do lançamento `tipo 'restituicao'`, `status 'aberto'`,
--     `valor = fee` -- SOMENTE quando `fee > 0`.
--
-- O QUE NÃO FAZ
--
--   * Nenhum retroativo. Nada é varrido ao aplicar: as parcerias encerradas
--     com fee_amount 500 só ganham fixo se alguém EDITAR o fee_amount delas, e
--     as 3 ativas têm fee_amount 0 (o valor chega a elas por UPDATE, em
--     influencer-save; o INSERT só acontece na renovação).
--   * NÃO ajusta um fixo existente. O fixo nasce UMA vez; mudar o fee depois
--     NÃO altera o lançamento já criado -- isso é decisão humana, na tela do
--     Financeiro (Task 6).
--   * A partir daqui, parceria com fee não pode mais ser apagada:
--     `settlements_partnership_id_fkey` é `on delete restrict` e
--     influencers -> partnerships é `on delete cascade`, então apagar um
--     influenciador assim falha com 23503. Nenhuma rota do app apaga
--     influenciador; só morde no painel do Supabase.
--   * `registrar_descumprimento` continua só para quem tem sessão de admin:
--     service_role (auth.uid() nulo) é recusado de propósito. A rota
--     app/api/admin/contracts chama com a sessão do admin (createClient), não
--     com a chave de serviço. Desde a 024 a chamada via service_role falhava
--     sempre com 'apenas admin'.
--   * `fee_timing` fica de fora: diz quando o fixo VENCE (alimenta o aviso da
--     tarefa 8), não cria nem paga nada.
--   * A função continua com `if not public.is_admin()` e com
--     `fee_a_restituir = nullif(fee, 0)` exatamente como estavam (024).
--
-- POR QUE `fee > 0` NA RESTITUIÇÃO (não é detalhe)
--
-- `nullif(fee, 0)` é NULL quando o fixo é zero, e `settlements.valor` é
-- `not null`. Inserir sem a guarda abortaria a função INTEIRA: o contrato não
-- viraria 'descumprido' e a parceria não seria encerrada. O único contrato
-- aceito hoje no banco tem fee_amount 0 -- sem a guarda, o descumprimento dele
-- ficaria impossível.
--
-- Verificação: scripts/verifica-033.sql (tudo em begin/rollback).
--
-- PARA DESFAZER (o corpo antigo da função é o da migration 024):
--
--   drop trigger if exists partnerships_gera_fixo on public.partnerships;
--   drop function if exists public.partnerships_gera_fixo();
--
--   create or replace function public.registrar_descumprimento(p_contrato uuid)
--   returns void language plpgsql security definer set search_path to 'public'
--   as $$
--   declare alvo uuid; fee numeric;
--   begin
--     if not public.is_admin() then raise exception 'apenas admin'; end if;
--     select c.partnership_id, p.fee_amount into alvo, fee
--       from public.contracts c join public.partnerships p on p.id = c.partnership_id
--      where c.id = p_contrato and c.status = 'aceito';
--     if alvo is null then raise exception 'contrato nao esta aceito'; end if;
--     update public.contracts
--        set status = 'descumprido', fee_a_restituir = nullif(fee, 0)
--      where id = p_contrato;
--     update public.partnerships
--        set status = 'encerrada',
--            ends_at = least(coalesce(ends_at, current_date), current_date),
--            contract_accepted_at = null
--      where id = alvo;
--   end $$;
--
-- (os lançamentos já criados por estas regras ficam no livro; apague-os à mão
-- se for o caso, só os 'aberto' -- lançamento pago é imutável.)

create or replace function public.partnerships_gera_fixo()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  if coalesce(new.fee_amount, 0) > 0
     and not exists (select 1 from public.settlements
                      where partnership_id = new.id and tipo = 'fixo') then
    insert into public.settlements(partnership_id, tipo, status, valor, created_by)
    values (new.id, 'fixo', 'aberto', new.fee_amount, 'partnerships_gera_fixo');
  end if;
  return new;
end;
$fn$;

drop trigger if exists partnerships_gera_fixo on public.partnerships;
create trigger partnerships_gera_fixo
  after insert or update of fee_amount on public.partnerships
  for each row execute function public.partnerships_gera_fixo();

create or replace function public.registrar_descumprimento(p_contrato uuid)
returns void language plpgsql security definer set search_path to 'public'
as $function$
declare alvo uuid; fee numeric;
begin
  if not public.is_admin() then raise exception 'apenas admin'; end if;

  select c.partnership_id, p.fee_amount into alvo, fee
    from public.contracts c join public.partnerships p on p.id = c.partnership_id
   where c.id = p_contrato and c.status = 'aceito';

  if alvo is null then raise exception 'contrato nao esta aceito'; end if;

  update public.contracts
     set status = 'descumprido', fee_a_restituir = nullif(fee, 0)
   where id = p_contrato;

  -- Restituição a cobrar: só existe se havia fixo. Com fee 0/nulo o valor seria
  -- nulo e violaria `settlements.valor not null`, abortando o descumprimento.
  if fee > 0 then
    insert into public.settlements(partnership_id, tipo, status, valor, created_by)
    values (alvo, 'restituicao', 'aberto', fee, 'registrar_descumprimento');
  end if;

  update public.partnerships
     set status = 'encerrada',
         ends_at = least(coalesce(ends_at, current_date), current_date),
         contract_accepted_at = null
   where id = alvo;
end $function$;
