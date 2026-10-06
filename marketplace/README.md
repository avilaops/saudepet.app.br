# Saúde Pet Mercado

O terceiro módulo do briefing, o marketplace de produtos. Esta pasta guarda a
**especificação, os dados de campo e os scripts de importação**. O código roda
dentro do `backend/` e do `frontend/` que já existem, e a razão é a decisão de
arquitetura da primeira linha abaixo.

---

## O que já está entregue (primeira fatia)

Da vitrine ao pagamento, ponta a ponta, com tela para os três papéis:

| Papel | Onde | O que faz |
| --- | --- | --- |
| **Tutor** | `/tutor/mercado` | Vê as lojas da cidade, filtra por espécie e categoria, busca, abre o produto, enche o carrinho, escolhe retirada ou entrega combinada, paga por Pix ou cartão, acompanha e cancela |
| **Lojista** | `/mercado/loja` | Cadastra a empresa, monta o catálogo (com custo, margem e preço sugerido), envia para análise, recebe pedido pago, separa, marca como pronto, conclui ou cancela |
| **Plataforma** | `/admin/mercado` | Aprova, recusa ou suspende loja com motivo escrito e trilha de auditoria; define comissão por loja; enxerga faturado, comissão e repasse separados |

**Fora desta fatia, de propósito:** entrega por entregador. O valor
`entregador` já existe no enum `EntregaMercado` - mudar enum em Postgres exige
transação própria, e deixar o buraco aberto agora evita uma migração de tipo no
meio da operação depois. Mas `fecharPedido` **recusa** esse valor: prometer em
tela uma entrega que não sai é pior do que não oferecer.

## Segunda fatia: 27/08/2026 (no ar)

O que o plano comercial de 27/08 (Todoist, "Prospecção / Canais de Vendas")
pedia do produto para as Fases 0 a 2, e que não existia:

| Pedido do plano | O que entrou |
| --- | --- |
| "Definir raio de entrega e política de frete" | **Entrega pela própria loja** (`EntregaMercado.loja`): a loja marca "eu entrego", define raio, frete fixo, frete por km, piso de frete grátis e prazo. O carrinho cota pela distância (Haversine entre a coordenada da loja e a do endereço salvo do tutor) e o fechamento recalcula com a mesma função. Fora do raio é recusa, não frete caro. A comissão incide sobre os produtos; o frete vai inteiro para a loja. |
| "Definir margem por categoria em vez de 40% fixo" | `CategoriaMercado.margem_padrao_pct`, editável em `/admin/mercado` → Categorias e margens. O produto usa a própria margem; senão a da prateleira; só então os 40%. A tela do lojista diz de onde veio o número. |
| "Configurar WhatsApp Business com catálogo" e "Configurar Google Merchant Center" | **Feed de produtos** no formato do Google (RSS 2.0 + `g:`), que o Meta Commerce Manager também lê: `/api/v1/public/mercado/feed.xml?loja=<slug>` (e `.csv`). Tela `/mercado/loja/feed` com os links, o passo a passo dos dois painéis e a contagem de itens sem foto, que os dois recusam. |
| Fotos (pré-requisito do feed) | **Upload no catálogo do lojista**: até 6 por produto, WebP de 1200 px no R2, primeira vira capa. |
| "Criar Google Business Profile" (precisa de site) | **Vitrine pública sem login**: `/mercado`, `/mercado/<loja>`, `/mercado/<loja>/<produto>`, com HTML inicial renderizado pelo backend (JSON-LD `PetStore`/`Product`) e sitemap. "Comprar" leva ao login com `?next=` e devolve a pessoa ao produto. |

Três coisas para não redescobrir:

- **A loja precisa de coordenada para entregar.** Ao salvar o cadastro, o
  backend geocodifica o endereço (Nominatim, em silêncio). Se a loja marcou
  "eu entrego" e o ponto não veio, o salvamento recusa com a mensagem certa
  frete sem distância seria chute.
- **O slug `loja` é reservado.** `/mercado/loja` é o painel do lojista; a
  vitrine pública é `/mercado/<slug>`. O nginx separa os dois com
  `(?!loja(?:/|$))`, o roteador do navegador prefere o caminho estático, e
  `slugDisponivel` nunca gera `loja`.
- **Item sem foto não entra no feed**, e é contado, não escondido.

