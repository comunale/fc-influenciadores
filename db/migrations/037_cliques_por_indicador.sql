-- 037 — Quantos cliques cada indicador teve, em uma consulta.
--
-- A tela /admin/indicadores precisa do número de cliques por pessoa. O
-- PostgREST não agrupa, e as duas saídas sem esta função seriam ruins:
--
--   a) uma contagem por linha  → N consultas para N indicadores;
--   b) baixar indicador_cliques inteira e contar no TypeScript → a tabela
--      cresce a cada abertura de link, e isso vira megabytes.
--
-- Só CONTA. Nenhuma conta de dinheiro mora aqui: "quanto tem a receber" é
-- calculado por `resumoDoIndicador` em lib/indicacao/regras.ts, que tem teste,
-- e ter duas implementações da mesma soma é como se paga errado.
--
-- `security definer` pelo mesmo motivo da 036: a policy de indicador_cliques
-- libera leitura só para admin e financeiro, e esta função repete essa regra
-- explicitamente em vez de confiar na RLS de quem chama.
--
-- PARA DESFAZER:
--   drop function if exists public.indicacao_cliques_por_indicador();

create or replace function public.indicacao_cliques_por_indicador()
returns table (indicador_id uuid, cliques integer)
language plpgsql
stable
security definer
set search_path to 'public'
as $fn$
begin
  if not (public.is_admin() or public.is_finance()) then
    raise exception 'Apenas administrador e financeiro veem os cliques por indicador.';
  end if;

  return query
    select k.indicador_id, count(*)::integer
    from public.indicador_cliques k
    group by k.indicador_id;
end;
$fn$;

comment on function public.indicacao_cliques_por_indicador() is
  'Cliques por indicador, para a tela do admin. Só conta — dinheiro é contado '
  'em lib/indicacao/regras.ts, que tem teste.';

revoke all on function public.indicacao_cliques_por_indicador() from public;
grant execute on function public.indicacao_cliques_por_indicador() to authenticated;

-- Verificação: deve devolver 0 linhas numa base sem cliques, e erro para quem
-- não é admin nem financeiro.
select count(*) as linhas from public.indicacao_cliques_por_indicador();
