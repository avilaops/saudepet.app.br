# ICP e personas pagantes: Saúde Pet

> Documento de trabalho comercial. Complementa [`parcerias.md`](./parcerias.md), que descreve
> o **módulo** de parceiros; aqui está **quem compra, por quê, e o que ainda falta para
> conseguirmos vender para cada um**.
>
> Escrito por Claude em 27/08/2026, a partir do que está no banco de produção e no código
> não de suposição de mercado. Onde há estimativa, está marcado como estimativa.

---

## Antes de tudo: três formas diferentes de o dinheiro entrar

Os seis perfis pedidos não compram a mesma coisa. Tratar todos como "cliente" esconde a
diferença que mais importa comercialmente:

| Mecânica | Quem paga assim | Dinheiro entra | Já funciona? |
|---|---|---|---|
| **Assinatura** | Veterinário autônomo, tutor | Todo mês, na frente | ✅ Sim, self-service |
| **Take rate no atendimento** | Veterinário (desconto no repasse) | Por atendimento realizado | ✅ Sim, 15% |
| **Comissão sobre indicação convertida** | Clínica, hospital, laboratório, farmácia, negócio de indicação | Só quando o parceiro fatura | ⚠️ API pronta, **sem tela** |

A terceira mecânica é a de cinco dos seis perfis deste documento. Ela não custa nada para o
parceiro na assinatura, mas **exige que ele reporte o próprio faturamento**. Isso muda tudo:
a venda não é sobre preço, é sobre confiança e sobre rotina operacional. Um parceiro que
concorda e nunca reporta é indistinguível de um parceiro que não existe.

### O que já está no ar hoje

Números lidos do banco de produção em 27/08/2026:

**Planos ativos**

| Plano | Público | Mensal |
|---|---|---|
| Clube Vet Essencial | veterinário | R$ 49,90 |
| Clube Vet Completo | veterinário | R$ 99,90 |
| Veterinário Pro (Parceiro Credenciado) | veterinário | R$ 149,90 |
| Saúde PET Básico (10% desc., 2 atend.) | tutor | R$ 29,90 |
| Saúde PET VIP, Família Multipet (20% desc., ilimitado) | tutor | R$ 69,90 |

**Preços de serviço** (padrão por cidade, configurável): domiciliar R$ 150 · consulta de rotina
R$ 130 · vacinação R$ 120 · avaliação R$ 120 · emergência R$ 150 · teleorientação R$ 80.
**Comissão da plataforma: 15%**, valor configurado em `ConfiguracaoTenant.comissao_plataforma_pct`,
que é o que `payment.service` aplica de fato. Comissão padrão de parceiro: 10% (default do
schema; nenhuma regra cadastrada ainda).

> **Atenção, duas taxas no código.** O caminho antigo (`POST /api/v1/billing/pagamentos` →
> `billing.controller`) calcula a comissão a partir de `CidadeCobertura.percentual_plataforma`,
> com fallback de **20%**, e continua montado. Nenhuma tela o chama e ele nunca gerou transação
> (0 registros em `Transacao`), então nada foi cobrado errado, mas são duas fontes de verdade
> para o mesmo número, e a que vale é a de 15%.

**Base atual:** 3 veterinários · 5 tutores · 5 solicitações · 1 loja no Mercado ·
**0 parceiros** · **0 assinaturas** · 0 cidades de cobertura configuradas.

A empresa não foi inaugurada. Todo "volume estimado" aqui é hipótese a validar, e está
marcado como tal, nenhum número deste documento veio de cliente real.

---

## O gargalo que decide a ordem de ataque

**Não existe portal do parceiro.**

A API está completa: `PartnerUser`, `requirePartnerAccess`, `GET /referral/partner/:id`,
`POST /referral/:id/register-conversion`, mais dez rotas de gestão e seis de comissão. O
schema tem `Partner`, `PartnerUnit`, `PartnerService`, `CommissionRule`, `Referral`,
`ReferralConversion`, `CommissionSettlement`, `PartnerReview`, `ReferralDocument`.

