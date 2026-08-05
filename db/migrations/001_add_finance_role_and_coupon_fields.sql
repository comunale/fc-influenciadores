-- 001_add_finance_role_and_coupon_fields.sql
-- Aplicada em 2026-08-05 no projeto uufrrhqrafxybdhkhvln
--
-- Cria o papel 'finance' e os campos de conferencia, pagamento e NF do cupom.
-- Regra de escrita por papel:
--   admin     -> sem restricao, passa por cima de tudo
--   finance   -> so conferencia, pagamento e NF
--   moderator -> so a validacao no balcao (status/used_at/used_by_admin)

-- Colunas de conferencia e pagamento
alter table public.coupons
  add column if not exists verified       boolean not null default false,
  add column if not exists verified_at    timestamptz,
  add column if not exists verified_by    text,
  add column if not exists paid           boolean not null default false,
  add column if not exists paid_at        timestamptz,
  add column if not exists paid_by        text,
  add column if not exists invoice_number text;

-- Papel novo. 'store' era permitido e nunca foi usado: sai.
alter table public.admin_profiles drop constraint if exists admin_profiles_role_check;
alter table public.admin_profiles add constraint admin_profiles_role_check
  check (role = any (array['admin'::text, 'finance'::text, 'moderator'::text]));

create or replace function public.is_finance()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.admin_profiles
    where id = auth.uid() and role = 'finance' and active = true
  );
$$;

-- UPDATE: admin e financeiro passam; lojista so na transicao de validacao.
drop policy if exists coupons_update_admin_or_validation on public.coupons;
create policy coupons_update_admin_or_validation on public.coupons
  for update to authenticated
  using (public.is_admin() or public.is_finance() or status = 'pending')
  with check (public.is_admin() or public.is_finance() or status in ('used', 'expired'));

-- Trigger: quem pode mudar o que, por papel.
create or replace function public.coupons_guard_non_admin_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- service_role, rotas server-side e admin passam direto: admin nao tem restricao.
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

  return new;
end;
$$;

drop trigger if exists coupons_guard_non_admin_update on public.coupons;
create trigger coupons_guard_non_admin_update
  before update on public.coupons
  for each row execute function public.coupons_guard_non_admin_update();
