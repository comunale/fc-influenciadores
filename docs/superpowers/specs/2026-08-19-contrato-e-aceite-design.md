# Contrato e aceite

**Data:** 2026-08-19
**Status:** aguardando revisão do César
**Subsistema 6** do fc-influenciadores

## O que é

Hoje o contrato é um `.txt` que o César preenche à mão e manda para a pessoa assinar. O sistema não sabe que ele existe.

Este módulo traz o contrato para dentro: o texto vira um modelo com campos, o sistema preenche com os dados da parceria, o influenciador lê e aceita no portal dele, e **o link só liga depois disso**.

## Por que o aceite trava o link

Decidido pelo César em 19/08 sobre as alternativas de não travar nada ou travar só o pagamento.

É o que dá dente ao contrato. Sem isso, "assinar" vira uma etapa paralela que alguém esquece — e o esquecimento só aparece quando dá problema. Com o link amarrado ao aceite, é impossível ter alguém divulgando sem contrato: o link simplesmente não existe antes.

**As parcerias de @caiiuxo e @mariananavi ficam isentas.** Elas começaram antes do contrato existir no sistema, e desligar o link delas para cobrar uma assinatura retroativa seria punir as duas por uma decisão nossa. Mecanismo: `partnerships.contract_required`, que nasce `true`; a migração marca essas duas como `false`.

**@carolvilex fica ativa e NÃO isenta.** A parceria dela seguiu de pé (uma venda em maio), mas o César não a incluiu na isenção. Consequência a confirmar antes de subir: quando este módulo entrar no ar, o link dela para até ela aceitar um contrato.

## O contrato não é escrito por IA

O César ofereceu conectar um token do ChatGPT para gerar o texto. **Não vamos.**

Um contrato precisa sair idêntico toda vez, e a prova do aceite depende de conseguirmos afirmar: *este é exatamente o texto que ele aceitou*. Um modelo de linguagem redigindo na hora produz variações sutis — e uma variação sutil numa cláusula de pagamento é precisamente o problema que a ferramenta existe para evitar.

Preencher campos num modelo é substituição de texto: determinístico, testável, sem surpresa.

Onde IA faria sentido, um dia: revisar o **modelo** quando o César o edita, apontando contradição ou cláusula vaga. A IA opina, o humano decide, e ela nunca toca no texto que vai para o influenciador. Fora de escopo aqui.

## O fluxo

```
César cria a parceria
   ↓
sistema gera o contrato, com o que já sabe
   ↓
influenciador entra no portal e vê "Contrato pendente"
   ↓
ele preenche o que falta (CPF, estado civil, endereço)
   ↓
lê o contrato inteiro, já preenchido
   ↓
aceita  →  link liga na mesma hora
```

### Quem preenche os dados pessoais

O contrato precisa de CPF, estado civil e endereço do influenciador — dados que o sistema não tem.

**Os dois lados preenchem** — pedido do César em 19/08.

- **O César**, na ficha do influenciador, quando já tem os dados em mãos (é o caso de quem ele já conhece, ou de quem mandou por WhatsApp).
- **O influenciador**, no portal, antes de aceitar. Se o campo estiver vazio, ele preenche; se o César já preencheu, ele **confere e corrige** — é dado dele, e conferir antes de assinar é o comportamento certo.

É o mesmo formulário, alcançado por duas portas. O contrato não é gerado enquanto faltar campo obrigatório, dito com clareza nas duas telas.

Deixar o influenciador preencher poupa o César de digitar endereço e CPF a cada parceria nova, e a Cláusula 12ª já o faz declarar que as informações são verdadeiras — então ter sido ele a digitar fortalece a prova em vez de enfraquecê-la.

**Isto muda a regra de "o portal é somente leitura", definida em 19/08.** O César liberou a escrita no mesmo dia, com uma condição: *"só separa do restante para não ter problemas de segurança"*.

### Como a escrita fica separada

A regra: **o influenciador nunca recebe política de INSERT ou UPDATE em tabela nenhuma.** Toda escrita passa por uma função `security definer` que descobre sozinha de quem é o registro, via `meu_influencer_id()`. Ele não consegue sequer dizer qual linha quer alterar — o alvo é derivado da sessão, não vem do pedido.

É a mesma forma da leitura, decidida ontem depois de descobrir que RLS filtra linha e não coluna. Vale repetir o padrão porque ele resolve a mesma classe de problema: superfície estreita, alvo não escolhível.

| O que ele escreve | Por onde | O que NÃO alcança |
|---|---|---|
| a própria senha | Auth do Supabase | nenhuma tabela nossa está envolvida |
| os próprios dados do contrato | `portal_salvar_meus_dados()` | só `influencer_contract_data`, só a linha dele |
| o aceite do contrato | `portal_aceitar_contrato()` | muda `status` para aceito e grava data/IP. Não toca em valor, prazo nem texto |

A última é a mais delicada: um influenciador que consiga editar o corpo do próprio contrato depois de gerado destrói toda a prova. Por isso a função grava o aceite e nada mais — não existe caminho que aceite um corpo de texto vindo dele.

