# Backlog — o que falta

Lista única do que está pendente neste projeto. **Este arquivo existe porque as
pendências vinham sendo registradas no rodapé de planos antigos, na seção "fora
de escopo" — e é exatamente lá que as coisas morrem.** Em 18/08/2026 dois
pedidos do César quase se perderam assim.

Regra: ao terminar qualquer entrega, atualizar este arquivo. Ao começar
qualquer conversa, ler este arquivo.

Atualizado em 2026-08-19.

**Plano de execução dos itens 1, 3 e 4:** `docs/superpowers/plans/2026-08-18-pendencias-balcao-financeiro-parceria.md`. O item 2 (portal) segue bloqueado pela decisão sobre os dados migrados da planilha.

---

## Retomando o trabalho — leia isto primeiro

**Última sessão: 19/08/2026.** Tudo commitado e no ar, nada pela metade.

**O portal do influenciador está construído** (subsistema 4). Falta o César
testar de ponta a ponta: criar um acesso pela tela de Influencers, entrar em
`/portal` com ele e conferir. Eu testei a camada de dados no banco, mas não fiz
o login de verdade — não tenho, nem devo ter, a senha dele.

### Pedido novo do César, 19/08 — contrato com aceite

> "Temos um contratinho simples que enviamos para a pessoa assinar. Temos como
> colocar esse contrato no sistema e criar um sistema de aceite? Para proteger
> ambos os lados. Direito de uso de imagem e etc."

Ainda **não desenhado**. Encaixa no portal, que agora existe e já é o lugar onde
o influenciador entra autenticado.

**Decidido em 19/08:** o direito de uso de imagem vale **6 meses**.

**Aguardando:** o César está escrevendo o contrato e vai mandar o texto para
análise. Sem o texto não dá para desenhar — é ele que diz quais campos existem.

Ainda em aberto, para decidir junto com o texto na mão:

- O contrato vale **por parceria** ou **por influenciador**? Se as condições
  mudam a cada renovação, o aceite provavelmente também precisa ser renovado.
- O aceite **trava** alguma coisa? Ex.: o link só liga depois de aceitar. É o
  que dá dente ao contrato, e muda bastante o desenho.
- Como versionar o texto sem invalidar aceite antigo. Ninguém pode ficar
  vinculado a um texto que mudou depois de assinar.
- Os 6 meses de imagem contam **do aceite** ou **do fim da parceria**? Muda
  quando o prazo vence e o que o sistema precisa avisar.

Vale uma spec própria: isto é prova jurídica, não um checkbox.

---

## Reestruturação como gerenciador de parcerias (decidida em 18/08)

O sistema virou uma plataforma de gestão de parcerias. Quebrado em 5 subsistemas,
cada um uma entrega que funciona sozinha:

| | Subsistema | Estado |
|---|---|---|
| 1 | **Parceria como entidade** | ✅ **concluído em 18/08** |
| 2 | Fechamentos e pagamentos | depende do 1 |
| 3 | Funil de prospecção | independente |
| 4 | Portal do influenciador | ✅ **concluído em 19/08** |
| 6 | Contrato e aceite | 📋 **spec escrita em 19/08**, aguardando revisão — `specs/2026-08-19-contrato-e-aceite-design.md` |

**Visibilidade no portal, decidida em 18/08:** a visibilidade é **por parceria**, não
por cupom. A parceria antiga aparece como uma linha fechada — *"Parceria Reinauguração
· encerrada"* — sem detalhe de vendas nem valores. A parceria nova mostra tudo.

Motivo: os dados antigos vieram de planilha e os R$ 3.000 do @caiiuxo **já foram pagos
por fora**. Mostrar em detalhe criaria cobrança sobre o que já foi acertado; esconder
por completo faria o influenciador achar que o histórico sumiu. A linha fechada resolve
os dois.
| 5 | Menus, páginas e papéis | cada entrega arruma a sua parte |

### Subsistema 1 — concluído em 18/08

Plano: `docs/superpowers/plans/2026-08-18-parceria-como-entidade.md` — as 8 tasks feitas.

