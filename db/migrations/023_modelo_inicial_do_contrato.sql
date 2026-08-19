-- O modelo do contrato, versão 1.
--
-- É o texto que o César escreveu, com as correções levantadas na análise de
-- 19/08 e decididas por ele. As sete mudanças, e o porquê de cada uma:
--
-- 1. Cláusula 6ª: "até 6 meses" virou "de 6 meses". O "até" sugeria que podia
--    ser menos sem dizer quem decide.
-- 2. Cláusulas 7ª e 8ª: o prazo estava fixo em 30 dias e virou campo. A
--    parceria do @caiiuxo é de 60.
-- 3. Cláusula 8ª: nova regra de descumprimento. A anterior fazia o influenciador
--    perder TODAS as bonificações por apagar um post -- inclusive as de vendas
--    já feitas. Agora separa o que foi entregue do que não foi: a comissão da
--    venda continua devida porque a moto foi vendida, e só o fee volta.
-- 4. Cláusula 9ª: ganhou o item b) do fee fixo. O texto tinha um "a)" e nenhum
--    "b)", e o sistema modela fee desde sempre. Sai do contrato quando o fee é
--    zero, senão a cláusula diria "R$ 0,00 (zero reais)".
-- 5. Cláusula 9ª, § 1º: o print deixou de ser O mecanismo. O que vale é o
--    número do cupom; print, tela e QR são só formas de carregá-lo até a loja.
-- 6. Cláusula 9ª, § 2º: a validação passou a ser descrita em DUAS etapas. O
--    texto dizia que a equipe de vendas faz a "validação final", mas no sistema
--    ela faz a primeira metade -- a venda só conta depois que o Financeiro
--    confere contra a nota. Prometer o contrário criava expectativa que o
--    processo não cumpre, e discussão na hora de pagar.
-- 7. Cláusula 11ª, nova: os dados dos clientes são da FoxCycles. O link coleta
--    CPF, telefone e e-mail de pessoas; o sistema já garante que o influenciador
--    não os alcança, e agora o contrato diz isso.
--
-- As cláusulas seguintes foram renumeradas por causa da 11ª nova.
--
-- ESTE TEXTO PRECISA DE REVISÃO JURÍDICA. O sistema garante o processo -- quem
-- aceitou, quando, e sobre qual texto -- não o mérito das cláusulas.
--
-- Aplicada em 2026-08-19.

