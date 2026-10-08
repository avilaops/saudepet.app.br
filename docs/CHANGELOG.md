# Changelog - Saúde Pet

Todas as mudanças notáveis neste projeto serão documentadas neste arquivo.

## [Não versionado] - 2026-10-08 - Agenda no relógio do Brasil

### 🔧 Corrigido

- **A grade do veterinário era lida em UTC.** Quem cadastrava atendimento das 09:00 às 17:00
  era oferecido ao tutor das 06:00 às 14:00 (horário de Brasília): o cálculo dos horários
  livres e a conferência "cabe na grade?" usavam o relógio do servidor. Achado ao exercitar a
  agenda em produção com as contas de teste. `backend/src/utils/datas.ts` ganhou o relógio de
  parede do Brasil (`relogioDeParede`, `instanteDoRelogio`, `diaPedido`).
- **"Hoje" e "este mês" começavam às 21h do dia anterior.** O contador de solicitações de hoje
  do painel, o faturamento do mês do Mercado (admin e loja), os relatórios mensais e o extrato
  mensal do veterinário, a janela mensal do benefício de assinatura e os lembretes "atrasados"
  passam a virar à meia-noite de Brasília. O extrato mensal saía às 06:00 em vez das 09:00.
- Os testes de agenda montavam horários no fuso da máquina; agora usam o relógio do Brasil e
  passam com a máquina em qualquer fuso.

## [Não versionado] - 2026-10-08 - Retificação de receita e horários escritos pelo servidor

### 🔧 Corrigido

- **Retificar a receita respondia erro 500 depois de já ter gravado a correção.** A linha de
  auditoria lia o serviço por `require(...).default`, o mesmo erro que impedia o PDF no
  fechamento: o documento novo era emitido, o tutor era avisado, o veterinário via erro e a
  trilha de auditoria não era escrita. Reproduzido em produção com o atendimento de teste. A
  suíte de jornada ganhou o passo da retificação (não havia teste nenhum pela rota), e um teste
  novo reprova qualquer `require(...).default` de módulo que exporta com `module.exports`.
- **Datas e horas escritas pelo servidor saíam em UTC.** O contêiner roda em UTC e 14 pontos
  formatavam sem fuso: a receita emitida depois das 21h saía datada do dia seguinte, e o aviso
  de "senha alterada em…", o prazo de reserva do pedido do Mercado e a suspensão de conta
  mostravam três horas a mais. `backend/src/utils/datas.ts` separa instante (fuso do Brasil) de
  dia de calendário (vacina, retorno, lembrete: o dia que está escrito).

## [Não versionado] - 2026-10-08 - Datas de vacina e lembrete no dia certo

### 🔧 Corrigido

- **Vacina, próxima dose, retorno e lembrete apareciam um dia antes.** São datas sem hora,
  gravadas como meia-noite em UTC; mostradas no fuso do Brasil, a vacina de 08/10 virava 07/10
  na carteira do tutor, na tag pública do pet e na ficha que o veterinário e o admin consultam,
  e o lembrete do dia já nascia "atrasado". `frontend/src/lib/datas.ts` passa a tratar dia de
  calendário como dia de calendário.
- **Atendimento finalizado aparecia para o veterinário como "em andamento"**, com o mapa de
  como chegar e a videochamada. A tela mostra o estado real e leva ao prontuário.

Os dois foram achados no teste de ponta a ponta em produção com contas de teste.

## [Não versionado] - 2026-10-08 - Receita e prontuário saem no fechamento

### 🔧 Corrigido

- **O fechamento do atendimento não gerava a receita nem o prontuário em PDF.** O controller
  lia o gerador por `require('pdf.service').default`, e o módulo exporta a instância direto:
  dava "Cannot read properties of undefined (reading 'gerarReceitaPdf')", o erro era engolido
  como aviso e o tutor ficava sem os documentos até a rotina de reemissão passar (a cada 30
  minutos). Achado no primeiro teste de ponta a ponta feito em produção com contas de teste.
  A suíte de jornada completa passou a exigir os dois PDFs no fechamento.

## [Não versionado] - 2026-10-08 - Logo do veterinário na receita e no prontuário

### ✨ Novo

- **O veterinário pode imprimir o logo do consultório nos documentos.** Em `/veterinario/perfil`,
  a seção "Logo nos documentos" envia, troca e remove a imagem (PNG, JPG ou WebP até 5 MB); ela é
  convertida para PNG no tamanho do cabeçalho e aparece na receita e no prontuário emitidos dali
  em diante, inclusive em retificação e reemissão. A marca Saúde PET e o rodapé de assinatura
  continuam nos documentos.
- É um recurso de plano novo (`documentos_logo`). Hoje a trava de plano está em modo livre e ele
  fica aberto a todos, como os demais; quando a trava voltar, quem perder o recurso mantém o logo
  guardado e ele só deixa de ser impresso.
- Nada no caminho do logo impede a emissão: arquivo fora do ar, corrompido ou de outro
  veterinário faz o documento sair sem logo.
- Migração aditiva: coluna opcional `veterinarios.logo_documentos_url`.

## [Não versionado] - 2026-10-08 - TypeScript em tudo

### ♻️ Mudado

- **Os 121 arquivos JavaScript que restavam viraram TypeScript.** O `frontend/src` já era todo
  `.tsx`/`.ts`; faltavam 78 testes do backend, 16 scripts e 2 seeds do backend, o
  `seed-production`, 9 scripts da raiz e do frontend (entre eles os verificadores que rodam no
  build), 6 testes e a configuração do Playwright, e as configurações do Vite e do Tailwind. O
  `postcss.config.cjs` saiu: o PostCSS passou para dentro do `vite.config.ts` (o CSS gerado é
  byte a byte o mesmo). Scripts rodam com `tsx`.
- Ficaram de fora, com motivo no `AGENTS.md`: `backend/jest.config.js`, `frontend/index.html`
  e os scripts `.ps1`, `.sh` e `.py`.
- A renomeação não tipou testes e scripts (o Jest roda sem checagem de tipo e o `tsc` do
  backend só confere `src`): mesmas 111 suítes e 953 testes unitários passando, e as 16 suítes
  que dependem de banco com o mesmo resultado de antes.