---

## Terceira fatia: 29/08/2026 — assinatura de ração com entrega programada

O item 1 dos "Próximos passos" do plano comercial (meta: 30 assinantes B2C em
90 dias), na forma honesta que o próprio plano admitia: **lembrete com o pedido
pronto, não cobrança automática**. O checkout não guarda cartão sem CVV e o
preapproval do Mercado Pago não está contratado; quando um dos dois existir, o
worker passa a cobrar depois de fechar o pedido e o resto continua igual.

| Papel | Onde | O que faz |
| --- | --- | --- |
| **Tutor** | Página do produto → **Assinar**; `/tutor/mercado/assinaturas` | Escolhe pet (dá a frequência sugerida), quantidade, a cada quantos dias e como recebe (retirada, combinar, entrega pela loja). O primeiro pedido nasce na hora com o desconto de assinante e vai para o pagamento. Depois: pedir agora, mudar frequência, pausar, retomar, cancelar. |
| **Lojista** | Cadastro da loja → "Vendo ração por assinatura"; painel → "Assinaturas de ração" | Liga a assinatura, define o desconto (0–50%) e, se entrega, frete grátis para assinante. Vê quem assinou, o quê, quando vem o próximo pedido. |
| **Plataforma** | `assinatura.worker` (1×/h) | Gera o pedido de cada assinatura cuja data chegou e avisa o tutor (push + e-mail) com o caminho do Pix. |

Como funciona por dentro (`backend/src/services/mercado/assinatura.service.ts`):

- **A frequência sugerida** sai do consumo diário por porte (pequeno 150 g,
  médio 300 g, grande 450 g; gato 60 g) e do peso do saco × quantidade, presa
  entre 7 e 90 dias. Sem porte ou sem peso, 30 dias. O tutor manda.
- **O ciclo usa o MESMO `fecharPedido` da compra avulsa**: monta o carrinho da
  assinatura e fecha. Estoque, comissão, código, eventos — tudo igual. O que
  muda é o parâmetro `assinatura`: desconto sobre os produtos (a comissão da
  plataforma incide no valor já com desconto), frete zerado na entrega da loja
  quando ela prometeu, e **24 h para pagar** em vez de 60 min — ninguém está
  na tela esperando o Pix.
- **Desconto e frete grátis são congelados na assinatura.** A loja muda a
  política quando quiser; quem já assinou tem o que leu.
- **Ciclo que falha adia um dia**, guarda o motivo e não derruba o worker; a
  tela mostra "último ciclo adiado: …". Estoque volta em dias, não em meses.
- **Três pedidos vencidos seguidos pausam** a assinatura e avisam o tutor,
  que retoma quando quiser. Continuar gerando pedido para quem não paga só
  prende a prateleira da loja. Pagamento zera a contagem.
- **Fora, de propósito:** transportadora (cotação por ciclo exigiria CPF e
  CepCerto a cada geração), produto com receita (a receita é conferida a cada
  compra) e mais de uma loja por assinatura.

Banco: `mercado_assinaturas`, `mercado_assinatura_itens`, `mercado_pedidos.assinatura_id`
e três colunas de política em `mercado_lojas` (migration `20260829120000_mercado_assinatura`).
17 testes em `tests/unit/services/mercado-assinatura.test.ts`.

## Decisões de arquitetura

### Módulo dentro do app, não aplicação separada

O mercado reaproveita autenticação, multi-tenant, Mercado Pago com split,
webhook, push, e-mail, auditoria e socket, tudo já em produção e testado. Uma
aplicação separada duplicaria os seis primeiros e criaria um segundo lugar para
o mesmo bug de pagamento aparecer.

O preço disso é que o `schema.prisma` cresceu oito modelos. O preço da
alternativa seria dois bancos, dois deploys e dois checkouts.

### Um carrinho por loja

Cada loja separa, embala e entrega o que é dela. Um carrinho único com itens de
três vendedores viraria três pedidos, três prazos e três repasses escondidos
atrás de um botão só de "finalizar". O tutor pode ter carrinho aberto em várias
lojas ao mesmo tempo e paga um de cada vez, o que ele vê na tela é o que
acontece no balcão.

### O carrinho guarda quantidade, não preço

