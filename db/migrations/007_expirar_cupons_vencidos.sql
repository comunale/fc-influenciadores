-- 007_expirar_cupons_vencidos.sql
-- Aplicada em 2026-08-18 no projeto uufrrhqrafxybdhkhvln
--
-- Cupom vencido continuava marcado como 'pending' para sempre. A correcao so
-- acontecia dentro de /api/coupons/validate, quando alguem abria AQUELE cupom
-- especifico -- entao a lista mostrava como pendente o que ja tinha vencido e
-- o filtro por status mentia. Em 18/08 eram 7 de 8 pendentes ja vencidos, o
-- mais antigo de 23/05.
--
-- security definer para o trigger coupons_guard_non_admin_update deixar passar
-- (auth.uid() e nulo aqui, entao cai no ramo de rotina de servidor).

create or replace function public.expirar_cupons_vencidos()
returns integer language plpgsql security definer set search_path = public as $$
declare
  n integer;
begin
  update public.coupons
     set status = 'expired'
   where status = 'pending'
     and expires_at < now();
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.expirar_cupons_vencidos() from public, anon, authenticated;

-- Todo dia as 03:15 UTC, que e 00:15 no horario de Brasilia.
select cron.schedule(
  'expirar-cupons-vencidos',
  '15 3 * * *',
  $$select public.expirar_cupons_vencidos()$$
);