**A troca de senha já está no ar** (19/08), e é o caso mais limpo da regra: a senha vive no Auth do Supabase, que é outro sistema. Não há tabela, política ou coluna do fc-influenciadores envolvida — a separação é estrutural, não uma escolha que alguém possa desfazer sem perceber.

Os dados vão para uma tabela própria, `influencer_contract_data`, alcançável por admin e pelo próprio influenciador. Fora de `influencers`, que o Lojista lê — ele não tem por que ver o endereço de ninguém.

## O modelo e os campos

O texto do contrato vira um modelo com marcações. A partir do `.txt` que o César escreveu, os campos são:

| Campo | De onde vem |
|---|---|
| `{{influenciador.nome}}` | cadastro |
| `{{influenciador.estado_civil}}` | preenchido por ele |
| `{{influenciador.cpf}}` | preenchido por ele |
| `{{influenciador.endereco}}` `{{influenciador.cep}}` | preenchido por ele |
| `{{parceria.vigencia}}` | `starts_at` e `ends_at` da parceria |
| `{{parceria.comissao}}` + extenso | `commission_per_sale` |
| `{{parceria.fee}}` + extenso | `fee_amount` |
| `{{influenciador.link}}` | `coupon_code` |
| `{{contrato.imagem_meses}}` | 6 por padrão, editável |
| `{{contrato.data}}` | data do aceite |

O valor por extenso é gerado pelo sistema — escrever "quinhentos reais" à mão é onde nasce divergência entre número e texto, e em contrato o extenso costuma prevalecer.

**O prazo vem da PARCERIA, não da campanha.** A campanha hoje é só o modelo do cupom (desconto, validade, texto). Prazo, fee e comissão vivem na parceria desde 18/08.

## Correções que o texto atual precisa

Levantadas na análise de 19/08 e decididas pelo César. Entram como modelo inicial:

**Cláusula 9ª, Parágrafo 2º — a validação tem dois passos.** O texto diz que a equipe de vendas faz a "validação final". No sistema, ela faz a primeira metade; a venda só conta para comissão depois que o Financeiro confere contra a nota fiscal. Prometer que a loja decide sozinha cria expectativa que o processo não cumpre.

**Cláusula 9ª, Parágrafo 1º — o print não é o mecanismo.** O que vale é o número do cupom; o print é um dos jeitos de carregá-lo até a loja, junto com o QR. O texto passa a falar em apresentação do cupom, validada no sistema.

**Cláusula 9ª — falta o fee.** O texto tem um item "a)" e nenhum "b)". O sistema modela fee fixo com data de pagamento, e há parcerias com R$ 500 registrados. Entra como item b).

**Cláusulas 7ª e 8ª — o prazo estava fixo em 30 dias.** Vira campo.

**Cláusula 6ª — "até 6 meses" vira "de 6 meses".** O "até" sugere que pode ser menos sem dizer quem decide. Contado a partir do encerramento da vigência, como o texto já dizia.

**Cláusula 8ª — nova regra de descumprimento.** Decidida pelo César, e substitui a perda integral de bonificações, que era a parte mais frágil do texto:

> Apagou o conteúdo antes do fim da vigência → o contrato e a parceria são encerrados. As bonificações por vendas já realizadas e confirmadas **continuam devidas e são pagas**, porque a moto foi vendida. O fee fixo eventualmente pago **deve ser restituído**, porque a contrapartida dele — manter o conteúdo no ar — não foi cumprida.

É mais defensável que a versão anterior: separa o que foi entregue do que não foi, em vez de tratar tudo como perda.

**Falta uma cláusula sobre os dados dos clientes.** O link coleta CPF, telefone e e-mail de pessoas. O sistema já garante que o influenciador não os alcança; o contrato precisa dizer que esses dados são da FoxCycles e que ele não tem direito a eles.

**Falta dizer como o pagamento é feito** e se ele emite nota. Pessoa física e PJ têm tratamentos tributários diferentes, e é a origem clássica de briga depois do primeiro pagamento. Fica registrado como pendência do César com o contador — não é decisão que eu tome.

## O descumprimento não é detectado sozinho

**O sistema não tem como saber que um post foi apagado.** O Instagram não avisa ninguém, e não vamos varrer perfil de terceiro.

Então existe uma ação explícita — *Registrar descumprimento* — na tela do contrato. Quem percebe, registra. A partir daí o resto é automático: encerra a parceria, desliga o link, congela a comissão devida até a data e abre a pendência de restituição do fee.

Dizer isso em voz alta na spec porque "automático" é a palavra que cria a expectativa errada: automático é o efeito, não a percepção.

## Ajustes

Duas coisas diferentes, que o César chamou junto de "fazer ajustes":

**Editar o modelo** — vale para contratos novos. Cada edição salva uma versão nova; as antigas continuam existindo porque contratos antigos apontam para elas.

**Ajustar um contrato específico** — antes do aceite, o César pode mexer no texto daquele contrato (acrescentar uma cláusula negociada, mudar um prazo). Depois do aceite, congela.