Congelar o preço faria o tutor pagar um valor que a loja já mudou. Ler sempre o
preço vigente e **avisar** o que mudou é o meio-termo honesto: a leitura do
carrinho devolve `impedimentos` (impede o fechamento e diz por quê) e `alertas`
(não impede, mas a pessoa precisa saber). Descobrir isso na tela de pagamento
seria o pior desenho possível.

### O estoque baixa no fechamento, não no pagamento

Entre gerar o Pix e o dinheiro cair passam minutos. Se o estoque só baixasse na
confirmação, dois tutores pagariam pelo mesmo último saco de ração e um dos dois
receberia um pedido impossível de separar.

A baixa é um `updateMany` condicional (`estoque >= n`) dentro da transação do
pedido: quem chega depois do último item atualiza zero linhas e recebe "acabou"
**antes** de existir cobrança. A contrapartida é `expira_em` - pedido não pago em
60 minutos devolve tudo para a prateleira, varrido pelo worker
`mercado-pedido.worker`.

### `controla_estoque`: a decisão que veio do campo

O primeiro levantamento (ver abaixo) voltou com **175 itens fotografados na
prateleira e nenhuma contagem de estoque**. Uma leitura ingênua de `estoque > 0`
teria marcado a loja inteira como esgotada, 175 produtos existentes, visíveis na
foto, indisponíveis no aplicativo.

Petshop de bairro em geral não faz contagem: vende enquanto tem e confere na
separação. Com `controla_estoque = false`, o item vende sem reservar nada e a
loja confirma ao separar; com `true`, cada pedido baixa a quantidade e o último
item só é vendido uma vez. **A loja escolhe, produto a produto.**

`sob_encomenda` é o terceiro caso e é diferente dos dois: o item não está na
loja, mas ela busca, e o **prazo é obrigatório**, porque "sob encomenda" sem
prazo é o tutor pagando hoje para descobrir a espera depois.

### A espécie não é categoria

A planilha de campo trazia "Ração cão" e "Ração gato" como prateleiras
separadas. Na plataforma é **uma** prateleira (`Ração`) mais `especie_alvo` no
produto, senão quem tem cão e gato procuraria a mesma ração duas vezes. Na
busca, `ambos` e produto sem espécie entram nos dois filtros.

### Custo e margem não saem do servidor

`custo`, `margem_pct`, `fornecedor` e `nota_interna` existem no produto e **não
estão em `CAMPOS_PUBLICOS`** (`catalogo.service.ts`). Não é a tela que deixa de
mostrar: é o dado que não sai daqui. Vazados, entregariam a margem da loja a
qualquer pessoa com o aplicativo aberto.

### A loja passa por conferência

Parte do catálogo é medicamento de uso animal. A loja nasce `rascunho`, precisa
de CNPJ válido (dois dígitos verificadores) e de pelo menos um produto para ir a
`pendente`, e só a equipe a leva a `aprovada` - a mesma régua do credenciamento
de veterinário. Recusa e suspensão exigem motivo por escrito, e as três decisões
gravam evento pericial com estado anterior e posterior.

Produto marcado `exige_receita` faz o pedido inteiro nascer marcado: a loja vê na
fila e confere a prescrição antes de separar.

### Repasse por Pix, não split no gateway

Mesma razão registrada em 19/08 para o veterinário: split real exigiria
onboarding de marketplace no Mercado Pago. A divisão é calculada e gravada em
`PaymentSplit` com `recipient_type = 'MERCHANT'`, o dinheiro entra na conta da
plataforma e o repasse sai por Pix. `LojaMercado.gateway_recebedor_id` já existe
para o dia em que o onboarding acontecer.

A comissão vem de `LojaMercado.comissao_pct` quando negociada, e de
`ConfiguracaoTenant.comissao_plataforma_pct` (padrão 15%) quando não.

---

## Levantamento de campo: fornecedor 01

**Casa de Rações Filhos de 4 Patas**, Ribeirão Preto/SP · (16) 99428-8613
Levantamento de 26/08/2026, a partir de 50 fotos tiradas na loja.

| | |
| --- | --- |
| Itens identificados | **175** |
| Com preço de etiqueta | **109** (entram ativos) |
| Sem preço | **66** (entram inativos, com a pendência anotada) |
| Com custo de fornecedor | **0** |
| Com código de barras | **0** |
| Com contagem de estoque | **0** |

