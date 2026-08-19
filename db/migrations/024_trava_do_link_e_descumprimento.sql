-- A trava do link e a cascata do descumprimento.
--
-- O aceite passa a morar TAMBEM na parceria. A fonte da verdade continua sendo
-- `contracts`, que guarda o texto congelado e a prova; aqui fica so a data.
-- Motivo: a regra do link e chamada em sete lugares, e todos ja tem a parceria
-- em maos. Sem isso, cada um precisaria de uma consulta a mais.
--
-- E o descumprimento. O sistema NAO percebe post apagado -- o Instagram nao
-- avisa ninguem, e nao vamos varrer perfil de terceiro. Quem percebe, registra;
-- so a partir dai a cascata e automatica.
--
-- A regra do Cesar, de 19/08: apagou o conteudo, encerra tudo, a comissao das
-- vendas ja confirmadas CONTINUA devida porque a moto foi vendida, e so o fee
-- volta -- a contrapartida dele era manter o conteudo no ar.
--
-- Aplicada em 2026-08-19.

alter table public.partnerships
  add column if not exists contract_accepted_at timestamptz;

alter table public.contracts
  add column if not exists fee_a_restituir numeric;

create or replace function public.portal_aceitar_contrato(p_ip text, p_agent text)
returns void language plpgsql security definer set search_path to 'public'
as $$
declare meu uuid := public.meu_influencer_id(); alvo uuid;
begin
  if meu is null then raise exception 'sem permissao'; end if;

  update public.contracts c
     set status = 'aceito', accepted_at = now(),
         accepted_ip = p_ip, accepted_user_agent = p_agent
    from public.partnerships p
   where p.id = c.partnership_id and p.influencer_id = meu
     and p.status = 'ativa' and c.status = 'aguardando'
  returning c.partnership_id into alvo;

  if alvo is null then raise exception 'nao ha contrato aguardando aceite'; end if;

  update public.partnerships set contract_accepted_at = now() where id = alvo;
end $$;

create or replace function public.registrar_descumprimento(p_contrato uuid)
returns void language plpgsql security definer set search_path to 'public'
as $$
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

  update public.partnerships
     set status = 'encerrada',
         ends_at = least(coalesce(ends_at, current_date), current_date),
         contract_accepted_at = null
   where id = alvo;
end $$;

revoke all on function public.portal_aceitar_contrato(text,text) from public;
revoke all on function public.registrar_descumprimento(uuid) from public;
grant execute on function public.portal_aceitar_contrato(text,text) to authenticated;
grant execute on function public.registrar_descumprimento(uuid) to authenticated;