## [Não versionado] - 2026-10-08 - Home: últimos artigos do blog

### ✨ Novo

- **A página inicial mostra os três artigos mais recentes do blog**, com link para a listagem.
  O resumo que o backend escrevia à mão listava artigos só para o Google; ao passar a desenhar a
  home pelo `.tsx` essa lista tinha saído. Agora ela existe para o visitante também, chega pronta
  no HTML inicial e some sozinha se o blog estiver vazio.

## [Não versionado] - 2026-10-08 - Ficha clínica do pet no painel do admin

### ✨ Novo

- **`/admin/atendimentos` ganha o botão "Ficha do pet".** A API sempre deixou o admin corrigir,
  remover e restaurar alergia, vacina e medicamento em uso (ele responde pela ficha quando o
  veterinário que registrou saiu da plataforma), mas a única tela que fazia isso era a do
  veterinário, dentro de um atendimento dele. A tela nova, `/admin/atendimentos/:id/ficha-do-pet`,
  usa o mesmo componente e as mesmas regras: motivo obrigatório e registros removidos consultáveis.

### 🔧 Corrigido

- **O `super_admin` podia corrigir a ficha clínica e não podia lê-la.** A leitura do histórico
  do pet deixava passar só o `admin` do tenant.

## [Não versionado] - 2026-10-08 - Agenda do veterinário: remarcar

### ✨ Novo

- **`/veterinario/crm/agenda` ganha o botão "Remarcar".** A rota
  `PUT /veterinario/crm/agendamentos/:id/remarcar` existia desde a construção da agenda e
  nenhum botão a chamava: para mudar o horário o veterinário cancelava e marcava de novo, e o
  tutor recebia um cancelamento seguido de uma consulta nova. Agora escolhe o dia, vê os
  horários livres da própria grade (ou digita, quando não há grade) e o tutor recebe um aviso
  só, de horário alterado. A duração é mantida. Era a última "rota sem tela" do `TELAS.md`.

### 🔒 Segurança

- **Confirmar, cancelar, dar falta e remarcar exigem que a consulta seja do veterinário
  logado.** As duas rotas conferiam só o tenant: conhecendo o id, um veterinário alterava a
  agenda de um colega da mesma operação.

## [Não versionado] - 2026-10-08 - Páginas públicas em um `.tsx` só

### 🔧 Corrigido

- **As 142 páginas públicas pediam três arquivos JavaScript que davam 404.** O backend montava
  o HTML inicial com uma cópia do `index.html` guardada na própria imagem; o `web` foi
  publicado sozinho e a cópia ficou apontando para arquivos que não existiam mais. O backend
  passa a ler o `index.html` do contêiner `web`, com a cópia como reserva.

- **Página pública respondia 429 depois de 150 acessos do mesmo IP em 15 minutos.** As páginas
  em HTML passam pelo backend e gastavam o limite geral da API; com 142 páginas no sitemap, um
  buscador lendo o site inteiro recebia JSON de erro no lugar da página. Páginas, sitemap, RSS
  e `llms.txt` têm agora um limite próprio (1500 por 15 minutos) e não gastam o da API.

### ♻️ Mudado

- **Toda página pública é desenhada pelo próprio `.tsx`, também no servidor.** Saíram o HTML
  resumido que o backend escrevia à mão (`renderBlogHtml`, `renderStaticPageHtml`,
  `mercado-render.service`) e a pasta `landing-page/`. O Google e a prévia de link recebem a
  página de verdade, com o título e os dados estruturados que ela declara no `<Seo>`; no
  navegador o React assume o HTML sem redesenhar e sem buscar de novo os dados.
- **`/blog?page=2` e `/mercado/:loja?pagina=2` têm endereço próprio**, e a paginação virou link:
  artigos e produtos fora da primeira página passam a ter caminho de entrada.
- **O código da página é carregado antes de o React assumir o HTML do servidor.** Na primeira
  versão (publicada de manhã) o carregamento sob demanda suspendia no meio da hidratação; em
  rede lenta a sessão atualizava antes, o React registrava o erro 421 e redesenhava a página
  do zero, com o indicador de carregamento no meio.
- **A sessão nasce resolvida.** O `AuthProvider` começava com `loading: true` e só num efeito lia
  o `localStorage`; essa mudança logo depois de montar ainda atropelava a hidratação em cerca de
  1 a cada 60 aberturas (erro 421, medido em produção). Agora a sessão é lida ao montar e o
  estado do socket muda em transição.
- O build reprova se alguma página pública não sair desenhada no servidor
  (`frontend/scripts/verificar-ssr.mjs`). Detalhes no `AGENTS.md`.

## [Não versionado] - 2026-10-07 - Banners: botão "Desfazer"

### ✨ Novo

- **`/admin/banners` ganha o botão "Desfazer".** A rota `POST /admin/landing-banners/:id/restore`
  existia desde a construção da tela e nenhum botão a chamava: voltar um banner à versão
  anterior só era possível pela API. O botão aparece apenas quando a auditoria guarda uma
  versão anterior (é nela que o backend busca o estado), pede confirmação e mostra o resultado.
  Falha ao mudar status, que antes só ia ao console, passa a aparecer para o admin.
## [Não versionado] - 2026-10-07 - Página de login

### 🔧 Corrigido

- **Quem já estava logado via o formulário de login de novo.** Abrir `/login` pelo atalho do
  app, por um link antigo ou pelo "voltar" do navegador mostrava o formulário com a sessão
  aberta, e a pessoa digitava a senha à toa. A tela passa a levar direto para a área da conta
  (`/tutor`, `/veterinario`, `/admin`, `/dev`, ou o `?next=` quando houver), e todo
  redirecionamento pós-login usa `replace`: o "voltar" não devolve mais o formulário.
- **Campos de login sem nome e sem autofill.** Os rótulos não estavam ligados aos campos
  (`htmlFor`/`id`) e faltava `autoComplete`: leitor de tela lia um campo sem nome e o
  gerenciador de senhas do celular não reconhecia o formulário. Agora `email` e
  `current-password`, com teclado de e-mail e sem autocorreção.
