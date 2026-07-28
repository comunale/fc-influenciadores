# Cupom express: tirar a geração das mãos do vendedor

**Data:** 2026-07-28
**Status:** desenho aprovado, aguardando plano de implementação

## O problema

O sistema existe para remunerar influenciadores que trazem clientes. Hoje o vendedor
da loja consegue, sozinho e em cerca de vinte segundos, criar um cupom já validado
atribuído a qualquer influenciador — sem nenhuma evidência de que a indicação
aconteceu. Isso permite usar o desconto como ferramenta de negociação e gera
comissão indevida.

### Evidência

Histórico real do programa, desconsiderando os dois cupons de teste do próprio admin:

```
05/06  @caiiuxo   Campinas 1   EXPRESS
13/06  @caiiuxo   Campinas 1   EXPRESS
20/06  @caiiuxo   Campinas 1   EXPRESS
22/06  @caiiuxo   Campinas 1   EXPRESS
30/06  @caiiuxo   Campinas 1   EXPRESS
```

Cem por cento das vendas do programa vieram do fluxo express, do mesmo vendedor,
para o mesmo influenciador. Nunca houve uma venda em que o cliente chegou à loja
com o cupom gerado por conta própria. Os sete cupons que clientes geraram pelo link
(23–24/05) nunca foram utilizados.

A R$ 500 de comissão por venda, são R$ 2.500 pagos sem evidência de indicação.

Isso não prova má-fé — o @caiiuxo pode ser o único influenciador que engajou de
verdade. O ponto é que hoje é impossível distinguir os dois casos.

### O cenário legítimo que precisa continuar funcionando

O cliente viu o influenciador, foi até a loja, mas não gerou o cupom antes de
chegar. A indicação é real; falta apenas a prova. Qualquer solução que impeça
essa venda de acontecer é pior que o problema.

## A decisão

Mover a geração do cupom do vendedor para o cliente. Se a indicação é real, o
cliente consegue prová-la; o vendedor, sozinho, não consegue fabricá-la.

### Fluxo novo no balcão

```
vendedor digita @caiiuxo
  → tela mostra QR CODE grande + "@caiiuxo · R$ 300 OFF"
    (o valor vem da campanha do influenciador, não é fixo:
     "Reinauguração Campinas" dá R$ 200, "Parceria Caiixo" dá R$ 300)
cliente escaneia com o PRÓPRIO celular
  → preenche os próprios dados na página pública
  → recebe FOX-XXXXXX
vendedor digita FOX-XXXXXX na mesma tela
  → valida
```

O QR aponta para `{SITE_URL}/c/{coupon_code}` — a landing page pública que já
existe. Não há tela nova para o cliente, e o projeto já usa a biblioteca `qrcode`
no cartão do cupom.

Efeito colateral positivo: a qualidade do cadastro melhora. Hoje o vendedor digita
e-mail e telefone de ouvido; passa a digitar quem é dono deles.

### Quem mantém o express

| Papel | Cadastro express |
|---|---|
| Moderador (vendedor) | Não. Vê apenas o QR. |
| Admin | Sim, como saída de emergência. |

Cliente sem celular, sem bateria ou sem paciência vira exceção que exige uma
ligação para o admin. Esse atrito é intencional.

**A tela esconder o formulário não basta.** Um moderador pode chamar
`POST /api/admin/coupon-express` diretamente. A rota precisa exigir
`role === 'admin'` — é ali que a regra é de fato aplicada.

### O furo remanescente

O vendedor determinado escaneia o QR com o próprio celular e preenche os dados.
Isso não é bloqueável sem verificação de identidade do cliente, o que não se
justifica no volume atual.

O que denuncia esse comportamento é o **telefone repetido**: o mesmo número
aparecendo em clientes diferentes. A decisão é **marcar e alertar, não bloquear** —
telefone repetido tem caso legítimo (marido e mulher, mãe e filho), e bloquear
geraria chamado de suporte no meio de uma venda. A dissuasão vem da visibilidade:
o vendedor saber que aparece.

Definição: dois ou mais cupons com o mesmo `customer_phone` mas `customer_cpf`
**diferentes**, em qualquer campanha. A comparação por CPF diferente é o que
torna o sinal afiado — mesmo telefone com o mesmo CPF é a mesma pessoa, caso
legítimo (existem duas campanhas ativas, "Reinauguração Campinas" e "Parceria
Caiixo", e a mesma pessoa pode participar das duas). Mesmo telefone com CPFs
diferentes é que significa "pessoas diferentes usando o mesmo número".

Os telefones já são gravados apenas com dígitos, então a comparação é direta.

### O alerta

Bloco "Atenções" no Dashboard do admin, listando os cupons com telefone repetido.

Limitação assumida: como o envio de e-mail foi descartado, não existe canal para
empurrar aviso para fora do sistema. O alerta só é visto por quem entra no painel.
Isso é aceitável porque o admin usa o sistema com frequência, mas não serve para
avisar em tempo real.

## Escopo

Dentro:

1. `/admin/validar` mostra QR em vez do formulário express quando o usuário é moderador
2. `/api/admin/coupon-express` passa a exigir `role === 'admin'`
3. Detecção de telefone repetido com CPFs diferentes
4. Marcação visual nas listas de cupons e participantes
5. Bloco "Atenções" no Dashboard

Fora — considerado e deliberadamente adiado:

- **Janela de verificação antes de pagar comissão.** Hoje a comissão sai logo após
  a venda, o que impede qualquer conferência. Mudar isso é conversa comercial com
  os influenciadores, não decisão técnica. É a melhoria de maior impacto depois desta.
- **Cota de express por vendedor.** Perde sentido enquanto o vendedor não tiver
  express nenhum.
- **Score de risco por atribuição.** Só se justifica com volume maior.
- **Notificação por WhatsApp ou e-mail.** Exige canal externo.

## Como saberemos que funcionou

Repetir a consulta de origem dos cupons daqui a um mês. Hoje: 100% express, 0%
orgânico. O sucesso é a fatia orgânica crescer — cupons gerados pelo cliente e
validados depois. Se o volume total de vendas do programa cair a zero, é sinal de
que as vendas anteriores não eram indicações reais, o que também é uma resposta.

## Riscos

| Risco | Mitigação |
|---|---|
| Cliente sem internet no balcão | A loja tem wi-fi. Admin ainda tem o express. |
| Venda perdida por atrito | O caminho tem os mesmos ~60 segundos; muda quem digita. |
| Vendedor usa o próprio celular | Detecção de telefone repetido. Não elimina, expõe. |
| Moderador chama a API direto | Checagem de papel no servidor, não só na tela. |
