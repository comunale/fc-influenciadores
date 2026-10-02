-- A ficha do influenciador.
--
-- O César leu a tela de cadastro e disse o que ela é: "muito voltado para os
-- cupons e pouco para um cadastro mesmo". Estava certo -- `influencers` tem 7
-- colunas e só três falam da pessoa: nome, @ e ativo. O resto é cupom e acordo.
--
-- Os campos novos NÃO vão para `influencers`, e o motivo é concreto: o lookup do
-- balcão (`/api/admin/influencer-lookup`) faz `select('*')` com a sessão do
-- Lojista. Observação de negociação ali é observação na mão do vendedor.
--
-- Vão para a tabela que já era só do admin. E ela deixa de se chamar
-- `influencer_contract_data`, porque passa a guardar telefone, cidade, nicho e
-- seguidores -- que não são dados de contrato. Um nome que mente é a armadilha
-- que este projeto já carrega com `moderator` querendo dizer Lojista; não vale
-- criar a segunda.
--
-- As três funções do portal são recriadas porque a de salvar é plpgsql e cita a
-- tabela por NOME: o rename a quebraria em silêncio, e só estouraria na hora em
-- que um influenciador tentasse salvar os próprios dados.
--
-- Provado em transação com rollback, com a conta real da @mariannegimenes:
-- salvar funcionou depois do rename, falta_dados virou false, ela lê 0 da
-- tabela, o Lojista lê 0, e o admin lê 1.
--
-- Aplicada em 2026-10-02.

alter table public.influencer_contract_data rename to influencer_ficha;

alter table public.influencer_ficha
  add column if not exists telefone text,
  add column if not exists cidade text,
  add column if not exists nicho text,
  add column if not exists seguidores integer,
  add column if not exists observacoes text;

comment on table public.influencer_ficha is
  'A parte PRIVADA da ficha do influenciador: contato, qualificação e notas de '
  'negociação. Separada de `influencers` porque aquela é lida por todo papel '
  'interno, Lojista incluído, e com select(*).';

comment on column public.influencer_ficha.observacoes is
  'Notas livres da negociação. Nunca expor fora de admin e Financeiro.';

create or replace function public.portal_meu_contrato()
returns table (id uuid, corpo text, status text, accepted_at timestamptz, falta_dados boolean)
language sql stable security definer set search_path to 'public'
as $$
  select c.id, c.corpo, c.status, c.accepted_at,
         (d.cpf is null or btrim(d.cpf) = ''
          or d.endereco is null or btrim(d.endereco) = ''
          or d.estado_civil is null or btrim(d.estado_civil) = '') as falta_dados
    from public.contracts c
    join public.partnerships p on p.id = c.partnership_id
    left join public.influencer_ficha d on d.influencer_id = p.influencer_id
   where p.influencer_id = public.meu_influencer_id() and p.status = 'ativa';
$$;

create or replace function public.portal_meus_dados()
returns table (cpf text, estado_civil text, endereco text, cep text)
language sql stable security definer set search_path to 'public'
as $$
  select d.cpf, d.estado_civil, d.endereco, d.cep
    from public.influencer_ficha d
   where d.influencer_id = public.meu_influencer_id();
$$;

-- O influenciador escreve só os campos do contrato. Telefone, cidade, nicho,
-- seguidores e observações NÃO entram aqui de propósito: são anotações do César
-- sobre a parceria, não dados que o influenciador declara sobre si.
create or replace function public.portal_salvar_meus_dados(
  p_cpf text, p_estado_civil text, p_endereco text, p_cep text
) returns void language plpgsql security definer set search_path to 'public'
as $$
declare meu uuid := public.meu_influencer_id();
begin
  if meu is null then raise exception 'sem permissao'; end if;

  insert into public.influencer_ficha (influencer_id, cpf, estado_civil, endereco, cep)
  values (meu, btrim(p_cpf), btrim(p_estado_civil), btrim(p_endereco), btrim(p_cep))
  on conflict (influencer_id) do update
    set cpf = excluded.cpf, estado_civil = excluded.estado_civil,
        endereco = excluded.endereco, cep = excluded.cep, updated_at = now();
end $$;

-- Recriar função zera os grants: refaz o fechamento da migration 026.
revoke all on function public.portal_meu_contrato() from public, anon;
revoke all on function public.portal_meus_dados() from public, anon;
revoke all on function public.portal_salvar_meus_dados(text,text,text,text) from public, anon;
grant execute on function public.portal_meu_contrato() to authenticated;
grant execute on function public.portal_meus_dados() to authenticated;
grant execute on function public.portal_salvar_meus_dados(text,text,text,text) to authenticated;