- **Senha sem "mostrar/ocultar".** Botão com `aria-label` e `aria-pressed` ao lado do campo.
- **Erro com `role="alert"`**, e o temporizador que o apaga é cancelado ao sair da tela.
- **Tipos**: `handleSubmit` e o redirecionamento deixam de usar `any`.

Pendência fora do código, confirmada no GitHub Actions: os quatro deploys desde a abertura
deste repositório falharam em `failed to push ghcr.io/avilaops/saudepet.app.br-*: denied:
permission_denied: read_package`. Os pacotes no GHCR existem de antes (repositório privado
anterior) e este repositório não tem permissão de escrita neles, então a correção do login
de 06/10 (`API_URL` em `/api`) ainda não chegou à produção por este caminho.

## [Não versionado] - 2026-10-07 - Cadastro honesto sobre o e-mail de confirmação

### 🔧 Corrigido

- **O cadastro afirmava que o e-mail de confirmação tinha sido enviado mesmo quando o SMTP
  recusava.** O controller engolia a falha e respondia "verifique seu email"; a tela do
  veterinário mandava procurar na caixa de entrada um e-mail que nunca saiu. A conta continua
  sendo criada (o link pode ser pedido de novo), mas `POST /auth/register` passa a devolver
  `email_verificacao_enviado` e uma mensagem condizente, e `/register` mostra "Conta criada,
  mas o e-mail não saiu" com o botão de pedir novo link em destaque. Três casos em
  `tests/unit/controllers/cadastro-email-honesto.test.ts`.
- **`docs/TELAS.md`** estava atrás do código em `/verify-email` (o formulário de pedir novo link
  já existia) e em `/register`; as duas linhas foram atualizadas.

## [Não versionado] - 2026-09-11 - Auditoria, loja de demonstração fora do ar, nginx sem 502

Auditoria completa de Roadmap, Todoist e produção em `docs/AUDITORIA_2026-09-11.md`, seguida
das três pendências técnicas confirmadas por evidência.

### 🔧 Corrigido

- **A loja de demonstração do Mercado estava pública de novo.** A BioVet, criada por seed, foi
  aprovada no painel em 01/09 e voltou à vitrine, ao sitemap e ao feed do Google. Nada no
  schema distinguia demonstração de loja real. Agora `LojaMercado.demonstracao` é o portão:
  `LOJA_PUBLICA` (services/mercado/comum.ts) é a única definição de "loja pública" e toda
  leitura que sai para fora a usa (vitrine logada, vitrine sem sessão, catálogo, carrinho,
  assinatura, feed, sitemap); a aprovação recusa loja marcada, com mensagem; o painel mostra a
  marca e esconde o botão. A migration marca a loja do seed e a devolve ao rascunho. O seed
  passou a viver no repositório (`backend/scripts/seed-demo-mercado.js`) criando em rascunho.
  Nove casos de regressão em `tests/e2e/mercado/loja-demonstracao`, inclusive o acidente
  (gravada como aprovada direto no banco, continua invisível).
- **O site respondia 502 depois de recriar o backend.** O nginx resolvia o nome do container
  uma vez, no boot, e ficava com o IP morto até alguém reiniciar o `web` à mão em todo deploy.
  `resolver 127.0.0.11` com o upstream em variável faz o nginx reconsultar o DNS do Docker; as
  18 regras de `proxy_pass` mantêm a URI exatamente como antes.
- **Suítes e2e do Mercado caíam por tempo em máquina carregada.** O `beforeAll` (três cadastros
  com bcrypt real) passava de 15 s; agora tem 120 s.

### ✨ Novo

- `backend/src/scripts/geocodificar-lojas.ts`: preenche a coordenada das lojas anteriores à
  regra de geocodificação, a partir do endereço real, só quando a cidade devolvida bate com a
  cadastrada. Ensaio por padrão, `--aplicar` grava, nunca sobrescreve ponto existente.
- `docs/MERCADO_ENTREGA_E_CORREIOS.md`: mapa dos quatro tipos de entrega e do que falta para
  ligar transportadora e Correios pela CepCerto.
- `docs/FASE5_ROTEIRO_PONTA_A_PONTA.md`: o que a automação prova e o roteiro de 12 passos para
  o teste no celular real.

## [Não versionado] - 2026-08-31 - Controllers em TypeScript (Fase 1.2, item 5)

Os 41 controllers migrados para TypeScript. A camada fecha com `tsc --noEmit` limpo e as três
suítes verdes: 967 testes unitários, 6 de integração e 107 e2e.

### 🔧 Corrigido

- **Finalizar atendimento respondia 500.** `mensagemDe`, em `solicitacao.controller`, devolvia
  `mensagemDe(erro)` em vez de `erro.message`: recursão infinita e estouro de pilha. Como o
  prontuário e a mudança de status vinham depois, o atendimento ficava preso em
  `atendimento_em_andamento` e o tutor não conseguia avaliar.
- **O e-mail com receita e prontuário nunca era enviado.** O fechamento lia `.default` de um
  `require` do `email.service`, que exporta por `module.exports`: o valor era `undefined`.
- **O dossiê de auditoria respondia erro.** Pedia `include: { anexos: true }` em `Solicitacao`,
  relação que só existe em `Mensagem`, e o Prisma recusa include desconhecido.
- **A seção de chat do dossiê saía vazia.** Lia `texto`, `emissor_id`, `imagem_url` e
  `emissor_tipo`, nenhum existe em `Mensagem`: são `conteudo` e `remetente_id`, e a mídia mora
  em `mensagens_anexos`. Toda mensagem aparecia como "[Anexo de Mídia]", sem autor. Agora traz
  o anexo de verdade (nome, tipo e se o arquivo já saiu por retenção) e deduz o papel de quem
  falou.
- **O mock de e-mail dos testes tinha 10 dos 25 métodos do serviço**, e ainda era recopiado em
  quatro arquivos. Quem chamava um dos 15 que faltavam caía no `catch` de best-effort: a suíte
  passava verde sem exercitar o envio. Virou um mock só, em `tests/mocks/email-service.mock.js`.

