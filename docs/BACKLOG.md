# Backlog — o que falta

Lista única do que está pendente neste projeto. **Este arquivo existe porque as
pendências vinham sendo registradas no rodapé de planos antigos, na seção "fora
de escopo" — e é exatamente lá que as coisas morrem.** Em 18/08/2026 dois
pedidos do César quase se perderam assim.

Regra: ao terminar qualquer entrega, atualizar este arquivo. Ao começar
qualquer conversa, ler este arquivo.

Atualizado em 2026-11-03.

**Plano de execução dos itens 1, 3 e 4:** `docs/superpowers/plans/2026-08-18-pendencias-balcao-financeiro-parceria.md`. O item 2 (portal) segue bloqueado pela decisão sobre os dados migrados da planilha.

---

## Retomando o trabalho — leia isto primeiro

**Última sessão: 03/11/2026.**

### ✅ Migration 030 aplicada e verificada em 03/11

A brecha está **fechada**. O César aplicou a 030 no SQL Editor — a escrita pelo
MCP foi recusada pelo gate de permissão três vezes nesta sessão (`execute_sql`
com DDL e `apply_migration`), e não foi contornada por `psql`.

Verificado de duas formas independentes: `scripts/verifica-030.sql` devolveu os
três `OK` (escalada bloqueada com SQLSTATE **42501**, ramo do setup em `false`
apesar de a conta ver 0 linhas, admin ativo ainda criando perfil), e o catálogo
confirma `with_check = (sem_nenhum_perfil() OR is_admin())` com a função como
`security definer`. Os 10 perfis seguem iguais aos de antes — o `rollback` dos
testes não deixou resíduo.

**Como reconferir, a qualquer momento:**

```sql
select with_check from pg_policies
where tablename='admin_profiles' and policyname='admin_profiles_insert';
```

Tem de dizer `(sem_nenhum_perfil() OR is_admin())`. Se algum dia voltar a
mencionar `auth.role()` ou três ramos, **a brecha reabriu**.

E `scripts/verifica-030.sql` no SQL Editor continua valendo como prova viva: não
altera nada (tudo em `begin/rollback`) e devolve três veredictos — escalada
bloqueada **com SQLSTATE 42501**, ramo do setup em `false`, admin ativo ainda
criando perfil. Três `OK` fecha; qualquer outra coisa tem o que fazer escrito ao
lado. O editor avisa "creates tables without enabling RLS": é falso positivo
(são tabelas temporárias), escolher **"Run without RLS"** — "Run and enable RLS"
liga RLS na tabela de resultados, que o teste escreve como `authenticated`, e o
teste passa a medir a si mesmo.

### Ainda aberto de 03/11 (não urgente, a escalada já está fechada)

- **Cadastro aberto no Supabase** (`disable_signup: false`,
  `mailer_autoconfirm: true`): qualquer um cria conta confirmada sozinho. Já não
  é escalada, mas é porta para conta-lixo. Só o César desliga, no painel.
  **Checado: não quebra o GC Estúdio** — ele cria usuário pela Edge Function
  `gc-estudio-usuarios` com chave de serviço, não usa `signUp`.
- **Funções do `gc_estudio`** (`mesclar_config`, `mesclar_sistema`, `tem_acesso`)
  executáveis por `authenticated`. Não é da Fox, mas **um influenciador da Fox é
  `authenticated` naquele schema também** — vale o César levar ao outro agente.
- **`update_updated_at_column`** com `search_path` mutável: endurecimento menor.

### A brecha de 03/11 — escalada de privilégio no cadastro de perfil

Chegou por um relatório de outro agente, trabalhando no projeto do GC Estúdio,
que divide o mesmo Supabase. Conferido no banco e **provado** com identidade
simulada em `begin/rollback`: uma conta criada do zero virava `admin` da Fox e
alcançava 248 cupons (CPF, telefone, e-mail) e a ficha bancária do influenciador.