O que não existe é **tela**. As únicas duas interfaces são `/tutor/parceiros` (o tutor vê o
diretório) e `/admin/parceiros` (nós administramos). Na prática, hoje:

- o parceiro **não vê** a indicação que recebeu;
- **não confirma** atendimento nem informa o valor cobrado;
- cada conversão depende de alguém nosso fazer na mão pelo painel de admin.

Isso impõe um teto duro e concreto: **dá para operar 2 ou 3 parceiros no WhatsApp; não dá
para operar 20.** Qualquer meta comercial acima disso está vendendo o que não temos como
entregar, e a regra da casa é que API sem tela não é entrega.

**Consequência para este documento:** a ordem recomendada no fim não é por tamanho de
mercado. É por quanto produto falta para o dinheiro efetivamente entrar.

---

## 1. Veterinário autônomo

**O único dos seis que conseguimos vender hoje, sozinho, sem ninguém da nossa equipe no meio.**

| | |
|---|---|
| **Decisor** | Ele mesmo. Sem comitê, sem sócio, sem compras. Ciclo de decisão medido em minutos, não semanas. |
| **Tamanho** | Solo ou com um auxiliar. MEI ou PF. Carro próprio, maleta própria, CRMV ativo. |
| **Volume estimado** | *Hipótese:* 20–60 atendimentos/mês quando a agenda está cheia; muito menos no começo, que é exatamente a dor. |
| **Dor principal** | **Agenda ociosa.** Ele tem a habilitação, o carro e o equipamento; falta demanda. Em segundo lugar: o administrativo vive no WhatsApp, cobrança, remarcação e prontuário misturados na mesma conversa. |
| **Gatilho de compra** | Mês fraco. Recém-saído de uma clínica. Recém-formado sem carteira de clientes. Mudança de cidade. |
| **Objeções** | 1) *"Vou pagar mensalidade sem garantia de chamado."*, **a mais dura, e é justa: cobramos antes de entregar demanda.** 2) *"15% é muito."* 3) *"E se o tutor me chamar direto na próxima?"* |
| **Sistema atual** | WhatsApp + Google Agenda + caderno. Alguns usam Vetus, Simples Vet ou Vetsoft, quase sempre herdado de uma clínica onde trabalharam. |
| **Critério de sucesso** | O plano se pagar. E isso é aritmética, não retórica: **um** atendimento domiciliar rende R$ 127,50 líquidos para ele (R$ 150 − 15%). O Essencial custa R$ 49,90. **Um atendimento por mês paga o plano duas vezes e meia.** Dois pagam o Completo. Dois também já pagam o Pro. |

### O argumento comercial, e o furo dele

"Um atendimento paga o mês inteiro" é o melhor argumento que temos, porque é verificável na
frente do cliente com uma conta de dois números.

O furo: **o plano é cobrado antes do primeiro atendimento existir.** Se ele assina e passa o
primeiro mês sem chamado, provamos exatamente a objeção dele. Vale considerar cobrar o Clube
Vet só a partir do primeiro atendimento recebido, ou devolver a mensalidade quando o mês
fecha sem chamado. Custa pouco (não temos demanda para dar de graça a muita gente) e remove
a única objeção que não tem resposta hoje.

---

## 2. Negócios de indicação

*Pet shop, banho e tosa, creche, hotelzinho, adestrador, ONG, canil, agropecuária de bairro.*

**O único perfil que resolve o problema que realmente temos: falta de tutores.**