### 🔨 Alterado

- `addTenantFilter` devolvia `tenant_id` como `unknown`; agora é `string` opcional, e sem tenant
  o filtro não entra em vez de virar `null`.
- `documento_analise` (`Json?`) passa a ser copiada com `Prisma.DbNull`, senão o Prisma grava o
  literal JSON `null` no lugar de NULL.
- `agendamento.service` exporta por `export` nomeado, e os dois controllers que o consumiam
  pararam de redeclarar as assinaturas dele à mão.
- `bcryptjs` ganhou declaração de tipos própria (`src/types/bcryptjs.d.ts`), no lugar do recorte
  de assinaturas que dois controllers mantinham copiado.

## [Não versionado] - 2026-08-31 - Central de notificações real, e o sino

### 🔧 Corrigido

- **A central de notificações era inteiramente inventada.** Quatro exemplos
  escritos à mão no frontend, iguais para todo mundo, com "Há 15 minutos"
  congelado no código. Não havia tabela, endpoint nem nada por trás dela.
  Agora existe `notificacoes` e a linha nasce no MESMO funil que envia o push
  (`push.service.enviarParaUsuario`): o histórico é o que realmente foi
  avisado, e os 15 chamadores continuam iguais. O aviso é guardado mesmo
  quando não há push para entregar — sem VAPID, sem aparelho inscrito ou com
  a permissão bloqueada —, que é quando a pessoa mais precisa achá-lo depois.

### ✨ Adicionado

- `GET /api/v1/minhas-notificacoes` (categoria, cursor, teto de 50),
  `/nao-lidas`, `PATCH /:id/lida`, `POST /lidas`. Caminho próprio porque
  `/api/v1/notificacoes` já é a configuração do tenant, só de super admin.
- 14 testes e2e contra o Postgres, sem mock do `push.service`.

### 🔨 Alterado

- **O recado do aplicativo saiu do meio da tela e foi para o sino.** A faixa
  "Notificações bloqueadas" era desenhada na home do veterinário e do tutor e
  empurrava o conteúdo para baixo em toda visita. O sino já estava no canto e
  só navegava; agora abre a lista, com contador real. `PushOptIn` virou o hook
  `usePushAutomatico`, porque sem a faixa ele não desenhava mais nada.

## [Não versionado] - 2026-08-27 - Saúde Pet Mercado (segunda fatia)

O que o plano comercial de 27/08 pedia do produto para as Fases 0 a 2, raio e frete, margem por
categoria, catálogo no WhatsApp e no Google, e um site que o Google Business Profile possa apontar.

### ✨ Adicionado

- **Entrega pela própria loja** (`EntregaMercado.loja`): raio, frete fixo, frete por km, piso de frete
  grátis e prazo definidos pela loja; cotação no carrinho pela distância real (coordenada da loja ×
  endereço salvo do tutor) e recálculo no fechamento pela mesma função. Fora do raio é recusa. A
  comissão incide sobre os produtos; o frete vai inteiro para a loja. Distância gravada no pedido.
- **Margem padrão por categoria** (`margem_padrao_pct`), editável em `/admin/mercado`. Produto sem
  margem própria herda a da prateleira; o 40% virou último recurso.
- **Fotos por upload** no catálogo do lojista (até 6, WebP no R2, primeira vira capa).
- **Feed de produtos** Google/Meta (`/api/v1/public/mercado/feed.xml|csv`) e a tela
  `/mercado/loja/feed` com links, passo a passo e a contagem de itens sem foto.
- **Vitrine pública** `/mercado`, `/mercado/<loja>`, `/mercado/<loja>/<produto>` com HTML inicial
  renderizado pelo backend (JSON-LD `PetStore`/`Product`), sitemap e `?next=` no login.
- 42 testes novos (cotação de frete, fechamento com entrega, feed, margem).

### 🔧 Corrigido

- O commit `1a0e468` subiu as telas sem as rotas do roteador; `5750ea6` fecha.

## [Não versionado] - 2026-08-26 - Saúde Pet Mercado (primeira fatia)

O terceiro módulo do briefing saiu de "fora de escopo". Da vitrine ao pagamento, com tela para os
três papéis: quem compra, quem vende e quem responde pela plataforma. A entrega por **entregador**
não está nesta fatia, o pedido sai por retirada no balcão ou entrega combinada com a loja.

### ✨ Adicionado

- **Banco**: oito tabelas (`mercado_lojas`, `mercado_categorias`, `mercado_produtos`,
  `mercado_carrinhos`, `mercado_carrinho_itens`, `mercado_pedidos`, `mercado_pedido_itens`,
  `mercado_pedido_eventos`), três enums e uma coluna anulável em `payments`
  (`pedido_mercado_id`). Migração aditiva por inteiro, pode subir antes do código.
- **Tutor** (`/tutor/mercado`): vitrine com filtro por espécie e categoria, busca, ficha do produto,
  carrinho **por loja**, fechamento com escolha de retirada ou entrega combinada, pagamento por Pix
  e cartão (tokenização no navegador, como no checkout do atendimento), acompanhamento com linha do
  tempo e cancelamento.
- **Lojista** (`/mercado/loja`): cadastro da empresa pela tela, catálogo com custo, margem e preço
  sugerido, envio para análise, fila de separação em tempo real, avanço do pedido passo a passo,
  cancelamento com estorno.
- **Plataforma** (`/admin/mercado`): fila de aprovação com motivo escrito e evento pericial, comissão
  por loja, e o financeiro com faturado, comissão e repasse **separados**, só o faturado dá a
  impressão errada de receita.
- **`marketplace/`**: especificação, o levantamento de campo do primeiro fornecedor (175 itens da
  Casa de Rações Filhos de 4 Patas, Ribeirão Preto/SP), o conversor da planilha e o script de
  importação.
- 59 testes cobrindo estoque, comissão, transições, impedimentos do carrinho e expiração.

### 💡 Decisões que valem registro