**O alcance era maior do que vazamento de leitura, e isso só ficou claro depois,
na varredura de advisors.** Virando admin, o invasor também escrevia:
`admin_can_update_profiles` é um UPDATE sem `with_check`, então ele podia
**desativar o perfil do admin de verdade e trancar o César fora do sistema**; e
`registrar_descumprimento()` — protegida por dentro com `is_admin()`, o que não
serve de nada contra quem acabou de virar admin — encerra parceria, desliga link
e marca fee a restituir. Ou seja: era tomada de conta, não só cópia de dados.

**De onde veio.** Commit `a0daab7`, de 22/05/2026, consertou "criar usuário admin
sem erro de RLS" de duas formas no mesmo commit: a certa (`auth.admin.createUser`
com a chave de serviço, que não troca a sessão) e um contorno (relaxar a RLS para
quando a chave não estivesse configurada). A certa venceu em produção e está lá
desde então. **O contorno ficou atrás, sem uso, e era a brecha.** Lição: contorno
que nasce junto da solução certa não tem prazo de validade — alguém tem que
apagá-lo no mesmo dia, ou ele vira dívida de segurança silenciosa.

**O que o relatório não viu, e importa mais que o resto.** Ele mandava remover só
o 3º ramo da política. Isso **não fecharia a brecha**: o 1º ramo (`not exists
(select 1 from admin_profiles)`, para o setup inicial) faz um select que *também*
passa pela RLS — e para quem não tem perfil a tabela parece vazia, então o ramo
dá `true` sozinho, sem nenhuma restrição de cargo. Medido: conta nova vê 0 linhas.
**Regra que fica: checagem de existência dentro de política de RLS precisa rodar
em `security definer`, senão ela mede a visão filtrada e não a realidade.**

**Armadilha no teste.** Com UID falso, os três casos dão "bloqueado" — mas pela
chave estrangeira para `auth.users`, não pela RLS. Dá falso negativo e parece que
não há brecha. É preciso criar a conta em `auth.users` dentro da transação para
alcançar a política.

**O que foi feito:** migration 030 (as duas checagens via `security definer`) e a
remoção do caminho reserva do `signUp` em `app/api/admin/create-user/route.ts` —
sem a chave de serviço a rota agora devolve 503 em vez de criar conta por fora.

**O que não foi feito, e por quê:**

- **Cadastro aberto no Supabase** (`disable_signup: false`, `mailer_autoconfirm:
  true`): qualquer um cria conta confirmada sozinho. Só o César desliga, no painel
  (Authentication › Sign In / Providers). **Checado: não quebra o GC Estúdio** —
  ele cria usuário pela Edge Function `gc-estudio-usuarios` com
  `auth.admin.createUser` e chave de serviço, não usa `signUp`. Quebra apenas
  `/setup`, que não tem mais uso (o admin existe desde 20/05).
- **`/setup`**: decisão dele, ainda aberta. Com a 030 aplicada ele é inofensivo
  (só funciona com a tabela realmente vazia).
- **View `card_metrics`**: o relatório disse "RLS desligada"; é **view**, e view
  não tem RLS. Testado: `anon` recebe `permission denied`. Sobra que qualquer
  usuário logado lê contagens de evento de cartão, sem PII. Real, menor, do
  fc-digitalcard. Não mexi: trocar para `security_invoker` pode quebrar a tela
  daquele projeto, e a decisão é de lá.
- **`/setup`**: mantido de propósito. Com a 030 aplicada ele é provadamente
  inerte (só funciona com `admin_profiles` realmente vazia), então apagá-lo não
  acrescenta segurança nenhuma — e mudança a mais num dia de segurança é risco a
  mais. Se o cadastro aberto for desligado, ele vira código morto; aí sai.

### Varredura de advisors de 03/11 — o que é ruído e por quê

Rodei a varredura de segurança da plataforma enquanto o contexto estava fresco.
Fica registrado para a próxima pessoa não reinvestigar:

| Aviso | Veredito |
|---|---|
| `card_*` e `rate_limits` com RLS sem política | **Correto assim** — sem política = nega tudo pela API; só o service role entra |
| `anon` executa `coupons_guard_insert`, `coupons_guard_non_admin_update`, `sync_store_rename` | **Ruído, testado** — são funções de trigger, nem aparecem no schema cache do PostgREST (`PGRST202`) |
| `anon` executa `is_admin`, `eh_interno`, `is_finance`, `meu_influencer_id`, `caller_store_name`, `seller_ok_for_caller` | **Ruído** — são predicados sobre quem chama; para o anônimo devolvem falso/nulo |
| `authenticated` executa `registrar_descumprimento` | **Protegida por dentro** (`if not is_admin() then raise`) — mas ver acima: a guarda não vale contra quem virou admin pela brecha |
| `mesclar_config` / `mesclar_sistema` / `tem_acesso` do `gc_estudio` abertas a `authenticated` | **Não é da Fox** — mas vale ele checar se guardam por `eh_membro()`, porque hoje um influenciador da Fox é `authenticated` ali também |
| `update_updated_at_column` com `search_path` mutável | Endurecimento menor, pendente |
| Proteção de senha vazada desligada | **Exige plano Pro**, a org é Free. Já sabido desde 02/10 |

As funções `portal_*` aparecem só na lista de `authenticated`, não na de `anon` —
a migration 026 fez o que prometeu.

### O que entrou em 02/10

Um dia de segurança e de arrumação. Nada de funcionalidade nova no fluxo de
cupom — e muita coisa que estava torta ficou de pé.

**1. Alerta crítico do Supabase, resolvido.** `card_marcas` (do fc-digitalcard,
que divide o mesmo projeto) estava com RLS desligada: qualquer um com a chave
pública lia **e escrevia**. O risco não era o vazamento — é material de marca —
era a escrita: a linha guarda o WhatsApp e o domínio de `cartao.foxcycles.com.br`,
e trocar o número desvia os contatos sem deixar rastro. O César ligou a RLS.

**2. Dois buracos que a varredura seguinte achou**, e que a primeira não acharia:
a view `card_metrics` é SECURITY DEFINER e **andava por fora** da trava da
tabela (a tabela negava o anônimo, a view devolvia 17 linhas); e as funções do
portal eram executáveis sem login — não exploráveis, porque as guardas internas
seguraram, mas sem razão de existir. Migration 026.

**3. A ficha do influenciador.** A pessoa vivia espalhada em cinco lugares que
não se olhavam, e um deles — os dados que ela mesma preenche no portal — não
aparecia em tela nenhuma. Agora há `/admin/influencers/[id]`.

**4. A reorganização que o César pediu:** *"isso tá parecendo uma coberta cheia
de remendos. Editar é editar. Edita tudo."* A lista virou lista, com **um** botão
por linha. A ficha ganhou **um** Editar que abre tudo e um Salvar que grava as
quatro tabelas. O cadastro parou de pedir os termos do cupom, que vêm da
campanha — acabou a duplicação.

**5. A senha do influenciador.** O risco real não eram os dados bancários (o
portal não os mostra, decisão dele de 19/08, reconfirmada por teste). Era a
**assinatura**: o César definia a senha e mandava por WhatsApp, então um aceite
contestado teria como resposta à pergunta "quem mais sabia a senha?" o próprio
contratante. Agora a senha inicial é gerada pelo sistema, o portal fica fechado
até o influenciador criar a dele, e a troca acontece no servidor — é ele que
carimba, e o carimbo é o que sustenta o aceite. Migration 028.

**6. A mensagem de convite.** O endereço do portal não aparecia em lugar nenhum
do admin. Agora a ficha mostra os dois links com nome — divulgação e portal — e
gera a mensagem pronta para colar no WhatsApp, com a senha no único instante em
que ela existe.

### Feito pelo César no painel do Supabase, e verificado

Senha mínima de **12** com exigência de letras, números e símbolos. Testado com
contas descartáveis: 6, 10 e 12-só-letras são recusadas pelo próprio Supabase,
não só pela nossa tela.