| | |
|---|---|
| **Decisor** | O dono, atrás do balcão. Decide na hora, na conversa. |
| **Tamanho** | 1 a 3 funcionários. Bairro. Fatura por movimento de rua. |
| **Volume estimado** | *Hipótese:* 100–400 tutores distintos passam por mês num pet shop de bairro ativo. Uma fração pequena vira indicação, mas o cliente dele **já é** dono de pet, o que torna a lista qualificada por natureza. |
| **Dor principal** | Não é dor, é oportunidade: renda extra sem estoque e sem custo. Em segundo plano, uma real: **ele é perguntado sobre saúde do animal o tempo todo e não pode responder.** Encaminhar para alguém resolve um constrangimento diário. |
| **Gatilho de compra** | Um cliente perguntando "você conhece um veterinário que vá em casa?", o que acontece toda semana. |
| **Objeções** | 1) *"Vocês vão pegar meu cliente."* 2) A operacional, que é a que de fato mata: **quem lembra de indicar no meio do movimento?** |
| **Sistema atual** | Nenhum. Caderno e WhatsApp. Sem sistema para integrar, o que é vantagem, não problema. |
| **Critério de sucesso** | Indicações por mês por parceiro, e custo por tutor adquirido comparado ao que gastaríamos em anúncio pelo mesmo tutor. |

### Por que este vem cedo mesmo sem portal

O fluxo aqui é **invertido**: ele manda demanda para nós, não recebe indicação nossa. Isso
significa que **funciona sem portal do parceiro**, um QR Code no balcão com cupom
identificado já rastreia a origem e já permite pagar o dono.

É o único dos seis que dá para ativar esta semana, com material impresso e uma conversa.

---

## 3. Laboratório

**O encaixe mais forte dos seis: porque resolvemos uma dor real dele em vez de só pedir comissão.**

| | |
|---|---|
| **Decisor** | Dono ou gerente comercial. Laboratório já vende B2B para clínicas, tem representante na rua e cabeça comercial formada. A conversa é mais fácil e mais técnica. |
| **Tamanho** | Atende de dezenas a centenas de clínicas. Estrutura de coleta, transporte e laudo. |
| **Volume estimado** | *Hipótese:* alguns milhares de exames/mês num laboratório regional. O que importa não é o total dele, é o **incremento** que a coleta domiciliar traz. |
| **Dor principal** | **Coleta.** O laboratório depende da clínica coletar; onde não há clínica, não há amostra. Um veterinário que já está dentro da casa do animal pode coletar ali. Isso é oferta nova, não desconto. |
| **Gatilho de compra** | Querer volume incremental sem abrir unidade nem contratar coletador. |
| **Objeções** | Técnicas e legítimas: cadeia de frio, identificação da amostra, tempo até o processamento, taxa de recoleta. Um laboratório sério vai perguntar isso antes de perguntar o preço, e deve mesmo. |
| **Sistema atual** | LIS próprio com portal de laudos. Integração custa caro e não deve ser prometida cedo. |
| **Critério de sucesso** | Amostras/mês vindas de coleta domiciliar **com taxa de recoleta comparável à da coleta em clínica.** Se a recoleta subir, o resto não importa. |

### O que falta no produto

`SolicitacaoExame` já existe e já tem tela (o veterinário pede exame dentro do prontuário).
**Mas `nome_exame` é texto livre**, não está ligado a `PartnerService`. Então hoje um pedido
de hemograma não vira, sozinho, uma indicação rastreável para o laboratório parceiro.

Ligar o pedido de exame ao catálogo do parceiro é o que transforma este perfil de conversa em
receita. É trabalho de produto, não de vendas.

---

## 4. Farmácia veterinária / manipulação

| | |
|---|---|
| **Decisor** | Dono, quase sempre com o farmacêutico responsável junto na conversa. |
| **Tamanho** | Uma a três lojas, ou manipulação com entrega regional. |
| **Volume estimado** | *Hipótese:* a conta que importa é a taxa de conversão receita→compra, não o tamanho dele. |
| **Dor principal** | **A receita vaza.** O veterinário prescreve e o tutor compra em qualquer lugar, cada vez mais nos grandes varejistas online. A farmácia de bairro perde uma venda que já estava decidida. |
| **Gatilho de compra** | Perceber que a prescrição digital pode chegar nela com o nome do medicamento já definido. |
| **Objeções** | 1) Regulatório: receituário controlado tem regra de CRMV e MAPA, e não dá para tratar como e-commerce comum. 2) Margem apertada em medicamento de linha, 10% de comissão pode ser metade do lucro do item. |
| **Sistema atual** | PDV comum de farmácia/varejo. Nada específico de veterinária. |
| **Critério de sucesso** | Percentual de prescrições emitidas na plataforma que viram compra na farmácia parceira. |

