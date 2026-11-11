-- 032 — O pagamento de 01/10/2026 ao @caiiuxo vira o primeiro lançamento do livro.
--
-- POR QUE EXISTE
--
-- Em 01/10/2026 foram pagos R$ 3.000 por PIX ao influenciador @caiiuxo,
-- referentes a 6 cupons usados entre 05/06 e 30/06. Isso aconteceu ANTES de o
-- livro (migration 031) existir: o único rastro é `coupons.paid = true` nos 6
-- cupons. Esta migration cria o lançamento que faltava, para que a promessa do
-- módulo valha desde a origem: nenhum cupom fica pago fora de um lançamento.
--
-- O QUE FAZ
--
--   * 1 `settlements` (nasce 'aberto', recebe os itens e só então vira 'pago',
--     pois o trigger de itens recusa item em lançamento não aberto):
--     tipo 'comissao', status final 'pago', valor 3000, período
--     2026-06-05 a 2026-06-30 (primeiro e último used_at dos 6, o mesmo dia em
--     UTC e em São Paulo), paid_at '2026-10-01 13:06:54+00' (carimbo do primeiro
--     dos 6), forma 'PIX', identificador nulo (não há id de transação),
--     created_by 'migration 032', na parceria encerrada
--     54b169d5-bfb8-4d9d-afbc-7a7322199089.
--   * 6 `settlement_items`, um por cupom, valor 500 cada.
--   * NÃO toca em `coupons.paid`: já é true. Só cria o registro que faltava.
--
-- COMO FICA SEGURA
--
--   * Os cupons são escolhidos POR `coupon_number`, nunca por filtro de data:
--     filtro por data pegaria cupom novo se isto rodasse de novo.
--   * Tudo roda dentro de UM bloco `do`, que é atômico: se qualquer conferência
--     falhar, nada fica gravado (nem o lançamento sem itens).
--   * Segunda execução FALHA ALTO, não é silenciosa: o bloco recusa começar se
--     já existe lançamento 'migration 032' ou se algum dos 6 cupons já está em
--     algum lançamento. Escolhi falhar em vez de "não fazer nada" porque um
--     pulo silencioso esconde o erro de quem colou duas vezes; falhando, o
--     César vê a mensagem e sabe que o livro já tem o registro.
--   * Se os 6 cupons não forem encontrados exatamente como medido (usados,
--     conferidos, pagos, da parceria certa, soma 3000), o bloco aborta em vez
--     de gravar um número errado.
--   * Não usa `set role` nem mexe em RLS. Colado no SQL Editor, auth.uid() é
--     nulo, e é isso que deixa as travas da 031 aceitarem a virada para
--     'pago' (exceção deliberada documentada na 031).
--
-- DE ONDE VÊM OS CARIMBOS
--
--   * paid_at '2026-10-01 13:06:54+00': vem de `coupons.paid_at` (coluna da
--     migration 001), o do PRIMEIRO dos 6 cupons a ser marcado como pago. Não
--     vem de `used_at`, que é de junho. Está fixo no SQL (não lido dos cupons)
--     para o lançamento não mudar se esses carimbos forem mexidos depois.
--   * created_at usa o default now(): este lançamento aparece como o MAIS NOVO
--     do livro embora represente o pagamento mais ANTIGO. Está certo (created_at
--     é quando o registro nasceu, paid_at é quando o dinheiro saiu). Não "corrija".
--
-- COMO APLICAR: colar o arquivo INTEIRO no SQL Editor e executar. O editor
-- mostra o resultado da última consulta; a verificação ao final é
-- uma só consulta, com o esperado descrito no comentário dela.
--
-- PARA DESFAZER (auth.uid() nulo no SQL Editor deixa apagar lançamento pago;
-- os itens saem junto por on delete cascade; coupons.paid não é alterado):
--
--   delete from public.settlements where created_by = 'migration 032';

do $mig$
declare
  v_parceria constant uuid := '54b169d5-bfb8-4d9d-afbc-7a7322199089';
  v_numeros  constant text[] := array[
    'FOX-ZZ7FQG','FOX-RXRS5P','FOX-NBRK79','FOX-LJ5CH9','FOX-SSYQEA','FOX-GB3J6K'
  ];
  v_settlement uuid;
  v_n          int;
  v_soma       numeric;
  v_inseridos  int;
  v_soma_itens numeric;
  v_fora       int;