**Proteção de senha vazada continua desligada** — é exclusiva do plano Pro, e a
organização está no Free. Recomendei sem checar o plano; fica anotado para o dia
em que houver Pro. Não vale assinar só por isso: o que protege a assinatura hoje
é a troca obrigatória no primeiro acesso, que já está no ar.

### O estado real do sistema

| | |
|---|---|
| Parcerias ativas | **3** — @caiiuxo, @mariananavi e @mariannegimenes |
| Contratos | 1, da @mariannegimenes, **aguardando aceite** |
| Acessos ao portal | 3 |
| Testes | 119 passando |

**A @mariannegimenes é a primeira parceria nascida com contrato obrigatório.** O
link dela está desligado e volta no instante em que ela aceitar. Falta ela entrar
no portal, criar a senha dela, preencher os dados e aceitar.

### O que continua em aberto

1. **Fechamentos e pagamentos** (subsistema 2) — **spec aprovada em 11/11 e plano
   escrito**, ainda sem código. Plano: `docs/superpowers/plans/2026-11-11-fechamentos-e-pagamentos.md`,
   8 tarefas, execução por subagente. O maior buraco funcional: pagar comissão é
   cupom a cupom, o fee fixo não tem onde ser registrado, e a restituição que o
   contrato criou não tem tela.

   Três coisas decididas em 11/11 que não estão na spec de agosto: o período
   recorta por **`used_at`** e nunca por `verified_at` (as 5 vendas de junho do
   @caiiuxo foram conferidas todas em 18/08, num lote — fechar junho por data de
   conferência devolveria junho vazio); o critério de aceitação da spec **venceu**,
   porque os R$ 3.000 do @caiiuxo foram pagos em 01/10; e esse pagamento vira
   **lançamento retroativo** (forma `PIX`), para a promessa "nenhum cupom pago
   fora de um fechamento" valer desde a origem em vez de nascer com exceção.
2. **Indique um Amigo** — spec e plano prontos, pausado por decisão dele.
3. **Funil de prospecção** (subsistema 3) — sem spec.
4. **O Financeiro pode reescrever o retrato de comissão** do cupom que ele paga.
   Segunda camada furada; a rota já barra. Conserto: quatro campos no trigger.
5. **Reorganizar o resto do admin** — Cupons, Contratos, Configurações. O César
   quer, e pediu para fazer depois dos influenciadores. Merece spec antes.

### Do César, não técnico

- Revisar o texto do contrato com um advogado.
- Nota fiscal e forma de pagamento do influenciador, com o contador.
- A venda da @carolvilex (cupom `FOX-ZE679B`, de 22/05) nunca conferida.


---

### Sessão anterior — 19/08/2026

Tudo commitado, no ar e sincronizado. Nada pela metade. 110 testes passando, build limpo.

### O que entrou em 19/08

Foi um dia grande. Três entregas e um inventário:

1. **Portal do influenciador** (subsistema 4) — login próprio, números da
   parceria, link, vendas com só o primeiro nome do cliente, e troca de senha.
2. **Contrato com aceite eletrônico** (subsistema 6) — modelo versionado,
   texto congelado no aceite com data e IP, e o link só liga depois da assinatura.
3. **Inventário das parcerias** — o César achava ter 2 ativas; havia 18, todas
   sem data de fim e com o link no ar. 16 foram encerradas.

### O que o César precisa fazer

- **Testar o portal de ponta a ponta.** Os acessos existem: @caiiuxo
  (contato@caiuxo.com) e @mariananavi (mariananavi12@gmail.com). Entram em
  `/portal/login`. Eu testei a camada de dados no banco, não o login de verdade
  — não tenho, nem devo ter, a senha de ninguém.
- **Ler e ajustar o texto do contrato**, em Contratos → Editar modelo. As sete
  correções que fiz estão descritas na migration 023. **O texto merece revisão
  jurídica** — o sistema garante o processo, não o mérito das cláusulas.
- **A venda da @carolvilex** (cupom `FOX-ZE679B`, de 22/05, usada e nunca
  conferida) — ele vai ver com o Financeiro. Não mexer sem ele.