- **`controla_estoque` por produto.** O levantamento voltou com 175 itens fotografados na prateleira
  e **zero contagens** de estoque. Exigir `estoque > 0` teria marcado a loja inteira como esgotada.
  Petshop de bairro vende enquanto tem e confere na separação, agora o sistema aceita os dois
  modos, e a loja escolhe produto a produto.
- **O estoque baixa no fechamento, não no pagamento.** Entre gerar o Pix e o dinheiro cair passam
  minutos; sem isso, dois tutores pagariam pelo mesmo último saco de ração. A baixa é `updateMany`
  condicional dentro da transação, e `expira_em` de 60 minutos devolve o que não for pago.
- **Um carrinho por loja.** Cada loja separa e entrega o que é dela.
- **Custo, margem e fornecedor não saem do servidor.** Não estão na seleção de campos públicos do
  catálogo: não é a tela que deixa de mostrar, é o dado que não sai daqui.
- **Espécie não é categoria.** "Ração cão" e "Ração gato" como prateleiras separadas fariam quem tem
  os dois animais procurar a mesma ração duas vezes.

### 🔧 Corrigido de passagem

- **`components/ui/AppKit.jsx`, `components/admin/AdminUI.jsx` e `contexts/SocketContext.jsx`**:
  as propriedades opcionais não eram opcionais para o TypeScript, a desestruturação sem valor
  padrão faz o compilador tratar tudo como obrigatório, e `useSocket()` devolvia `{}`. Qualquer tela
  `.tsx` que usasse `<PageHeader title=… onBack=… />` ou lesse `socket` quebrava a verificação de
  tipos. Resolvido com JSDoc nos componentes e forma declarada no contexto. Tela nova nasce `.tsx`
  (ROADMAP, Fase 1), então isso deixaria de ser detalhe rapidamente.

## [Não versionado] - 2026-08-15 - Redesenho dos três painéis

As três telas de entrada falavam línguas diferentes: gradiente colorido na administração, emoji de
40px na home do tutor, botão cinza no plantão do veterinário. Agora dividem um vocabulário só.

### ✨ Adicionado

- **`src/components/ui/AppKit.jsx`**: kit compartilhado pelas três telas, cabeçalho em tinta
  (`ink` da marca, com brilho discreto do acento), superfície com borda de um fio no lugar de sombra
  pesada, rótulo miúdo em caixa alta, número tabular como protagonista, ícone de traço no lugar do
  emoji, ponto de estado que pulsa só quando é ao vivo. Cor semântica é estado (âmbar = pendente,
  vermelho = atrasado, teal = ao vivo), não decoração.

### 💄 Alterado

- **Plantão do veterinário**: o botão de entrar em plantão era cinza e lia-se como desabilitado
  justo a ação que liga o profissional à fila de chamados. Virou o único elemento sólido da tela.
  As etapas do atendimento viraram uma sequência: a etapa vigente em destaque, as cumpridas com
  visto, as futuras desabilitadas (a máquina de estados as recusaria com 409 de qualquer forma).
  O modal do chamado trocou o cartão piscando por uma barra de 30s que esvazia, com o contador em
  monoespaçada.
- **Home do tutor**: emojis viraram ícones de traço e os três destinos passaram a mostrar o próprio
  dado (quantos pets, quantos lembretes, quantos atrasados). O atendimento em curso aparece como
  faixa ao vivo dentro do cabeçalho.
- **Painel admin**: quatro gradientes coloridos disputavam a leitura de quatro números, saíram.
  A fila de credenciamento virou alerta acionável no topo, a satisfação ganhou barra de leitura e
  os sete cartões com sombra viraram uma lista só, separada por fios.
- **Seletor de perfil (super admin)**: era barra fixa no rodapé e cobria a navegação inferior do
  tutor no celular. Agora é um botão recolhido, acima da barra, que só abre quando alguém pede.
- **Telas internas do tutor** (lembretes, meus pets, histórico): mesmo cabeçalho em tinta, cartões
  com borda de um fio e ícone de traço. No histórico, cada atendimento passou a mostrar o
  diagnóstico e a levar direto aos PDFs de receita e prontuário, que antes não apareciam ali.
- **`components/tutor/TutorBottomNav.jsx`**: a navegação inferior era copiada em cada tela do tutor,
  com SVG à mão e o item ativo decidido na unha, bastava esquecer de trocar a cor numa tela para a
  barra mentir sobre onde a pessoa está. Agora é uma só, e o item ativo vem da rota.
- **`vet.css` alinhado ao mesmo sistema, no nível dos tokens**: `--vet-teal` era `#2fb9b8` e
  `--vet-ink` era `#111827` - cores que só existiam no app do veterinário. Passaram a ser o teal
  (`#159fa3`) e a tinta (`#15343a`) da marca, e com isso as dezoito telas do vet acompanharam sem
  reescrever uma por uma. Junto: cabeçalho em tinta no lugar do gradiente teal (inclusive na versão
  compacta, que era branca, metade das telas do vet abria em tinta e a outra metade em branco),
  cartão com borda de um fio, barra inferior com o item ativo em acento em vez da pastilha
  preenchida, e o `.vet-tab` perdeu o caso especial que pintava a primeira aba de laranja.
- **Avaliar atendimento**: estrelas em emoji viraram alvos de toque de 48px com o ícone do sistema,
  e o erro de envio deixou de morrer num `alert` - fica na tela, com o formulário preenchido.
- **Disponibilidade na home do vet**: offline era cinza dentro do cabeçalho, lido como desabilitado
  no controle que liga o profissional à fila. Virou superfície de vidro sobre a tinta.

### 🐛 Corrigido

- O painel do veterinário importava `requestNotificationPermission`/`showWebPushNotification` e
  nunca os chamava: `pushEnabled` era escrito e jamais lido. Como o chamado dura 30 segundos, sem
  notificação o veterinário com o app em segundo plano só descobria a oferta depois de expirada.
  O cabeçalho ganhou o controle de alertas e a chegada de chamado dispara a notificação.

## [Não versionado] - 2026-08-15 - Histórico clínico acumulado por pet e lembretes

