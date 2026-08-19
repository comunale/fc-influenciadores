-- O influenciador não pode alcançar a tabela de cupons. Nem a dele.
--
-- A migration 014 deu a ele uma política de leitura sobre os próprios cupons.
-- Parecia estreito, mas RLS filtra LINHA, não COLUNA: com o token dele, uma
-- chamada direta em /rest/v1/coupons?select=* devolveria customer_cpf,
-- customer_phone e customer_email de todo cliente que usou o cupom dele.
--
-- Provado em 2026-08-19, em transação com rollback: a sessão simulada leu os 4
-- cupons inteiros, inclusive o da parceria oculta -- que a tela nunca mostra,
-- mas a API entregava.
--
-- A tela estava certa e a trava não estava. É exatamente o erro que este
-- projeto já cometeu duas vezes: confiar que a consulta do servidor é o limite.
-- Quem tem sessão nao precisa passar pela nossa consulta.
--
-- Aqui o acesso direto acaba e sobra uma função que devolve SÓ o que o portal
-- mostra. O corte do primeiro nome acontece no SQL: nem a função vê o
-- sobrenome sair.
--
-- Aplicada em 2026-08-19.

drop policy if exists coupons_select_influencer on public.coupons;

create or replace function public.portal_vendas()
returns table (
  id uuid,
  partnership_id uuid,
  created_at timestamptz,
  verified boolean,
  paid boolean,
  commission_per_sale numeric,
  primeiro_nome text
)
language sql stable security definer set search_path to 'public'
as $$
  select c.id,
         c.partnership_id,
         c.created_at,
         c.verified,
         c.paid,
         c.commission_per_sale,
         coalesce(nullif(split_part(btrim(c.customer_name), ' ', 1), ''), 'Cliente')
    from public.coupons c
    join public.partnerships p on p.id = c.partnership_id
   where c.influencer_id = public.meu_influencer_id()
     -- Parceria oculta não entrega nem venda. O join também descarta cupom sem
     -- parceria (anterior à migration 010), que por definição é de acordo
     -- antigo -- e acordo antigo não abre.
     and p.portal_visible = true;
$$;

revoke all on function public.portal_vendas() from public;
grant execute on function public.portal_vendas() to authenticated;