- **Forma de pagamento e nota fiscal** no contrato: PF e PJ têm tratamento
  tributário diferente, e o texto não diz nada. É conversa com o contador.

### O estado real do sistema agora

| | |
|---|---|
| Parcerias ativas | **2** — @caiiuxo e @mariananavi, as duas isentas de contrato |
| Parcerias encerradas | 16 |
| Contratos gerados | 0 — a trava vale para a **próxima** parceria criada |
| Modelo de contrato | versão 1, gravada |
| Acessos ao portal | 2, funcionando |

**A trava do link ainda não afeta ninguém.** As duas parcerias vigentes têm
`contract_required = false`, porque os links já estavam em bio e story. A
primeira parceria nova que o César criar vai nascer com contrato, e o link dela
só liga depois do aceite.

### Duas regras deste projeto que se pagam

**Escrita de quem é de fora nunca ganha política de tabela.** Passa por função
`security definer` que descobre o dono pela sessão. Aprendido do jeito difícil
em 19/08: RLS filtra **linha, não coluna**, e uma política "estreita" sobre os
cupons do influenciador teria entregado CPF e telefone dos clientes pela API.

**"O sistema começa agora"** — decidido pelo César. O que é anterior ao sistema
não aparece para o influenciador, nem como linha vazia. Simplificou o código:
sumiu uma função inteira do banco.


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
| 6 | Contrato e aceite | ✅ **concluído em 19/08** — 8 tasks, migrations 022 a 024 |

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

### 2. ~~Portal do influenciador~~ — ✅ FEITO em 19/08

**Pedido em:** 2026-08-18. Era o item 5, o maior de todos.
**Estado:** entregue. Papel `influencer`, `/portal` com resumo, vendas, contrato e
troca de senha, e acesso criado pelo botão **Portal** na tela de Influencers. Detalhe
na seção "Subsistema 4" mais abaixo.

O influenciador acessa e acompanha: quantos cupons foram gerados pelo link dele,
quem usou, quais foram validados na loja, quais o Financeiro aprovou, e quanto
de comissão isso soma.

Já decidido:
- **Login por e-mail e senha** (escolhido pelo César em 18/08, sobre link
  secreto e link mágico por e-mail).
- Se apoia em `calcularComissao` (`lib/commission.ts`), que já existe e já lê o
  retrato gravado em cada cupom.

**O pré-requisito da planilha foi resolvido** pela regra "o sistema começa agora"
(19/08): parceria anterior ao sistema não aparece no portal, nem como linha vazia. A
parceria do @caiiuxo foi encerrada em 18/08 e uma nova nasceu em 19/08 com os mesmos
termos, então o portal dele parte do zero e o histórico fica no controle interno.

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

Em 19/08 o César confirmou que só @caiiuxo e @mariananavi seguem ativos, e a
@carolvilex foi encerrada também (migration 019). **Restam 2 parcerias ativas**,
as duas isentas de contrato.

### Pendências abertas que o encerramento não resolve

- **@carolvilex tem uma venda não conferida.** Cupom `FOX-ZE679B`, de 22/05,
  status *usado* — a moto saiu — mas o Financeiro nunca conferiu. Não conta para
  comissão e ninguém pagou. Parada há três meses. A parceria dela também tem
  R$ 500 de fee registrado, sem registro de pagamento.
- ~~O influenciador não consegue trocar a própria senha.~~ **Resolvido em 19/08.**
  O César liberou a escrita no portal com a condição de ficar separada do resto.
  A troca de senha vive em `/portal/senha` e não toca em tabela nenhuma nossa —
  a senha é do Auth do Supabase. O admin também redefine, pelo botão Portal na
  tela de Influencers, para o caso de esquecimento (não há e-mail de recuperação).
- **A @carolvilex tem venda e fee em aberto** — o César vai validar com o
  Financeiro. Não mexer sem ele.

## Pendências que o contrato cria em outras áreas

- **Restituição de fee** — dinheiro que ENTRA, o oposto do que o Financeiro faz
  hoje. Pertence ao subsistema 2; o 6 só registra a pendência.
