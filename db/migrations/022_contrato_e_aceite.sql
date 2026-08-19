-- Contrato e aceite: as tabelas e, principalmente, o jeito do influenciador
-- escrever sem ganhar acesso a tabela nenhuma.
--
-- O César liberou a escrita no portal em 19/08 com uma condição: "só separa do
-- restante para não ter problemas de segurança". A separação é esta: ele NÃO
-- recebe política de INSERT nem de UPDATE em lugar nenhum. Toda escrita passa
-- por função que descobre o dono pela sessão -- ele não consegue sequer nomear
-- a linha que quer alterar, porque o alvo não vem do pedido.
--
-- A função de aceite é a mais delicada do sistema. Ela grava situação, data,
-- IP e navegador, e nada mais. Não existe caminho que aceite um corpo de texto
-- vindo dele: um influenciador que edite o próprio contrato depois de gerado
-- destrói toda a prova que o contrato existe para produzir.
--
-- Aplicada em 2026-08-19.

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------

-- O modelo. Nunca editado no lugar: cada mudança nasce uma versão nova, porque
-- contrato antigo precisa continuar apontando para o texto de quando nasceu.
create table if not exists public.contract_templates (
  id uuid primary key default gen_random_uuid(),
  versao int not null,
  titulo text not null,
  corpo text not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid
);
create unique index if not exists contract_templates_versao on public.contract_templates (versao);

-- Dados de qualificação do influenciador: CPF, estado civil, endereço.
--
-- Tabela separada de propósito. `influencers` é lida por todo papel interno,
-- Lojista incluído -- e o Lojista não tem por que ver o endereço de ninguém.
create table if not exists public.influencer_contract_data (
  influencer_id uuid primary key references public.influencers(id) on delete cascade,
  cpf text,
  estado_civil text,
  endereco text,
  cep text,
  updated_at timestamptz not null default now()
);

create table if not exists public.contracts (
  id uuid primary key default gen_random_uuid(),
  partnership_id uuid not null references public.partnerships(id) on delete cascade,
  template_id uuid references public.contract_templates(id),
  template_versao int,
  -- O texto final, com os campos já preenchidos, guardado INTEIRO.
  -- É o que permite responder "o que exatamente ele aceitou" -- uma referência
  -- ao modelo não serviria, porque o modelo muda.
  corpo text not null,
  status text not null default 'rascunho'
    check (status in ('rascunho','aguardando','aceito','descumprido','cancelado')),
  imagem_meses int not null default 6,
  accepted_at timestamptz,
  accepted_ip text,
  accepted_user_agent text,
  created_at timestamptz not null default now()
);

-- Um contrato por parceria. Renovou, é parceria nova e contrato novo.
create unique index if not exists contracts_parceria_unico on public.contracts (partnership_id);

-- A trava do link. Nasce exigindo contrato.
alter table public.partnerships
  add column if not exists contract_required boolean not null default true;

-- Isenção das duas parcerias vigentes: os links delas já estão em bio e story
-- desde antes do contrato existir, e desligá-los para cobrar assinatura
-- retroativa quebraria divulgação no ar por decisão nossa. A trava protege link
-- NOVO, que ninguém ainda usou.
update public.partnerships p set contract_required = false
  from public.influencers i
 where i.id = p.influencer_id
   and i.instagram_handle in ('@caiiuxo','@mariananavi')
   and p.status = 'ativa';

-- ---------------------------------------------------------------------------
-- Quem alcança o quê
-- ---------------------------------------------------------------------------

alter table public.contracts enable row level security;
alter table public.contract_templates enable row level security;
alter table public.influencer_contract_data enable row level security;

-- Admin manda. O Financeiro lê -- precisa saber se há contrato aceito antes de
-- liberar pagamento -- e não edita.
drop policy if exists contracts_admin on public.contracts;
create policy contracts_admin on public.contracts
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists contracts_finance_read on public.contracts;
create policy contracts_finance_read on public.contracts
  for select to authenticated using (public.is_finance());

drop policy if exists templates_admin on public.contract_templates;
create policy templates_admin on public.contract_templates
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists dados_admin on public.influencer_contract_data;
create policy dados_admin on public.influencer_contract_data
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- O influenciador não ganha política nenhuma nestas três tabelas.
-- Tudo o que ele lê e escreve passa pelas funções abaixo.