Cada atendimento era legível isoladamente e nada somava por animal: o veterinário prescrevia sem
enxergar o que já tinha sido prescrito, e a alergia observada em uma consulta morria no texto
daquele atendimento. Com o prontuário estruturado gravando desde o fechamento, passou a existir o
que acumular.

### ✨ Adicionado

**API**
- `GET /solicitacoes/:id/historico-do-pet`: histórico clínico do animal daquele atendimento
  atendimentos anteriores (queixa, exame físico, hipótese, diagnóstico, orientações, prescrição
  item a item, exames e PDFs), alergias registradas, lembretes pendentes e o resumo com todos os
  medicamentos já prescritos. Ancorado no atendimento porque é ele que carrega a autorização: os
  participantes e o admin do tenant, os mesmos de `GET /:id/prontuario`.
- Atendimentos encerrados **antes** do prontuário estruturado entram no histórico com os textos
  livres que têm, marcados com `estruturado: false` - omiti-los daria a impressão de um animal sem
  passado clínico.
- Dentro da clínica (tenant) o histórico é compartilhado entre os veterinários: é o que sustenta a
  continuidade do tratamento quando quem atende hoje não é quem atendeu da última vez.

**Alergias do animal (`pets_alergias` deixou de ser tabela morta)**
- `PUT /solicitacoes/:id/finalizar` aceita `alergias[]` (alergia, gravidade leve/moderada/grave,
  observações). Elas vão para a ficha do **pet**, não para o prontuário do dia, quem prescrever
  daqui a seis meses precisa vê-las.
- Registro repetido não duplica: "Dipirona", "dipirona " e "DIPIRONA" são a mesma alergia
  (comparação sem acento, sem caixa e sem espaço sobrando).
- O PDF do prontuário ganhou a seção "ALERGIAS CONHECIDAS", antes da anamnese de propósito, quem
  lê o documento para medicar esbarra nela antes de chegar à conduta.

**Vacinas aplicadas (`pets_vacinas` deixou de ser tabela morta)**
- `PUT /solicitacoes/:id/finalizar` aceita `vacinas[]` (nome, laboratório, lote, data de aplicação,
  próxima dose) e grava na ficha do animal, com o nome de quem aplicou.
- A carteira digital do tutor (`/pets/:id`) e a tag pública do pet (QR da coleira) **já liam**
  `pets_vacinas` - a tela do tutor chegava a prometer "as vacinas aplicadas pelos veterinários da
  plataforma são lançadas automaticamente aqui" sobre uma tabela que ninguém escrevia. Agora a
  promessa é verdade.
- O PDF do prontuário ganhou a seção "VACINAS APLICADAS NESTE ATENDIMENTO", com laboratório, lote e
  próxima dose, é com ele que o tutor comprova a vacinação em viagem, hotel ou creche.

**Medicações em uso (`pets_medicamentos` deixou de ser tabela morta)**
- `medicamentos[]` no fechamento registra o que o animal **passa a usar** (dosagem, frequência em
  horas, uso contínuo, início e fim), lista diferente da receita do atendimento, que continua em
  `PrescricaoItem`.
- Reescrever um medicamento que já estava ativo encerra o registro anterior (`data_fim` = hoje) em
  vez de deixar dois registros ativos dizendo doses diferentes do mesmo remédio.

**Lembretes (`lembretes_pet` deixou de ser tabela morta)**
- O `retorno_sugerido_em` do prontuário passou a criar o `LembretePet` correspondente, na mesma
  transação do fechamento. Antes era uma data gravada que ninguém lia e sobre a qual ninguém era
  avisado.
- A `proxima_dose` de cada vacina cria o lembrete do reforço, do mesmo jeito.

**Telas do veterinário**
- Painel de histórico clínico dentro do prontuário, acima do formulário: alergia em destaque,
  medicações em uso, carteira de vacinação, lembretes pendentes, medicamentos já prescritos e a
  linha do tempo dos atendimentos anteriores, cada um expansível.
- Tela `/veterinario/atendimento/:id/historico-do-pet`, com atalho na tela do atendimento ativo:
  o histórico também precisa estar acessível a caminho e durante a consulta, não só no fechamento.
- Formulário de encerramento com blocos de alergias identificadas, vacinas aplicadas e medicações
  em uso.

**Lembretes chegando ao tutor**
- `GET /lembretes` (pendentes por padrão, `?concluidos=1` para o histórico), `POST /lembretes`
  (o tutor cria os seus: vermífugo, banho, medicação) e `PUT /lembretes/:id/concluir`, que também
  reabre com `{ concluido: false }` - marcar por engano não pode custar um lembrete de vacina.
- Tela `/tutor/lembretes`, agrupada em atrasados e próximos, com atalho e contador de atrasados na
  home do tutor.
- **Worker de aviso** (`lembrete.worker.js`, de hora em hora): avisa o tutor por e-mail 3 dias
  antes da data e marca `notificado`. A coluna existia desde o início sem ninguém para marcá-la, e
  os templates `lembreteRetorno`, `alertaVacina` e `lembreteMedicamento` estavam prontos sem
  nenhum chamador. Falha de envio não marca `notificado`: o ciclo seguinte tenta de novo.

### 🐛 Corrigido

- **Home do tutor contava pets errado.** `GET /pets` responde `{ pets: [...] }` e a tela guardava o
  objeto inteiro, então `pets.length` era `undefined`: a contagem saía em branco e, pior, o tutor
  sem nenhum pet cadastrado ia direto para a tela de solicitação em vez de ser mandado ao cadastro.

### ⚠️ Em aberto

- Alergia, vacina e medicação só podem ser registradas no fechamento do atendimento, e não há
  edição nem remoção depois.
- O aviso de lembrete é só por e-mail, e sem SMTP configurado nada sai (a marcação de `notificado`
  acontece mesmo assim, para não varrer o mesmo registro de hora em hora).

## [Não versionado] - 2026-08-15 - Chat entre tutor e veterinário

### ✨ Adicionado