Distribuição pelas nove prateleiras: ração 71, alimento úmido 28, acessórios 23,
petiscos 16, higiene e banho 16, brinquedos 10, casa e conforto 10,
medicamentos 1. Por espécie: cão 68, ambos 59, gato 44, pássaro 3, outros 1.

**O preço da coluna K não é custo**, é a etiqueta do balcão. Nenhum custo de
fornecedor foi informado, então `custo` e `margem_pct` ficam vazios até a tabela
chegar. Inventar margem sobre um número que ninguém passou seria fabricar
contabilidade.

### Arquivos

```
marketplace/
├── dados/
│   ├── levantamento-fornecedor-01.xlsx          # a planilha original, como veio
│   └── fornecedor-01-filhos-de-4-patas.json     # normalizada, versionada, revisável em diff
└── scripts/
    └── planilha-para-json.py                     # a conversão, reproduzível
```

### Como importar

```bash
# 1. Converter a planilha (só quando ela mudar)
python marketplace/scripts/planilha-para-json.py \
  marketplace/dados/levantamento-fornecedor-01.xlsx \
  marketplace/dados/fornecedor-01-filhos-de-4-patas.json

# 2. Ensaiar a importação — mostra o que faria, não grava nada
cd backend
npx tsx scripts/importar-catalogo-mercado.ts \
  --arquivo=../marketplace/dados/fornecedor-01-filhos-de-4-patas.json \
  --responsavel=email@da.pessoa

# 3. Aplicar
npx tsx scripts/importar-catalogo-mercado.ts \
  --arquivo=../marketplace/dados/fornecedor-01-filhos-de-4-patas.json \
  --fotos=../marketplace/fotos/fornecedor-01 \
  --responsavel=email@da.pessoa --aplicar
```

O script **não cria conta** (o responsável precisa ter entrado no aplicativo),
**não aprova a loja** (ela entra em `rascunho` e passa pela conferência normal) e
**não inventa preço nem estoque**.

Por que existe um passo intermediário em vez de o Node ler o `.xlsx`: ler
planilha em Node exigiria uma dependência nova no backend só para rodar uma vez
por fornecedor. O JSON fica versionado, é revisável em diff e reproduz o seed sem
que ninguém precise da planilha.

### O que falta antes de a loja ir ao ar

1. **Endereço da rua**, o levantamento tem telefone e cidade, não o endereço. O
   script grava `ENDEREÇO A CONFIRMAR` de propósito: sem ele a loja não passa na
   conferência, que é o certo.
2. **66 preços**, os produtos estão cadastrados e inativos, esperando o número.
3. **Tabela de custo do fornecedor**, sem ela não há margem real, só preço de
   balcão repassado.
4. **Fotos**, 132 dos 175 produtos já têm imagem tratada em
   `marketplace/fotos/fornecedor-01/` (ver abaixo); 43 não aparecem em nenhuma
   foto do Drive e nenhuma imagem foi subida para o R2 ainda.

### Fotos dos produtos (29/08/2026)

As 55 fotos do levantamento estão no Google Drive (pasta `IMG_4244`–`IMG_4298`,
HEIC do iPhone). O tratamento foi feito com
`ferramentas/removedor-de-fundo` (motor `ia`, U-2-Net, roda local) e o resultado
está em `marketplace/fotos/fornecedor-01/`:

| | |
| --- | --- |
| Produtos com foto | **132** (`fotos.json` é o manifesto) |
| Aprovadas (fundo removido, quadro branco 1200 px) | **92** |
| Para revisar (recorte bruto em quadro branco, a IA não isolou o produto) | **40**, marcadas `"status": "revisar"` |
| Sem foto no Drive | **43** (as referências "Foto 1–9" da planilha não estão na pasta; coleiras, guias, casinhas, comedouros e as rações de 15 kg em saco) |

Nome do arquivo = `<referencia>-<slug>.webp`. Cada WebP carrega EXIF + XMP
(título, descrição, palavras-chave, autoria), mas isso é **documentação
auxiliar**: depois de `R2 → CDN → navegador` o Google não conta com esse
metadado. O SEO da imagem vem do app: `alt`/`title` no `<img>`, JSON-LD
`Product` com `image`, slug, marca, categoria. Por isso os textos também estão
no JSON do fornecedor (`foto_alt`, `foto_titulo`) para virar `alt` na vitrine.