18 parcerias ativas, uma por influenciador, índice único garantindo. Nenhum cupom sem
parceria. Os termos saíram do influenciador (migration 011) — não existe mais cópia
para alguém editar por engano.

Verificado ponta a ponta: landing HTTP 200 com R$ 300, cupom criado nasce vinculado à
parceria, página do cupom abre. E a comissão do @caiiuxo continua **R$ 3.000** depois de
tudo — o invariante que prova que nada foi reescrito.

---

## Pedidos do César ainda não construídos

### 1. ~~Dados bancários dos influenciadores~~ — ✅ FEITO em 18/08

**Estado:** entregue. Tabela própria `influencer_payment_info` com RLS só de admin e Financeiro, rota `/api/admin/influencer-payment` e painel na tela de Influencers.

Onde o Financeiro cadastra chave PIX / dados bancários de cada influenciador,
para conseguir pagar sem sair do sistema.

Cuidados já conhecidos:
- Dado sensível. Visível só para `admin` e `finance` — nunca para o Lojista.
- Precisa das três camadas de sempre: tela, allowlist na API e RLS no banco.

### 2. Portal do influenciador

**Pedido em:** 2026-08-18. Era o item 5, o maior de todos.
**Estado:** não existe nada. Sem rota, sem papel, sem tela.

O influenciador acessa e acompanha: quantos cupons foram gerados pelo link dele,
quem usou, quais foram validados na loja, quais o Financeiro aprovou, e quanto
de comissão isso soma.

Já decidido:
- **Login por e-mail e senha** (escolhido pelo César em 18/08, sobre link
  secreto e link mágico por e-mail).
- Se apoia em `calcularComissao` (`lib/commission.ts`), que já existe e já lê o
  retrato gravado em cada cupom.

**Pré-requisito que não pode ser ignorado:** os dados atuais vieram de uma
planilha e estão sendo acertados retroativamente. O portal **não pode** exibir
esse histórico sem antes existir forma de separar "registro migrado" de
"registro nascido no sistema" — senão um influenciador abre a tela e cobra um
valor que talvez já tenha sido pago por fora. Ver
`docs/superpowers/specs/2026-08-18-termos-no-influenciador-design.md`.

### 3. ~~Aviso de parceria perto do fim~~ — ✅ FEITO em 18/08

**Estado:** o `partnership_ends_at` já existe e já derruba o link na data. Falta
o **aviso antes**, para o César fechar as vendas e pagar a comissão a tempo.

O `pg_cron` já está instalado (migration 007) e serve exatamente para isso.
Não há canal externo (e-mail foi descartado), então o aviso vive dentro do
sistema — um bloco no Dashboard.

### 4. ~~Fluxo do QR code no balcão~~ — ✅ FEITO em 18/08

**Entregue em 18/08:** o Lojista perdeu o cadastro express (trava na rota, não só na
tela) e passou a ver o QR do link do influenciador — quem preenche é o cliente, no
próprio celular. Cupons com o mesmo telefone em CPFs diferentes aparecem marcados na
lista, olhando a base inteira e não só a página.

A *leitura* do QR já funcionava e ninguém sabia: o QR do cupom aponta para
`/admin/validar?codigo=FOX-XXXXXX` e a tela lê o parâmetro sozinha. Virou uma dica
na tela.

**Spec aprovada em 2026-07-28**, nunca implementada.
`docs/superpowers/specs/2026-07-28-cupom-express-anti-abuso-design.md`

Tira a geração do cupom das mãos do vendedor: ele digita o @ do influenciador, a
tela mostra um QR, e o **cliente** preenche no próprio celular.

Ataca o problema pela prevenção, no balcão. O que já foi construído (NF,
Conferido, Pago, vendedor nomeado) ataca pela auditoria, depois da venda. Os
dois se complementam — hoje o vendedor ainda cria e valida um cupom sozinho.

---

## Subsistema 4 — portal do influenciador, concluído em 19/08

Plano: `plans/2026-08-19-portal-do-influenciador.md`. Migrations 014, 016 e 017.

Decidido pelo César em 19/08:
- ele vê o **primeiro nome** do cliente, mais nada. O corte acontece no SQL.
- **dado bancário não aparece no portal**, nem para ler. É controle interno.