**Banco (migration `20260815160000_add_anexos_e_historico_do_chat`)**
- `mensagens_anexos`: arquivo preso à **mensagem** que o enviou, não ao atendimento, guarda a
  chave do objeto no R2 (nunca a URL pública), nome original, mime, tamanho e tipo.
- `mensagens_edicoes`: versão anterior de cada mensagem editada, com autor e data. Editar deixou
  de ser uma operação destrutiva.
- `mensagens`: `deletada_por_id`, e `latitude`/`longitude`/`endereco` para localização como ponto
  único. `conteudo` passou a aceitar nulo, mensagem que é só foto, documento ou ponto no mapa
  não tem texto, e gravar string vazia seria fingir que tem.

**API**
- Envio de imagem (JPEG/PNG/WEBP/HEIC) e PDF por `POST /mensagens` em multipart, até 10MB.
  O arquivo vai para o R2 e a leitura devolve **URL assinada de curta duração**, a chave do
  objeto nunca sai da API. Vídeo é recusado explicitamente, com mensagem própria.
- `PUT /mensagens/:id` (edição, só do autor e só de texto), `DELETE /mensagens/:id` (exclusão
  lógica, do autor ou de admin) e `GET /mensagens/:id/historico` (versões anteriores).
- Confirmação de leitura de verdade: `lida_em` passou a ser preenchido e o remetente recebe
  `mensagens:lidas` por Socket.IO. Também há `mensagem:editada` e `mensagem:excluida`.
- Permissão fechada: conversa de um atendimento só para os dois participantes e o admin do
  tenant, que, por ser quem audita, é o único que enxerga o conteúdo do que foi excluído.

**Telas**
- Chat do veterinário e do tutor com anexo (foto/documento), envio de localização, edição com
  aviso de que a versão original fica registrada, exclusão e marcação de lida/editada.

### 🐛 Corrigido

- `POST /mensagens` descartava `tipo` e `metadados`: as colunas existiam desde o início e o Zod
  removia as chaves, então só passava texto.
- O chat do tutor chamava `PUT /mensagens/marcar-lidas/:id`, rota que não existe. O 404 abortava
  o carregamento e os dados do atendimento nunca eram exibidos na conversa.
- Erro de upload (arquivo grande demais, tipo não permitido) respondia 500; agora responde 400
  com a razão.

## [Não versionado] - 2026-08-15 - Área do veterinário: prontuário, mensagens, cobrança e conta bancária

### ✨ Adicionado

**Prontuário eletrônico no fechamento do atendimento**
- As tabelas `prontuarios_eletronicos`, `prescricoes_itens` e `solicitacoes_exames` existiam desde
  a migration `20260812180029` e nunca tinham recebido uma linha. Agora `PUT /solicitacoes/:id/finalizar`
  grava o registro clínico completo (queixa principal, exame físico, hipótese, diagnóstico definitivo,
  orientações, retorno sugerido), a prescrição item a item (medicamento, concentração, forma, posologia,
  duração) e os exames solicitados, tudo na mesma transação da mudança de status.
- `GET /solicitacoes/:id/prontuario`: leitura do registro, restrita aos participantes e ao admin do tenant.
- Tela `/veterinario/atendimento/:id/prontuario`: formulário de encerramento com listas dinâmicas de
  medicamentos e exames, e visualização somente leitura depois de finalizado, com os PDFs emitidos.
- O botão "Finalizar" da tela de atendimento e o histórico levam a ela; o modal do plantão ganhou
  atalho para o prontuário completo.
- Sem hipótese diagnóstica o atendimento não fecha (400).

**Mensagens (veterinário → tutor)**
- `GET /mensagens/contatos`: tutores com quem o usuário tem vínculo de atendimento, para
  iniciar uma conversa nova.
- Seletor "escrever para um tutor" em `/veterinario/mensagens`.

**Cobranças do veterinário**
- `GET /veterinario/financeiro/cobrancas` (com resumo aberto/pago), `GET .../cobrancas/atendimentos`,
  `POST .../cobrancas` (gera PIX com split) e `POST .../cobrancas/:id/cancelar`.
- Tela `/veterinario/cobrancas`: gerar cobrança de um atendimento, copiar o PIX, falar com o tutor
  e cancelar cobrança não paga.
- Ao gerar a cobrança, o tutor recebe evento `pagamento:solicitado` e uma mensagem no atendimento.

**Conta bancária**
- `GET`/`PUT /veterinario/financeiro/conta-bancaria`: consulta mascarada e cadastro/alteração dos
  dados bancários (antes só era possível cadastrar uma vez, no onboarding, sem poder rever ou trocar).
- Tela `/veterinario/conta-bancaria` com validação por tipo de chave PIX e trilha de auditoria na
  gravação (sem registrar o dado sensível).
- Atalhos para mensagens, cobranças e conta bancária na home, no menu lateral e em configurações.

### 🔒 Corrigido (segurança)

- `GET /payments/:id/status` não filtrava por tenant nem por participante: qualquer usuário
  autenticado lia a cobrança de qualquer outro sabendo o UUID. Agora exige tenant + participante
  (ou admin do tenant).

### 🐛 Corrigido

- **O prontuário em PDF que ia para o tutor não tinha uma linha escrita pelo veterinário.**
  `finalizar` chamava `gerarProntuarioPdf` com `queixaPrincipal`/`diagnosticoDefinitivo`/`orientacoesTutor`,
  nomes que não existem na assinatura da função (`anamnese`/`hipotesesDiagnosticas`/`conduta`). Todos os
  campos clínicos chegavam `undefined` e o documento saía inteiro com os textos genéricos de fallback
  "Atendimento de rotina.", "Paciente em bom estado geral.", "Seguir recomendações de higiene e nutrição."
- **O atendimento podia ser encerrado sem nenhum documento clínico.** `PUT /solicitacoes/:id/status`
  aceitava `finalizado`, e era exatamente o que a tela `/veterinario/atendimento/:id` fazia: o atendimento
  terminava sem diagnóstico, sem receita, sem PDF e sem o e-mail ao tutor. Encerrar agora só pela rota
  `/finalizar`; a rota de status responde 400 apontando o caminho.