### O que falta no produto

`PrescricaoItem` existe e tem tela, com `medicamento`, `concentracao`, `forma_farmaceutica`,
`posologia` e `duracao_dias` já estruturados. Está **mais pronto que o exame**, mas também
não conversa com `PartnerService`.

O bloqueio maior aqui não é técnico, é **regulatório**: antes de vender para farmácia é
preciso saber o que a legislação permite encaminhar digitalmente, especialmente controlado.
Isso é pesquisa, e é pré-requisito da primeira reunião, não algo para descobrir depois de
prometer.

---

## 5. Clínica de pequeno / médio porte

| | |
|---|---|
| **Decisor** | O dono, que quase sempre **é veterinário e atende pacientes**. Não existe comprador separado. Consequências práticas: reunião só antes das 8h ou depois das 19h; ele avalia com cabeça de clínico, não de gestor; e se confiar, decide rápido. |
| **Tamanho** | 1–3 consultórios, 2–6 veterinários. *Hipótese a confirmar:* faturamento entre R$ 50 mil e R$ 300 mil/mês. |
| **Volume estimado** | *Hipótese:* 150–600 atendimentos/mês. |
| **Dor principal** | **Perde o tutor que não quer sair de casa, e perde o que precisou de atendimento fora do horário.** O cliente que foi ao 24h de madrugada muitas vezes não volta. Em segundo lugar: veterinário ocioso na folha em horário morto. |
| **Gatilho de compra** | Descobrir que um cliente antigo trocou de clínica por causa de atendimento domiciliar. Ou ter um vet contratado com agenda vazia à tarde. |
| **Objeções** | **"Vocês vão roubar meu cliente."** É a objeção central, é legítima, e não tem resposta de vendedor: se o Saúde Pet atende o pet dela na casa do tutor, de quem passa a ser o cliente? |
| **Sistema atual** | Vetus, Simples Vet, Vetsoft, Provet, ou papel. Costumam estar insatisfeitos, mas trocar sistema dá muito trabalho e eles sabem. |
| **Critério de sucesso** | Atendimentos **incrementais**, os que ela não teria feito. Se o número dela não sobe, a parceria é só desconto. |

### A decisão de produto que precisa vir antes da venda

Enquanto a clínica for **destino de indicação**, ela nos vê como concorrente que cobra
pedágio. A objeção está certa.

O caminho que a desarma é deixar a clínica ser a **fornecedora** do atendimento domiciliar:
o chamado na região dela vai para o veterinário *dela*, com a marca dela junto. Aí paramos
de disputar o cliente e passamos a vender canal, que é o que ela precisa.

Isso é política de produto, não argumento comercial. **Vender antes de decidir isso é vender
uma briga.**

---

## 6. Hospital veterinário 24h

| | |
|---|---|
| **Decisor** | Sócio-administrador ou gerente. Aqui existe estrutura e processo: o ciclo é mais longo, mais formal, e passa por mais de uma pessoa. |
| **Tamanho** | Internação, centro cirúrgico, plantão 24h, 10–40 funcionários. |
| **Volume estimado** | Alto, concentrado em emergência e madrugada. |
| **Dor principal** | **Não é falta de demanda, é margem e triagem.** Recebem muito caso que não era emergência e ocupa a equipe mais cara da operação. |
| **Gatilho de compra** | Perceber que a teleorientação filtra o que não precisa vir. E o inverso: receber o caso que É emergência já triado, com histórico. |
| **Objeções** | *"Não vou pagar comissão por paciente que chegaria sozinho."*, questão de **atribuição**, e eles têm razão em levantar: precisamos provar que a indicação criou a visita. |
| **Sistema atual** | Sistema hospitalar próprio, frequentemente robusto. Integração é cara e lenta. |
| **Critério de sucesso** | Casos novos **atribuíveis**, e queda de não-emergências na madrugada. |