Campos por produto no JSON:

| Campo | Valores |
| --- | --- |
| `foto_status` | `aprovada` (sobe para o R2) · `revisar` (fila de QA, não publica) · `sem_foto` · `rejeitada` (reservado) |
| `foto_arquivo` | nome do WebP em `fotos/fornecedor-01/`, ou `null` |
| `tem_etiqueta_preco` | `true` em 121 fotos: a etiqueta do balcão aparece. Publicável, mas é a fila de troca por foto de catálogo quando o EAN chegar |

No banco, a capa do produto carrega o mesmo contrato (`ProdutoMercado`):

| Coluna | Vem de | Quem vê |
| --- | --- | --- |
| `imagem_alt` | `foto_alt`; editável pelo lojista ("Descrição da foto", 160 caracteres) | vitrine, HTML do servidor e telas do tutor usam `imagem_alt \|\| nome` no `<img>` |
| `imagem_status` | `aprovada` (importação e upload do lojista), `revisar`, `rejeitada`; nulo sem capa | só o lojista (`CAMPOS_DO_LOJISTA`); badge "foto a revisar" |
| `imagem_tem_etiqueta` | `tem_etiqueta_preco`; checkbox no formulário do lojista | badge "etiqueta na foto" — a fila de troca |

Migrações `20260829120000_mercado_imagem_alt` e
`20260829130000_mercado_imagem_status` (aditivas; capa já existente nasce
`aprovada`). A regra está em `normalizarImagem` (`comum.ts`, testada em
`mercado-imagem.test.ts`): sem capa não há status nem etiqueta; capa escolhida
pelo lojista nasce aprovada; status desconhecido cai em aprovada.

O importador respeita isso: `--fotos=../marketplace/fotos/fornecedor-01` sobe
**só as aprovadas** (também para produto já importado sem `imagem_url`), pelo
mesmo caminho da tela do lojista (`otimizarFoto` + chave
`mercado/<tenant>/<loja>/<produto>/`). Aprovada apontando para arquivo ausente
interrompe a importação em vez de subir metade.

Três coisas a saber:

- **Etiqueta de preço aparece na foto.** As fotos são da prateleira; a IA
  recorta o fundo, não a etiqueta. Se o preço mudar, a foto continua mostrando
  o antigo, então vale trocar por foto de catálogo do fabricante quando o EAN
  chegar.
- **Sacos empilhados viraram tiras.** Rações de 10,1 kg fotografadas de lado
  (`IMG_4267`–`IMG_4270`, `IMG_4279`) só mostram a lombada; entraram como
  `revisar` para não deixar o produto sem nada, mas precisam de foto de frente.
- **A numeração `foto_referencia` da planilha não bate com os arquivos** em
  dois casos (`IMG_4269`/`IMG_4270` trocadas, `IMG_4264`–`IMG_4266` deslocadas
  em um). O `fotos.json` registra a foto **real** e o recorte usado.

Para refazer: `marketplace/scripts/fotos/` tem a conversão HEIC→JPG
(`converter.py`, precisa de `pillow-heif`), o mapa de recortes
(`mapa-recortes.json`, frações da foto), o recorte (`recortar.py`) e a gravação
das metatags (`metatags.py`). Baixar a pasta do Drive:
`rclone copy despolariza: <destino> --drive-root-folder-id 1SmeI6OdeiR7qV_tCoa9CAwCB18kaKReD`.

---

## Mapa do código

### Backend

```
backend/src/services/mercado/
├── comum.ts                        # slug, CNPJ, DISPONIVEL, preço vigente/sugerido, unidades, espécies
├── loja.service.ts                 # cadastro, envio para análise, decisão da equipe, comissão
├── catalogo.service.ts             # categorias, produtos (lojista e vitrine), duas leituras
├── carrinho.service.ts             # um por loja; impedimentos e alertas
├── pedido.service.ts               # fechamento, estoque, transições, cancelamento, expiração
├── notificacao-mercado.service.ts  # push + e-mail para loja e tutor
└── mercado-pedido.worker.ts        # devolve estoque de pedido vencido (a cada 5 min)

backend/src/controllers/
├── mercado.controller.ts           # tutor
├── mercado-loja.controller.ts      # lojista
└── mercado-admin.controller.ts     # plataforma

backend/src/routes/
├── mercado.routes.ts               # /api/v1/mercado
├── mercado-loja.routes.ts          # /api/v1/mercado/loja
└── mercado-admin.routes.ts         # /api/v1/admin/mercado
```