- **Os sintomas descritos pelo tutor eram descartados.** O app envia `observacoes` ao abrir o chamado,
  mas o campo não existia no `createSolicitacaoSchema` - o Zod removia a chave e o controller nunca a
  gravava. O veterinário aceitava o chamado sem saber o motivo dele. Agora persiste, aparece para o vet
  e abre a queixa principal do prontuário.
- **O relato do tutor era sobrescrito no fechamento**: `finalizar` gravava as observações do veterinário
  por cima de `Solicitacao.observacoes`. As anotações do vet agora vão para as orientações do prontuário.
- **Nenhuma mensagem de validação chegava às telas.** O `validate.middleware` testava `error.errors`,
  que o Zod 4 renomeou para `error.issues`; toda falha caía no bloco genérico e os formulários exibiam
  "Erro ao validar dados" no lugar do erro do campo.
- O prontuário em PDF escrevia uma seção por cima da outra quando o texto clínico era longo (as posições
  eram fixas). Cada bloco agora mede a própria altura e quebra a página; o exame físico, que era recebido
  e nunca impresso, entrou no documento, junto dos exames solicitados e do retorno sugerido.
- `payment.service` lia o Socket.IO de `global.io`, que o servidor nunca define (`app.set('io', io)`).
  O evento `pagamento:aprovado` nunca era emitido. O `io` agora vem do webhook e o evento também
  chega ao tutor e ao veterinário, não só à sala do atendimento.
- O checkout do tutor gerava sempre uma nova cobrança de R$ 150 fixos, ignorando a cobrança do
  veterinário. Agora reaproveita a cobrança existente do atendimento (`GET /payments/atendimento/:id`)
  e o valor exibido é o real.
- O veterinário só conseguia mandar mensagem dentro de um atendimento com ID em mãos; conversas sem
  atendimento vinculado falhavam com "Mensagens exigem um atendimento válido".

## [1.0.0] - 2024-01-01 - MVP Release

### 🎉 Primeira Versão - MVP Completo

#### ✨ Features Adicionadas

**Backend:**
- Sistema de autenticação completo com JWT
- CRUD de usuários (tutor, veterinário, admin)
- CRUD de pets
- Sistema de solicitações de atendimento
- Sistema de avaliações
- Painel administrativo
- WebSocket com Socket.IO para notificações em tempo real
- Middleware de autenticação e autorização
- Validações de segurança
- Criptografia de senhas com bcrypt

**Frontend:**
- Interface completa do Tutor
  - Cadastro e gerenciamento de pets
  - Solicitação de atendimento
  - Acompanhamento em tempo real
  - Histórico de atendimentos
  - Sistema de avaliação
- Interface completa do Veterinário
  - Sistema de online/offline
  - Recebimento de solicitações em tempo real
  - Aceitação/recusa de atendimentos
  - Atualização de status do atendimento
  - Estatísticas e avaliações
- Painel Administrativo
  - Dashboard com estatísticas
  - Aprovação de veterinários
  - Gerenciamento de usuários
  - Visualização de atendimentos
- PWA configurado (Service Worker + Manifest)
- Design mobile-first com TailwindCSS
- Navegação com React Router
- Context API para Auth e Socket

**Banco de Dados:**
- Schema Prisma completo
- 5 modelos principais (Usuario, Pet, Veterinario, Solicitacao, Avaliacao)
- Migrations configuradas
- Relacionamentos e validações

**DevOps:**
- Scripts de criação de admin
- Scripts de seed para dados de teste
- Documentação completa
- Guias de início rápido

#### 📝 Documentação

- README.md principal com visão geral
- QUICKSTART.md para início rápido
- PROJECT_SUMMARY.md com resumo do projeto
- SPECS.md com especificações técnicas
- Comentários inline no código

#### 🔒 Segurança

- Autenticação JWT com expiração
- Senhas criptografadas com bcrypt (10 salt rounds)
- Middlewares de autorização por tipo de usuário
- Validações de entrada
- Proteção contra SQL injection (Prisma ORM)
- CORS configurado

#### 🎨 Design

- Paleta de cores definida (Verde #10b981, Azul #3b82f6)
- Interface mobile-first
- Componentes reutilizáveis
- Feedback visual em todas as ações
- Cards grandes e botões fáceis de clicar
- Ícones emoji para clareza

#### 🔄 Real-time

- Socket.IO configurado
- Notificações em tempo real para veterinários
- Atualizações de status em tempo real para tutores
- Sistema de match (primeiro que aceitar)

#### 📱 PWA

- Manifest configurado
- Service Worker com cache de assets
- Instalável em dispositivos móveis
- Funciona offline (páginas em cache)
- Ícones em múltiplas resoluções

### 🚧 Limitações Conhecidas (MVP)

- Apenas 1 cidade suportada
- Sem sistema de pagamento
- Sem geolocalização em tempo real
- Sem upload de imagens
- Sem chat textual complexo
- Sem notificações push
- Sem histórico médico dos pets
- Sem agendamento de consultas futuras

### 🎯 Próximos Passos (Roadmap)

- [ ] Integração com sistema de pagamento (Stripe/PagSeguro)
- [ ] Implementar geolocalização com Google Maps
- [ ] Sistema de chat em tempo real
- [ ] Upload de fotos de pets
- [ ] Notificações push
- [ ] Múltiplas cidades
- [ ] Histórico médico dos pets
- [ ] Sistema de agendamento
- [ ] App nativo com React Native
- [ ] Dashboard de analytics
- [ ] Sistema de cupons/promoções

### 📊 Estatísticas do Projeto

- **Arquivos criados:** 80+
- **Linhas de código:** ~8,000
- **Tempo de desenvolvimento:** MVP em 1 sprint
- **Tecnologias:** 15+
- **Rotas de API:** 25+
- **Páginas frontend:** 15+
- **Modelos de dados:** 5

### 🐛 Bugs Conhecidos

Nenhum bug crítico identificado no MVP.

### 🙏 Agradecimentos

Obrigado a todos que contribuíram para tornar este projeto realidade!

---

**Versão:** 1.0.0  
**Data:** 2024-01-01  
**Status:** MVP Completo ✅
