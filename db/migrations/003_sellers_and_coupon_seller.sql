-- 003_sellers_and_coupon_seller.sql
-- Vendedor nomeado no balcao. Ver docs/superpowers/specs/2026-08-05-vendedores-e-papeis-design.md
--
-- used_by_admin continua sendo o LOGIN que operou o sistema.
-- seller_id e o nome REIVINDICADO pela pessoa no balcao.
-- Os dois sao fatos diferentes e ficam lado a lado de proposito: e o par que revela padrao.

-- ── Tabela de vendedores ──
create table if not exists public.sellers (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  store_name text not null,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists sellers_store_active_idx on public.sellers (store_name, active);

alter table public.sellers enable row level security;

-- Leitura: qualquer autenticado (o lojista precisa montar a lista do balcao).
drop policy if exists sellers_select_authenticated on public.sellers;
create policy sellers_select_authenticated on public.sellers
  for select to authenticated using (true);

-- Escrita: so admin.
drop policy if exists sellers_insert_admin on public.sellers;
create policy sellers_insert_admin on public.sellers
  for insert to authenticated with check (public.is_admin());

drop policy if exists sellers_update_admin on public.sellers;
create policy sellers_update_admin on public.sellers
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Sem policy de DELETE de proposito: vendedor nunca e excluido, so desativado.
-- Excluir levaria junto o historico de quem validou o que.

-- ── Vinculo no cupom ──
alter table public.coupons
  add column if not exists seller_id uuid references public.sellers(id);

create index if not exists coupons_seller_idx on public.coupons (seller_id);

-- ── Helpers de checagem ──
create or replace function public.caller_store_name()
returns text language sql stable security definer set search_path = public as $$
  select store_name from public.admin_profiles where id = auth.uid();
$$;

-- Vendedor serve para quem esta chamando? Precisa existir, estar ativo e
-- ser da loja do chamador. Admin nao tem loja no perfil e passa por cima.
create or replace function public.seller_ok_for_caller(p_seller uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.sellers s
    where s.id = p_seller
      and s.active
      and (public.is_admin() or s.store_name = public.caller_store_name())
  );
$$;

-- ── Guard de UPDATE (substitui a versao da migracao 001) ──
create or replace function public.coupons_guard_non_admin_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  if public.is_finance() then
    if new.customer_name  is distinct from old.customer_name
       or new.customer_cpf   is distinct from old.customer_cpf
       or new.customer_email is distinct from old.customer_email
       or new.customer_phone is distinct from old.customer_phone
       or new.coupon_number  is distinct from old.coupon_number
       or new.influencer_id  is distinct from old.influencer_id
       or new.campaign_id    is distinct from old.campaign_id
       or new.expires_at     is distinct from old.expires_at
       or new.created_at     is distinct from old.created_at
       or new.status         is distinct from old.status
       or new.seller_id      is distinct from old.seller_id
    then
      raise exception 'Financeiro so pode alterar conferencia, pagamento e NF.';
    end if;
    return new;
  end if;

  -- lojista: so a validacao no balcao
  if new.customer_name  is distinct from old.customer_name
     or new.customer_cpf   is distinct from old.customer_cpf
     or new.customer_email is distinct from old.customer_email
     or new.customer_phone is distinct from old.customer_phone
     or new.coupon_number  is distinct from old.coupon_number
     or new.influencer_id  is distinct from old.influencer_id
     or new.campaign_id    is distinct from old.campaign_id
     or new.expires_at     is distinct from old.expires_at
     or new.created_at     is distinct from old.created_at
     or new.verified       is distinct from old.verified
     or new.paid           is distinct from old.paid
     or new.invoice_number is distinct from old.invoice_number
  then
    raise exception 'Apenas administradores podem alterar os dados do cupom.';
  end if;

  -- Validacao no balcao exige vendedor da propria loja.
  if new.status = 'used' and old.status is distinct from 'used' then
    if new.seller_id is null then
      raise exception 'Escolha o vendedor antes de validar o cupom.';
    end if;
    if not public.seller_ok_for_caller(new.seller_id) then
      raise exception 'Vendedor invalido para esta loja.';
    end if;
  end if;

  -- Trocar o vendedor depois da validacao e coisa de admin.
  if new.seller_id is distinct from old.seller_id
     and old.status = 'used'
  then
    raise exception 'Apenas administradores podem trocar o vendedor de um cupom ja validado.';
  end if;

  return new;
end;
$$;

drop trigger if exists coupons_guard_non_admin_update on public.coupons;
create trigger coupons_guard_non_admin_update
  before update on public.coupons
  for each row execute function public.coupons_guard_non_admin_update();

-- ── Guard de INSERT (novo) ──
-- O cadastro express insere o cupom ja com status 'used'. Sem este trigger,
-- o caminho mais usado do sistema (100% das vendas reais saem do express)
-- ficaria sem nenhuma trava de banco no vinculo do vendedor.
-- A policy coupons_insert_public permite insert anonimo (o formulario publico
-- em /c/): esse caso entra com auth.uid() nulo, seller_id nulo e status
-- 'pending', e passa direto.
create or replace function public.coupons_guard_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  if new.status = 'used' then
    if new.seller_id is null then
      raise exception 'Escolha o vendedor antes de validar o cupom.';
    end if;
    if not public.seller_ok_for_caller(new.seller_id) then
      raise exception 'Vendedor invalido para esta loja.';
    end if;
  elsif new.seller_id is not null and not public.seller_ok_for_caller(new.seller_id) then
    raise exception 'Vendedor invalido para esta loja.';
  end if;

  return new;
end;
$$;

drop trigger if exists coupons_guard_insert on public.coupons;
create trigger coupons_guard_insert
  before insert on public.coupons
  for each row execute function public.coupons_guard_insert();