-- ---------------------------------------------------------------------------
-- O que o influenciador pode fazer
-- ---------------------------------------------------------------------------

-- O contrato da parceria ATIVA dele. Parceria antiga não volta pelo portal:
-- o sistema começa agora (regra do César, 19/08).
create or replace function public.portal_meu_contrato()
returns table (
  id uuid, corpo text, status text, accepted_at timestamptz, falta_dados boolean
)
language sql stable security definer set search_path to 'public'
as $$
  select c.id, c.corpo, c.status, c.accepted_at,
         (d.cpf is null or btrim(d.cpf) = ''
          or d.endereco is null or btrim(d.endereco) = ''
          or d.estado_civil is null or btrim(d.estado_civil) = '') as falta_dados
    from public.contracts c
    join public.partnerships p on p.id = c.partnership_id
    left join public.influencer_contract_data d on d.influencer_id = p.influencer_id
   where p.influencer_id = public.meu_influencer_id()
     and p.status = 'ativa';
$$;

-- Os próprios dados, para o formulário já vir preenchido.
create or replace function public.portal_meus_dados()
returns table (cpf text, estado_civil text, endereco text, cep text)
language sql stable security definer set search_path to 'public'
as $$
  select d.cpf, d.estado_civil, d.endereco, d.cep
    from public.influencer_contract_data d
   where d.influencer_id = public.meu_influencer_id();
$$;

-- Escreve SÓ os dados dele. O alvo vem de meu_influencer_id(), nunca do pedido.
create or replace function public.portal_salvar_meus_dados(
  p_cpf text, p_estado_civil text, p_endereco text, p_cep text
) returns void
language plpgsql security definer set search_path to 'public'
as $$
declare meu uuid := public.meu_influencer_id();
begin
  if meu is null then
    raise exception 'sem permissao';
  end if;

  insert into public.influencer_contract_data (influencer_id, cpf, estado_civil, endereco, cep)
  values (meu, btrim(p_cpf), btrim(p_estado_civil), btrim(p_endereco), btrim(p_cep))
  on conflict (influencer_id) do update
    set cpf = excluded.cpf,
        estado_civil = excluded.estado_civil,
        endereco = excluded.endereco,
        cep = excluded.cep,
        updated_at = now();
end $$;

-- O aceite.
--
-- Grava situação, data, IP e navegador. Mais nada. Não recebe corpo de texto,
-- nem id de contrato: o contrato é descoberto pela sessão, então ele não
-- consegue aceitar o contrato de outra pessoa nem apontar para outro registro.
--
-- Só sai de 'aguardando'. Rascunho ainda não foi liberado pelo admin, e aceito
-- não se aceita duas vezes -- o segundo aceite sobrescreveria a data do
-- primeiro, que é justamente a prova.
create or replace function public.portal_aceitar_contrato(p_ip text, p_agent text)
returns void
language plpgsql security definer set search_path to 'public'
as $$
declare meu uuid := public.meu_influencer_id();
begin
  if meu is null then
    raise exception 'sem permissao';
  end if;

  update public.contracts c
     set status = 'aceito',
         accepted_at = now(),
         accepted_ip = p_ip,
         accepted_user_agent = p_agent
    from public.partnerships p
   where p.id = c.partnership_id
     and p.influencer_id = meu
     and p.status = 'ativa'
     and c.status = 'aguardando';

  if not found then
    raise exception 'nao ha contrato aguardando aceite';
  end if;
end $$;

revoke all on function public.portal_meu_contrato() from public;
revoke all on function public.portal_meus_dados() from public;
revoke all on function public.portal_salvar_meus_dados(text,text,text,text) from public;
revoke all on function public.portal_aceitar_contrato(text,text) from public;

grant execute on function public.portal_meu_contrato() to authenticated;
grant execute on function public.portal_meus_dados() to authenticated;
grant execute on function public.portal_salvar_meus_dados(text,text,text,text) to authenticated;
grant execute on function public.portal_aceitar_contrato(text,text) to authenticated;
