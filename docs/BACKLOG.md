# Backlog — o que falta

Lista única do que está pendente neste projeto. **Este arquivo existe porque as
pendências vinham sendo registradas no rodapé de planos antigos, na seção "fora
de escopo" — e é exatamente lá que as coisas morrem.** Em 18/08/2026 dois
pedidos do César quase se perderam assim.

Regra: ao terminar qualquer entrega, atualizar este arquivo. Ao começar
qualquer conversa, ler este arquivo.

Atualizado em 2026-08-18.

---

## Pedidos do César ainda não construídos

### 1. Dados bancários dos influenciadores (área do Financeiro)

**Pedido em:** 2026-08-18, junto com os outros quatro itens.
**Estado:** não existe nada. Nenhuma coluna, nenhuma tela.

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

### 3. Aviso de parceria perto do fim

**Estado:** o `partnership_ends_at` já existe e já derruba o link na data. Falta
o **aviso antes**, para o César fechar as vendas e pagar a comissão a tempo.

O `pg_cron` já está instalado (migration 007) e serve exatamente para isso.
Não há canal externo (e-mail foi descartado), então o aviso vive dentro do
sistema — um bloco no Dashboard.

### 4. Fluxo do QR code no balcão (anti-abuso)

**Spec aprovada em 2026-07-28**, nunca implementada.
`docs/superpowers/specs/2026-07-28-cupom-express-anti-abuso-design.md`

Tira a geração do cupom das mãos do vendedor: ele digita o @ do influenciador, a
tela mostra um QR, e o **cliente** preenche no próprio celular.

Ataca o problema pela prevenção, no balcão. O que já foi construído (NF,
Conferido, Pago, vendedor nomeado) ataca pela auditoria, depois da venda. Os
dois se complementam — hoje o vendedor ainda cria e valida um cupom sozinho.

---

## Dívidas técnicas conhecidas

| O quê | Por quê importa |
|---|---|
| **Pagamento do fixo (`fee_amount`) não é controlado** | Existe o valor no contrato, mas nenhum campo diz se saiu. A tela mostra separado e não soma em "a pagar", para não dar número errado. Um `fee_paid_at` resolveria. |
| **19 testes de banco dormindo** | `tests/permissions.db.test.ts` só roda com `SUPABASE_DB_URL`. O César preferiu não usar a senha do Postgres de produção — decisão certa. Para ligar, o caminho é um projeto Supabase separado para testes. |
| **`campaigns.active` perdeu a função** | Desde 18/08 não derruba mais link. Vale avaliar se o campo ainda faz sentido ou se confunde. |
| **Marcar comissão como paga é cupom a cupom** | Com volume maior vai pedir um "pagar tudo deste influenciador". |
| **`coupons` tem policies de UPDATE/DELETE amplas** | Já restritas a admin/finance, mas vale reauditar quando o portal do influenciador entrar. |