`/api/v1/mercado/loja` é montado **antes** de `/api/v1/mercado` em `server.js`
invertido, o router do tutor engoliria a rota do lojista.

### Frontend

```
frontend/src/services/mercado.ts    # cliente da API, tipos e formatação
frontend/src/pages/tutor/           # TutorMercado, ...Produto, ...Carrinho, ...Pagamento, ...Pedidos, ...Pedido
frontend/src/pages/mercado/         # LojaCadastro, LojaPainel, LojaCatalogo
frontend/src/pages/admin/           # AdminMercado
```

### Banco

Oito tabelas novas (`mercado_lojas`, `mercado_categorias`, `mercado_produtos`,
`mercado_carrinhos`, `mercado_carrinho_itens`, `mercado_pedidos`,
`mercado_pedido_itens`, `mercado_pedido_eventos`), três enums e **uma** coluna
nova em `payments` (`pedido_mercado_id`, anulável).

Migração: `backend/prisma/migrations/20260826150000_saude_pet_mercado`.
Aditiva por inteiro, nada existente muda de tipo, perde default ou é removido,
então o banco pode ser migrado antes de o código novo subir.

---

## Testes

```
backend/tests/unit/services/
├── mercado-disponibilidade.test.ts   # 23 · o que está à venda, preço, CNPJ, slug
├── mercado-carrinho.test.ts          # 13 · impedimentos, alertas, limites
└── mercado-pedido.test.ts            # 23 · estoque, comissão, transições, expiração
```

59 testes. Os que mais importam são três:

- **o item acabou entre a vitrine e o fechamento** → nenhum pedido é criado, logo
  nenhuma cobrança nasce;
- **loja sem contagem continua vendendo** → o caso dos 175 itens do fornecedor 01;
- **o pedido cujo pagamento entrou entre a busca e a transação não expira** → o
  worker relê dentro da transação antes de devolver qualquer coisa ao estoque.

---

## Próximos passos

O que o plano comercial pede para a Fase 3 ("canal próprio e assinatura") e
ainda não tem código, a especificação, em ordem de dependência:

1. ~~**Assinatura de ração com entrega programada**~~ — **feita em 29/08** (ver
   "Terceira fatia" acima), como lembrete com Pix pronto. Falta só a cobrança
   automática, que depende de cartão sem CVV ou do preapproval do Mercado Pago.
   Texto original da especificação (meta: 30 assinantes B2C em 90 dias). Modelo `AssinaturaMercado` (tutor, loja, itens, frequência em dias
   calculada pelo porte do pet e pelo peso do saco, próximo ciclo, endereço,
   desconto de 5–10%, frete grátis). Worker diário gera o pedido do ciclo já
   `aguardando_pagamento` e avisa por push; a cobrança automática exige
   cartão salvo **sem CVV**, que hoje o checkout não guarda (decisão de
   segurança de 24/08), ou preapproval do Mercado Pago, como em
   lojas.avilaops.com. Enquanto isso não se decide, o ciclo pode nascer como
   "lembrete com Pix pronto", que é honesto e já mede recorrência.
2. **Conta Parceiro B2B** (meta: 10 contas B2B em 90 dias). Vínculo
   `ContaB2B` (CNPJ validado, responsável, loja fornecedora, tabela de preço
   própria por produto ou desconto por categoria, prazo 14/28 dias só após
   histórico de pagamento). O carrinho lê o preço da tabela B2B quando a conta
   é parceira; o pedido nasce com `faturado_em`/`vence_em` em vez de Pix.
3. **Entregador da plataforma** (`EntregaMercado.entregador`), aceite,
   coleta, rastreio. Outra operação logística; o enum está reservado.
4. **Subconta no gateway**, `gateway_recebedor_id` está pronto; depende do
   onboarding de marketplace no Mercado Pago.
5. **Segundo fornecedor**, o EAN é o que vai evitar o mesmo produto entrar
   duas vezes, e nenhum dos 175 primeiros tem um.