insert into public.contract_templates (versao, titulo, corpo, ativo)
values (1, 'Contrato de licença de uso de imagem, voz e parceria comercial', $modelo$
CONTRATO DE LICENÇA DE USO DE IMAGEM, VOZ E PARCERIA COMERCIAL

IDENTIFICAÇÃO DAS PARTES CONTRATANTES

LICENCIADA: FOX CYCLES COMERCIO E SERVICOS LTDA, com sede em São Paulo/SP, na Avenida Carlos de Campos, nº 584, bairro Pari, CEP 03028-001, inscrita no CNPJ/MF sob o nº 62.781.241/0001-72, neste ato representada por seu diretor Zhao Fengdi.

LICENCIANTE: {{influenciador.nome}}, {{influenciador.estado_civil}}, inscrito(a) no CPF/MF sob o nº {{influenciador.cpf}}, residente e domiciliado(a) na {{influenciador.endereco}}, CEP {{influenciador.cep}}.

As partes acima identificadas têm, entre si, justo e acertado o presente Contrato de Licença de Uso de Imagem, Voz e Parceria Comercial, que se regerá pelas cláusulas seguintes e pelas condições descritas no presente.


DO OBJETO E DA AUTONOMIA DE CONTEÚDO

Cláusula 1ª. O presente contrato tem por objeto a concessão de licença de uso de imagem, voz e nome do LICENCIANTE para a promoção dos veículos elétricos da LICENCIADA, atrelada a programa de bonificação por vendas via cupom de desconto exclusivo.

Cláusula 2ª. A criação, a frequência e a quantidade dos conteúdos produzidos para a divulgação do cupom nas redes sociais do LICENCIANTE ficam a critério e livre escolha deste, ciente de que seus ganhos bonificados dependem do volume de vendas efetivadas a partir de sua divulgação.

Parágrafo único. O LICENCIANTE compromete-se a sinalizar publicamente a natureza comercial das postagens, utilizando marcas de parceria paga e/ou hashtags como #publi e #parceriapaga, em estrita conformidade com as normas do CONAR.


DA LICENÇA DE IMAGEM E DIREITO DE USO DOS ARQUIVOS

Cláusula 3ª. O LICENCIANTE cede à LICENCIADA o direito não exclusivo de uso de sua imagem, voz, performance e dos arquivos brutos ou editados das produções audiovisuais criadas para esta parceria.

Cláusula 4ª. O LICENCIANTE compromete-se a não realizar postagens, publicidades, parcerias ou pronunciamentos comerciais para empresas concorrentes diretas da LICENCIADA no segmento de veículos elétricos, motos e mobilidade urbana durante a vigência deste contrato.

Cláusula 5ª. A LICENCIADA fica expressamente autorizada a utilizar, editar, adaptar, veicular e impulsionar (tráfego pago/anúncios) os referidos materiais em seus canais oficiais, incluindo redes sociais, Meta Ads, e-mail marketing e site institucional.

Cláusula 6ª. O prazo de autorização de uso da imagem e dos materiais pela LICENCIADA será de {{contrato.imagem_meses}} ({{contrato.imagem_meses_extenso}}) meses, contados a partir do encerramento da vigência deste contrato.


DO PRAZO E MANUTENÇÃO DOS CONTEÚDOS

Cláusula 7ª. Este contrato terá vigência de {{parceria.duracao}}, no período de {{parceria.vigencia}}, podendo ser renovado por iguais períodos mediante acordo formal por escrito entre as partes.

Cláusula 8ª. O LICENCIANTE compromete-se a manter visíveis e publicados em seus perfis das redes sociais todos os conteúdos criados no âmbito deste contrato durante todo o período de vigência, sendo vedada a exclusão ou o arquivamento prévio das publicações.

Parágrafo 1º. A exclusão ou o arquivamento de qualquer conteúdo antes do término da vigência importa o encerramento imediato deste contrato e da parceria, cessando desde logo a divulgação e a geração de novos cupons.

Parágrafo 2º. Ocorrida a hipótese do parágrafo anterior, as bonificações por vendas já realizadas e confirmadas permanecem devidas e serão pagas na forma da Cláusula 10ª, uma vez que a venda foi efetivada.
{{#se parceria.fee}}
Parágrafo 3º. Ocorrida a hipótese do Parágrafo 1º, a bonificação fixa prevista na alínea "b" da Cláusula 9ª, se já paga, deverá ser restituída à LICENCIADA no prazo de 10 (dez) dias, por não cumprida a contrapartida de manutenção dos conteúdos publicados.
{{/se}}

DA REMUNERAÇÃO E REGRAS DO CUPOM DE DESCONTO

Cláusula 9ª. Pela licença de uso de imagem e pelas ações de promoção, a LICENCIADA pagará ao LICENCIANTE:

a) Bonificação por Desempenho (Cupom): o valor de {{parceria.comissao}} ({{parceria.comissao_extenso}}) por cada veículo vendido presencialmente, computado a partir da 1ª (primeira) venda realizada.
{{#se parceria.fee}}
b) Bonificação Fixa: o valor de {{parceria.fee}} ({{parceria.fee_extenso}}), devido independentemente do volume de vendas, em contrapartida à produção e à manutenção dos conteúdos durante toda a vigência.
{{/se}}
Parágrafo 1º (Apresentação do cupom). Para fins de cômputo da bonificação, a venda deverá ser realizada na loja física da LICENCIADA, com pagamento devidamente confirmado e faturado, mediante a apresentação pelo cliente, no ato da compra, do cupom exclusivo gerado pelo link do LICENCIANTE ({{influenciador.link}}). O cupom é identificado por número próprio, e sua apresentação pode se dar por tela do aparelho, impressão ou leitura do código, sendo a conferência realizada no sistema da LICENCIADA.

Parágrafo 2º (Validação em duas etapas). A validação da venda vinculada ao cupom ocorre em duas etapas: (i) no ato do atendimento presencial, a equipe de vendas da LICENCIADA registra o uso do cupom no sistema; e (ii) posteriormente, o setor financeiro da LICENCIADA confere a venda contra a respectiva nota fiscal. Somente após a conclusão da segunda etapa a venda é considerada apurada para fins de bonificação.

Cláusula 10ª. A apuração das vendas efetivas será realizada ao término do período de vigência. O pagamento do valor apurado a título de bonificação será efetuado pela LICENCIADA no prazo de até 7 (sete) dias após o fechamento e a análise do relatório de cupons efetivamente convertidos em vendas pagas.

Parágrafo único. Não gerarão direito à bonificação os cupons aplicados em propostas de venda que venham a ser canceladas antes do faturamento do veículo ou que não tenham o pagamento integralmente confirmado e liquidado pela instituição financeira.


DOS DADOS PESSOAIS DOS CLIENTES

Cláusula 11ª. Os dados pessoais coletados dos clientes por meio do link e do cupom do LICENCIANTE — incluindo nome, CPF, telefone e endereço eletrônico — são tratados exclusivamente pela LICENCIADA, na qualidade de controladora, nos termos da Lei nº 13.709/2018.

Parágrafo único. O LICENCIANTE não recebe, não acessa e não detém qualquer direito sobre esses dados, sendo-lhe vedada sua utilização para qualquer finalidade. O acompanhamento da parceria pelo LICENCIANTE se dá exclusivamente por meio dos indicadores disponibilizados pela LICENCIADA em seu portal.


DA RESCISÃO

Cláusula 12ª. O contrato poderá ser rescindido:

a) Por mútuo acordo entre as partes;
b) Por justa causa, em caso de descumprimento de cláusulas contratuais.

Parágrafo único. Em caso de rescisão por justa causa imputável ao LICENCIANTE, aplicam-se as regras da Cláusula 8ª quanto às bonificações, e o LICENCIANTE deverá remover ou autorizar o ajuste dos materiais conforme as determinações da LICENCIADA.


DAS DISPOSIÇÕES GERAIS

Cláusula 13ª. O LICENCIANTE declara:
a) Ter capacidade civil plena para firmar este contrato;
b) Não possuir impedimentos legais ou contratuais para a cessão ora formalizada;
c) Que as informações prestadas são verdadeiras.