### Por que ele fica por último

É o parceiro em que a comissão é mais difícil de justificar, porque a atribuição é ambígua, e
o único em que integração de sistema aparece cedo na conversa.

Em compensação, é o que mais dá **credibilidade**: "o Hospital X é parceiro" abre a porta de
clínica, de laboratório e de tutor. Por isso o modelo certo com ele provavelmente **não é
comissão**, é parceria de referência com contrapartida (nós triamos e mandamos o caso pronto;
ele nos manda o pós-alta que vira acompanhamento domiciliar). Vale mais como marca do que
como receita no primeiro ano.

---

## Ordem recomendada de ataque

Ordenada por **quanto produto falta para o dinheiro entrar**, não por tamanho de mercado:

| # | Perfil | Por que agora | O que falta |
|---|---|---|---|
| 1 | **Veterinário autônomo** | Único vendável hoje, self-service completo. Resolve nossa falta de oferta. | Nada. Só decidir se a primeira mensalidade fica condicionada ao primeiro atendimento. |
| 2 | **Negócios de indicação** | Resolve nossa falta de **demanda**, o problema real. Funciona sem portal. | QR Code + cupom identificado + material de balcão. Semanas, não meses. |
| 3 | **Laboratório** | Encaixe mais forte; resolvemos a dor de coleta dele. | Portal do parceiro **ou** um piloto conduzido na mão. Ligar `SolicitacaoExame` ao catálogo. |
| 4 | **Farmácia** | Prescrição já é estruturada no prontuário. | Pesquisa regulatória **antes** da primeira reunião. Ligar `PrescricaoItem` ao catálogo. |
| 5 | **Clínica pequeno/médio** | Mercado grande, mas a objeção central é de produto. | Decidir a política de propriedade do cliente. Sem isso, é vender briga. |
| 6 | **Hospital 24h** | Vale como credibilidade, não como receita imediata. | Modelo comercial diferente (referência com contrapartida, não comissão). |

**Atravessando os itens 3 a 6: o portal do parceiro.** Sem ele, cada conversão é trabalho
manual da nossa equipe, e o teto é de uns poucos parceiros. Ele é o desbloqueio de quatro dos
seis perfis.

---

## Números que precisam ser confirmados antes de virarem meta

Nada aqui foi inventado, mas nada aqui foi medido, porque não há cliente. Antes de qualquer
número deste documento virar meta comercial, buscar na fonte:

| O que | Onde buscar |
|---|---|
| Veterinários com CRMV ativo na região | CFMV / CRMV-SP, publicam registrados por UF |
| Quantidade de clínicas, hospitais e pet shops na cidade-alvo | Receita Federal, por CNAE 7500-1/00 (atividades veterinárias) e 4771-7/04 |
| Tamanho e crescimento do mercado pet brasileiro | Anuário ABINPET |
| População e domicílios da cidade de lançamento | IBGE |
| O que pode ser encaminhado digitalmente em receituário | Legislação CFMV/MAPA, **pré-requisito do perfil Farmácia** |
| Preço praticado por domiciliar concorrente na região | Pesquisa direta, ligando |

E as duas perguntas que só a operação responde, e que valem mais que todas as acima:

1. **Quanto custa trazer um tutor?** Só se sabe depois dos primeiros parceiros de indicação.
2. **Quantos atendimentos por mês um veterinário do Clube realmente recebe?** É a promessa
   implícita do plano. Enquanto for zero, a assinatura do veterinário é uma dívida com ele.

---

*Documentado por Claude em 27/08/2026. Fontes internas: banco de produção do Saúde Pet,
`prisma/schema.prisma`, rotas de `partner`/`referral`/`commission` e `docs/parcerias.md`.*