- ~~**Renovação desliga o link** até o novo contrato ser aceito.~~ ✅ O aviso entrou
  junto com a Task 4 do contrato, em 19/08: o painel de renovar diz "o link fica
  desligado até ele assinar" **antes** de confirmar.
- **Forma de pagamento e nota fiscal** — o contrato não diz se o influenciador
  emite nota. PF e PJ têm tratamento tributário diferente. É conversa do César
  com o contador, não decisão técnica.

## "O sistema começa agora" — regra dada em 19/08

> *"A partir de agora a gente contabiliza. O que é passado é passado. O sistema
> começou agora com o Caio e com a Mariana."*

Encerra a discussão sobre o que o portal mostra do histórico: **nada**. Parceria
anterior não aparece nem como linha vazia. Migration 021 encerrou a parceria
antiga do @caiiuxo em 18/08 e abriu uma nova em 19/08 com os mesmos termos; as 6
vendas antigas ficam presas à parceria antiga e seguem no controle interno.

Vale para tudo daqui pra frente: número que o influenciador vê nasceu no sistema.

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

---

## Dois buracos achados em 02/09, na validação do Indique um Amigo

Não são daquela campanha — são do que já está no ar. Ficam aqui, e não na spec, porque
a spec fecha e o backlog não. Ambos com dono do César.

### 1. ~~`invoice_number` não tem unicidade~~ — ✅ FECHADO em 08/09 (migration 025)

O César autorizou a consulta antes de criar o índice, e ela era necessária: criar com
duplicata viva teria falhado. **A base estava limpa** — nenhuma NF repetida, 6 cupons
com NF de 8 no total. Provado depois em transação com rollback: relançar uma NF
existente em outro cupom é recusado pelo banco.

O texto original do achado fica abaixo, porque explica por que a trava importa.

#### O achado, como foi registrado em 02/09

Verificado no banco de produção: nenhum índice, nenhuma constraint, nenhum EXCLUDE.
`invoice_number` é `text` nullable, e a única regra é o CHECK da 002 (`verified` exige
NF preenchida).

Hoje isso significa que **uma venda pode gerar comissão duas vezes**. Com o Indique um
Amigo, a mesma moto poderia carregar R$300 de desconto do indicador, R$300 do amigo e
R$300 de PIX, tudo amarrado à mesma nota.

O conserto é um `unique index (invoice_number) where invoice_number is not null`. Antes
precisa de uma consulta de leitura: **criar o índice com duplicata viva falha**, e não
se sabe se já existe NF repetida na base.

### 2. O Financeiro pode reescrever o retrato de comissão do cupom que ele paga

`coupons_guard_non_admin_update` (`003:70-86`) lista campo a campo o que o Financeiro
não pode alterar: `customer_*`, `coupon_number`, `influencer_id`, `campaign_id`,
`expires_at`, `created_at`, `status`, `seller_id`.

**Ficaram de fora:** `partnership_id`, `discount_type`, `discount_value` e
`commission_per_sale` — justamente o retrato que a migration 008 criou para impedir que
renovar parceria reescrevesse comissão já paga. A policy de UPDATE deixa o Financeiro
passar, então o trigger é a única camada, e ela tem o buraco.

Sem indício de uso. É lacuna, não incidente. O conserto é somar os quatro campos à lista.

### E uma coisa que não é buraco, mas todo mundo vai supor errado

**Os dois triggers de `coupons` não valem no caminho real de criação.** Os dois começam
com `if auth.uid() is null or public.is_admin() then return new; end if;` (`003:141-143`
e `003:66-68`), e `auth.uid()` é NULL para `service_role` — que é o que
`createAdminClient()` usa, nas duas rotas que criam cupom.

Eles existem para barrar um lojista batendo direto na API REST com o token dele, e
nisso funcionam. Mas **regra nova escrita como trigger nesse padrão nasce sem efeito.**
O que sobrevive ao `service_role` é `unique index`, `check constraint` e FK.