## O aceite congela o texto

Decidido pelo César em 19/08. O contrato guarda o **texto final inteiro**, não uma referência ao modelo. Editar o modelo depois não altera nada do que já foi aceito.

Junto vão data, hora, IP e navegador. É o que permite responder "o que exatamente ele aceitou, e quando" — sem isso o aceite não vale como prova.

Aceite eletrônico é válido no Brasil sem certificado ICP-Brasil; o que sustenta é o registro de quem, quando e sobre qual texto. **A revisão jurídica do texto continua sendo do César** — este módulo garante o processo, não o mérito das cláusulas.

## Menus e páginas

Área própria, como o César pediu:

```
/admin/influencers/[id]     → ficha ganha os dados de qualificação (César preenche)
/admin/contratos            → lista: influenciador, parceria, situação, data do aceite
/admin/contratos/modelo     → editor do modelo, com a lista de campos e prévia
/admin/contratos/[id]       → um contrato: texto, ajustes, registrar descumprimento
/portal/contrato            → onde o influenciador preenche, lê e aceita
```

### O portal completo, depois desta entrega

O César pediu em 19/08 que o portal reúna tudo o que é dele:

| Aba | O que mostra | Estado |
|---|---|---|
| Resumo | parceria vigente e os números dela | ✅ existe |
| **Seu link** | o link da bio, com copiar | ✅ existe |
| Vendas | cupons gerados, primeiro nome, situação | ✅ existe |
| **Comissões** | gerada, paga, a receber, por parceria | ✅ existe no Resumo |
| **Contrato** | preencher, ler, aceitar, e depois consultar quando quiser | 🔨 esta entrega |

O contrato entra como aba nova no menu do portal. Depois de aceito ele **não some**: fica consultável, com a data do aceite visível. Contrato que desaparece depois de assinado é a reclamação clássica de quem assina — e aqui não custa nada mantê-lo.

Enquanto houver contrato pendente, o portal abre nele: sem aceite não há link, então mostrar o Resumo primeiro seria mostrar uma tela vazia sem dizer por quê.

Só admin nas três primeiras. O Financeiro lê a lista — ele precisa saber se há contrato aceito antes de pagar — e não edita.

## Segurança

Mesmas três camadas do resto do sistema.

| Camada | Como |
|---|---|
| Tela | rotas de contrato só aparecem para admin |
| Rota | `requireRole` no que edita; o aceite exige ser o dono do contrato |
| Banco | RLS: o influenciador lê e aceita **apenas** o contrato da parceria dele |

O aceite é a primeira escrita que um usuário externo faz neste sistema. A política de UPDATE precisa ser estreita ao ponto de permitir mudar `status` para aceito e nada mais — nem valor, nem prazo, nem texto. Um influenciador que consiga editar o corpo do próprio contrato depois de gerado destrói toda a prova.

## Com o que isso conversa

O César pediu em 19/08 que toda demanda seja pensada como sistema. As bordas
que este módulo toca, e que entram na mesma entrega:

| Parte do sistema | O que muda |
|---|---|
| **Parceria** | ganha `contract_required`. Criar parceria passa a gerar contrato |
| **Link público** `/c/[code]` | deixa de abrir enquanto o contrato não for aceito |
| **Regra do link** (`linkAtivo`) | ganha a condição do contrato, junto com influenciador ativo e parceria vigente |
| **Portal** | ganha a aba Contrato e a escrita dos dados dele |
| **Ficha do influenciador** | ganha os dados de qualificação |
| **Renovação** | parceria nova exige contrato novo. Renovar sem assinar deixa o link desligado, e a tela precisa dizer isso |
| **Financeiro** | passa a ver se há contrato aceito antes de marcar pago, e ganha a pendência de restituição de fee |
| **Descumprimento** | encerra parceria, desliga link, congela comissão devida, abre restituição |
| **Dashboard** | ganha "contratos aguardando aceite", ao lado de "parcerias vencendo" |

**A borda mais afiada é a renovação.** Hoje renovar encerra uma parceria e abre
outra, e o link continua funcionando sem interrupção. Com o contrato
obrigatório, renovar **desliga o link** até o influenciador assinar de novo — e
alguém que renovou na sexta pode passar o fim de semana sem link sem entender
por quê. A tela de renovação precisa avisar isso antes de confirmar, e o portal
precisa deixar o contrato pendente na cara dele.

**A segunda é o Financeiro.** A restituição de fee é dinheiro que entra, não que
sai — o oposto de tudo que aquela área faz hoje. Isso pertence ao subsistema 2
(fechamentos e pagamentos), ainda não construído; aqui fica só o registro da
pendência, e o subsistema 2 a resolve. Registrado no BACKLOG para não virar
dívida esquecida.

## Fora de escopo

- Aditivo contratual depois do aceite. Renegociou, gera contrato novo na parceria nova.
- Assinatura com certificado ICP-Brasil.
- Envio por e-mail — descartado no projeto. O contrato vive no portal.
- Detecção automática de post apagado.
- IA gerando ou revisando texto.