Cláusula 14ª. Este contrato não gera vínculo empregatício entre as partes, caracterizando-se como prestação de serviços eventuais.

Cláusula 15ª. Qualquer alteração neste contrato deverá ser feita por escrito e aceita por ambas as partes.

Cláusula 16ª. Em caso de conflito entre as cláusulas deste contrato e a legislação vigente, prevalecerá a legislação.


DA CONFIDENCIALIDADE E NÃO-DENIGRAÇÃO

Cláusula 17ª. O LICENCIANTE compromete-se a manter sigilo sobre as condições comerciais. Além disso, obriga-se a não realizar declarações públicas que possam afetar negativamente a imagem, a reputação ou a honra da marca FOX CYCLES.


DO FORO

Cláusula 18ª. Fica eleito o foro da Comarca de São Paulo/SP para dirimir quaisquer dúvidas ou controvérsias oriundas deste instrumento.


São Paulo/SP, {{contrato.data}}.


FOX CYCLES COMERCIO E SERVICOS LTDA
LICENCIADA

{{influenciador.nome}}
LICENCIANTE

Este instrumento é aceito eletronicamente pelo LICENCIANTE no portal da LICENCIADA. O aceite registra data, hora e endereço IP, e vincula esta exata versão do texto.
$modelo$, true);