**Dois erros meus que o teste no banco pegou** — ficam registrados porque a
mesma armadilha vai reaparecer:

1. Dei ao influenciador uma política de leitura sobre os próprios cupons. RLS
   filtra **linha, não coluna**: com o token dele, `/rest/v1/coupons?select=*`
   devolveria CPF, telefone e e-mail dos clientes. A tela estava certa e a trava
   não. Corrigido tirando o acesso à tabela e pondo `portal_vendas()` no lugar.
2. A política escondia a parceria encerrada por completo, e a spec pedia que ela
   aparecesse como linha fechada. Resolvido com `portal_parcerias_encerradas()`,
   que devolve só as datas.

Regra que sai daqui: **toda vez que um papel novo entra no sistema, as políticas
existentes precisam ser relidas.** Elas foram escritas assumindo quem existia na
época.

## 15 parcerias encerradas em 19/08

O César acreditava ter 2 parcerias ativas. O sistema tinha **18**, todas sem
`ends_at` — e parceria sem prazo não vence, então eram 18 links no ar.

Vieram da planilha da reinauguração, que não tinha campo de data de fim. Das 18,
**15 nunca geraram um cupom**. O risco era real: um story antigo salvo ou um
print repassado geraria cupom válido, custando o desconto mais R$ 500 de comissão
de um acordo encerrado em maio.

Migration 018 encerrou as 15 (critério: ativa e sem nenhum cupom), com `ends_at`
retroativo a 23/05. Sobraram 3 ativas: @caiiuxo, @carolvilex e @mariananavi.

**A confirmar com o César:** @carolvilex ficou ativa mas fora da isenção de
contrato. Quando o subsistema 6 subir, o link dela para até ela aceitar.

## Pendências que o contrato cria em outras áreas

- **Restituição de fee** — dinheiro que ENTRA, o oposto do que o Financeiro faz
  hoje. Pertence ao subsistema 2; o 6 só registra a pendência.
- **Renovação desliga o link** até o novo contrato ser aceito. A tela de renovar
  precisa avisar antes de confirmar.
- **Forma de pagamento e nota fiscal** — o contrato não diz se o influenciador
  emite nota. PF e PJ têm tratamento tributário diferente. É conversa do César
  com o contador, não decisão técnica.

## Correção de segurança feita em 18/08

**As tabelas eram legíveis por qualquer um.** `coupons`, `influencers`,
`partnerships` e `campaigns` tinham SELECT liberado para `public` — para quem
tivesse a chave anon, que vai no código do navegador e é pública por natureza.

Testado antes de corrigir: um anônimo lia a tabela de cupons inteira, com **nome,
CPF, telefone e e-mail de todo cliente**. E `coupons` tinha INSERT liberado —
dava para criar cupom direto, driblando o rate limit.

Corrigido na migration 013: as páginas públicas passaram a ler pelo servidor e as
tabelas só respondem a quem está autenticado. Verificado com `role anon`: zero
linhas em todas, e o insert não passa.

**A ordem foi de propósito: código primeiro, política depois.** Apertar a regra
antes derrubaria o site — foi assim que o balcão ficou 12 dias fora do ar.

## Dívidas técnicas conhecidas

| O quê | Por quê importa |
|---|---|
| **Pagamento do fixo (`fee_amount`) não é controlado** | Existe o valor no contrato, mas nenhum campo diz se saiu. A tela mostra separado e não soma em "a pagar", para não dar número errado. Um `fee_paid_at` resolveria. |
| **19 testes de banco dormindo** | `tests/permissions.db.test.ts` só roda com `SUPABASE_DB_URL`. O César preferiu não usar a senha do Postgres de produção — decisão certa. Para ligar, o caminho é um projeto Supabase separado para testes. |
| **`campaigns.active` perdeu a função** | Desde 18/08 não derruba mais link. Vale avaliar se o campo ainda faz sentido ou se confunde. |
| **Marcar comissão como paga é cupom a cupom** | Com volume maior vai pedir um "pagar tudo deste influenciador". |
| **`coupons` tem policies de UPDATE/DELETE amplas** | Já restritas a admin/finance, mas vale reauditar quando o portal do influenciador entrar. |