begin
  -- 1. Recusa rodar de novo.
  if exists (select 1 from public.settlements where created_by = 'migration 032') then
    raise exception '032 ja foi aplicada: existe lancamento criado por "migration 032". Nada foi gravado.';
  end if;
  if exists (
    select 1
      from public.settlement_items si
      join public.coupons c on c.id = si.coupon_id
     where c.coupon_number = any (v_numeros)
  ) then
    raise exception '032 recusada: algum dos 6 cupons ja esta em um lancamento. Nada foi gravado.';
  end if;

  -- 2. Os 6 cupons existem, exatamente como medido.
  --    A soma de commission_per_sale é MEDIDA aqui (não filtrada): é ela que
  --    prova os R$ 3.000. A contagem prende em 6 cupons.
  select count(*), coalesce(sum(commission_per_sale), 0)
    into v_n, v_soma
    from public.coupons
   where coupon_number = any (v_numeros)
     and status = 'used'
     and verified is true
     and paid is true
     and used_at is not null
     and partnership_id = v_parceria;
  if v_n <> 6 or v_soma <> 3000 then
    raise exception '032 abortada: esperava 6 cupons usados/conferidos/pagos na parceria % somando 3000, achei % (soma %).',
      v_parceria, v_n, v_soma;
  end if;

  -- 3. O lançamento nasce 'aberto': o trigger settlement_items_valida (valida
  --    DADOS, vale para qualquer papel) só aceita item em lançamento aberto.
  insert into public.settlements
    (partnership_id, tipo, status, periodo_de, periodo_ate, valor, created_by)
  values
    (v_parceria, 'comissao', 'aberto', date '2026-06-05', date '2026-06-30', 3000,
     'migration 032')
  returning id into v_settlement;

  -- 4. Um item por cupom. valor = a comissão do cupom (500 cada, medido), não um
  --    literal: assim a soma conferida abaixo é um fato, não uma tautologia.
  --    Mesmos predicados da conferência do passo 2.
  insert into public.settlement_items (settlement_id, coupon_id, valor)
  select v_settlement, c.id, c.commission_per_sale
    from public.coupons c
   where c.coupon_number = any (v_numeros)
     and c.status = 'used'
     and c.verified is true
     and c.paid is true
     and c.used_at is not null
     and c.partnership_id = v_parceria;

  -- 4b. Agora fecha: vira 'pago'. Passa pelas travas porque auth.uid() é nulo
  --     no SQL Editor (exceção deliberada da 031); a constraint
  --     settlements_pago_exige_dados é satisfeita (paid_at e forma preenchidos).
  update public.settlements
     set status = 'pago',
         paid_at = timestamptz '2026-10-01 13:06:54+00',
         forma = 'PIX'
   where id = v_settlement;

  -- 5. Conferência final dentro da mesma transação: se falhar, desfaz tudo.
  select count(*), coalesce(sum(valor), 0)
    into v_inseridos, v_soma_itens
    from public.settlement_items
   where settlement_id = v_settlement;
  if v_inseridos <> 6 or v_soma_itens <> 3000 then
    raise exception '032 abortada: gravou % itens somando %, esperava 6 e 3000.', v_inseridos, v_soma_itens;
  end if;
  -- O invariante GLOBAL (nenhum cupom pago fora de lançamento) NÃO é conferido
  -- aqui: um cupom pago por outra via não pode desfazer este registro correto.
  -- Ele é relatado na verificação abaixo.
end
$mig$;

-- ---------------------------------------------------------------------------
-- VERIFICAÇÃO (somente leitura; nada aqui desfaz coisa alguma).
--
-- UMA consulta só, de propósito: o SQL Editor mostra apenas o resultado da
-- última instrução. Uma linha, lida da esquerda para a direita:
--
--   lancamentos 1 | itens 6 | soma_itens 3000 | total_pago 3000   (escopo: este
--   registro, created_by = 'migration 032', então continua valendo depois que
--   houver outros fechamentos)
--   status pago | tipo comissao | valor 3000 | paid_at 2026-10-01 13:06:54+00 |
--   forma PIX | identificador (nulo) | periodo_de 2026-06-05 | periodo_ate
--   2026-06-30 | partnership_id 54b169d5-bfb8-4d9d-afbc-7a7322199089
--   cupons_pagos_fora_de_lancamento 0 | quais (nulo)   (GLOBAL, todo o banco)
--
-- O invariante global usa a forma ampla (qualquer cupom com paid = true, não só
-- status 'used'): como é só relatório, não desfaz nada, e cupom pago sem ter
-- sido usado também é anomalia que o César quer ver. Se não for 0, `quais`
-- lista os coupon_number.
--
-- Se o lançamento não existir, as colunas dele vêm nulas e `lancamentos` = 0.
-- ---------------------------------------------------------------------------
select
  (select count(*) from public.settlements
    where created_by = 'migration 032')                           as lancamentos,
  (select count(*) from public.settlement_items si
    join public.settlements s on s.id = si.settlement_id
   where s.created_by = 'migration 032')                          as itens,
  (select coalesce(sum(si.valor), 0) from public.settlement_items si
    join public.settlements s on s.id = si.settlement_id
   where s.created_by = 'migration 032')                          as soma_itens,
  (select coalesce(sum(valor), 0) from public.settlements
    where created_by = 'migration 032' and status = 'pago')       as total_pago,
  l.status, l.tipo, l.valor, l.paid_at, l.forma, l.identificador,
  l.periodo_de, l.periodo_ate, l.partnership_id,
  g.cupons_pagos_fora_de_lancamento,
  g.quais
from (select 1) base
left join public.settlements l on l.created_by = 'migration 032'
cross join (
  select count(*) as cupons_pagos_fora_de_lancamento,
         string_agg(c.coupon_number, ', ' order by c.coupon_number) as quais
    from public.coupons c
   where c.paid is true
     and not exists (select 1 from public.settlement_items si
                      where si.coupon_id = c.id)
) g;
