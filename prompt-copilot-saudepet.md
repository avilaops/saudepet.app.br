# Prompt para o Copilot: Saúde Pet (repo avilaops/saudepet.app.br)

Você está trabalhando no monorepo do Saúde Pet (PWA que conecta tutores a veterinários em atendimento domiciliar). Frontend em `frontend/` (React + Vite + TypeScript + Tailwind), backend em `backend/` (Node + TypeScript + Prisma). Leia o `AGENTS.md` da raiz antes de começar e siga as convenções que já existem no código (comentários em português explicando o porquê, cliente `api` com interceptor, rotas `/v1/...`).

## Contexto: feedback do cliente

O cliente testou o app em produção (https://saudepet.app.br) pelo celular (iPhone, Safari/PWA), logado como tutor, e relatou dois problemas:

1. **Crash no fluxo de solicitar atendimento.** O tutor escolheu o tipo de atendimento, o pet, marcou o endereço no mapa (a geolocalização funcionou bem e foi elogiada) e, ao avançar para o passo seguinte, que deveria "encontrar o veterinário", a tela quebrou e apareceu o `AppErrorBoundary` com a mensagem "Não foi possível exibir esta tela / A página encontrou um erro inesperado". Ele descreveu como "na hora do pagamento / na hora de escolher o veterinário".
2. **O tutor não vê preço em nenhum momento.** Palavras do cliente: "como é que o cliente vai pedir um veterinário se não aparece valor lá?". O combinado com ele é que **cada veterinário cadastra os próprios valores** (consulta, microchipagem, deslocamento até o local do pet, etc.) e **esses valores aparecem para o tutor na hora em que ele faz o pedido**, antes de confirmar.

## O que eu já levantei no código (confirme antes de confiar)

- O fluxo do tutor é `frontend/src/pages/tutor/TutorSolicitarAtendimentoStepFlow.tsx` (rota `/tutor/solicitar`), em 3 passos: Tipo de atendimento, Pet & sintomas, Endereço. O botão final "Confirmar & Iniciar Busca" faz `POST /v1/solicitacoes` e navega para `/tutor/acompanhar/:id` (`TutorLiveTracking.tsx`), que carrega com `GET /solicitacoes/:id` (sem `/v1`, verificar se é intencional) e renderiza `Videochamada`, `BuscaEncerrada`, `FormulariosPendentes` e a linha do tempo `ETAPAS`.
- Existe o estado `profissionalEscolhido` / `setProfissionalEscolhido` no StepFlow e ele é enviado como `veterinario_escolhido`, mas **`setProfissionalEscolhido` nunca é chamado**: não há passo de escolha de veterinário nem exibição de preço.
- Há um comentário no passo 3 dizendo que "o pagamento é combinado após o atendimento (cobrança do vet ou tabela da cidade)" e que o seletor de pagamento foi removido. Isso contradiz o que o cliente quer.
- O backend **já tem** a tabela de preços por veterinário: model `CatalogoItemVeterinario` (`codigo`, `nome`, `categoria` enum `SERVICO_DOMICILIAR | VACINA | OUTRO_SERVICO | ADICIONAL_HORARIO`, `tipo_atendimento`, `preco`, `ativo` default `false`, `ordem`), rotas em `backend/src/routes/catalogo-veterinario.routes.ts` e controller `catalogo-veterinario.controller.ts`, mas só com `obterMeuCatalogo` / `salvarMeuCatalogo` (o próprio vet). Não existe endpoint para o tutor consultar preços, e nenhuma tela em `frontend/src/pages/tutor` usa o catálogo.
- O vet edita valores em `frontend/src/pages/veterinario/VetHorariosValores.tsx`. `Solicitacao` tem `valor_estimado Float?`.
- `frontend/src/components/AppErrorBoundary.tsx` só faz `console.error` no `componentDidCatch`, então o erro de produção não ficou registrado em lugar nenhum.

## Tarefa 1: investigar e corrigir o crash

1. Rode o projeto localmente (`npm run dev`, usando `docker-compose.dev-db.yml` e o seed se precisar) e reproduza o fluxo completo como tutor, **em viewport mobile (iPhone/Safari se possível, WebKit no Playwright)**: tipo de atendimento, pet, endereço pelo mapa, "Confirmar & Iniciar Busca", tela de acompanhamento. Teste também com endereço salvo e com endereço novo + "salvar endereço".
2. Descubra exatamente qual componente lança o erro de render. Suspeitos, em ordem: `TutorLiveTracking.tsx` e seus filhos (`Videochamada`, `BuscaEncerrada`, `FormulariosPendentes`, `etapaAtualIndex` com status inesperado), o `SeletorDeLocal` do passo 3, e a diferença `/v1/solicitacoes` (criação) vs `/solicitacoes/:id` (leitura), que pode devolver um formato diferente do esperado. Verifique também campos que chegam `null`/objeto onde o JSX espera string.
3. Corrija a causa raiz (não apenas envolva em try/catch). Adicione um teste (Playwright em `tests/` ou teste de componente) que cubra o fluxo tutor até a tela de acompanhamento em viewport mobile.
4. Melhore o `AppErrorBoundary` para **reportar o erro** (mensagem, stack, rota, user agent, id do usuário se houver) para o backend ou para a observabilidade que já existe em `backend/observability`, para que o próximo erro em produção seja rastreável. Não mostre stack para o usuário.

## Tarefa 2: preço do veterinário visível para o tutor antes de confirmar

Objetivo de produto: o tutor só confirma o pedido sabendo quanto vai pagar, e o valor vem da tabela que o próprio veterinário cadastrou.

1. **Catálogo do vet.** Garanta que em `VetHorariosValores.tsx` o veterinário consiga cadastrar, no mínimo: valor da consulta domiciliar por tipo de atendimento (emergência, consulta domiciliar, rotina, vacinação, avaliação, teleorientação), **microchipagem**, **taxa de deslocamento** (fixa ou por km, decida com base no que o código já suporta e documente a escolha) e adicionais de horário. Use o `CatalogoItemVeterinario` existente; só altere o schema Prisma se for realmente necessário, com migration.
2. **Endpoint para o tutor.** Crie uma rota autenticada de tutor (ex.: `GET /v1/solicitacoes/opcoes-veterinarios?tipo_atendimento=&latitude=&longitude=`) que devolva os veterinários disponíveis/atendendo aquela região com: nome, foto, avaliação média, total de atendimentos, distância estimada e **os itens ativos do catálogo relevantes ao tipo de atendimento**, com o total estimado (serviço + deslocamento). Reaproveite a lógica de busca/raio/cidade que já existe no backend (`geo.routes`, `veterinario.routes`, tabela da cidade). Veterinário sem preço cadastrado para aquele tipo: não esconder silenciosamente; mostrar "valor da tabela da cidade" se existir referência, senão ficar fora da lista. Respeite `tenant_id`.
3. **Passo no fluxo do tutor.** Em `TutorSolicitarAtendimentoStepFlow.tsx`, após o endereço, adicione o passo "Escolher veterinário" (o fluxo passa a ter 4 passos; atualize `passos`, barra de progresso e subtítulo "Passo X de 4"). Mostre cards com os vets, o detalhamento do valor (consulta, deslocamento, itens opcionais como microchipagem) e o total. Ao escolher, chame `setProfissionalEscolhido` e envie `veterinario_escolhido` + `valor_estimado` no `POST /v1/solicitacoes`. Para **emergência**, mantenha a opção "enviar para o primeiro disponível" mostrando a faixa de preço (mínimo e máximo) dos vets da região, para não atrasar o socorro.
4. **Backend da solicitação.** Valide no servidor o `valor_estimado` recalculando a partir do catálogo (nunca confiar no valor vindo do front) e grave o snapshot do preço na solicitação, para que mudança posterior na tabela do vet não altere um pedido já feito.
5. Remova ou atualize o comentário do passo 3 que diz que o pagamento é combinado depois, e mostre o valor também na tela de acompanhamento (`TutorLiveTracking.tsx`) e no histórico.
6. Se o fluxo de pagamento (`TutorPaymentCheckout.tsx`, `payment.routes`) precisar ser ligado a esse valor, descreva o que falta num comentário do PR em vez de implementar pela metade.

## Critérios de aceite

- Fluxo tutor completo em mobile (WebKit) sem cair no `AppErrorBoundary`, com teste automatizado cobrindo.
- Tutor vê o valor detalhado e o total antes de confirmar; o valor vem do catálogo do veterinário; o servidor recalcula e guarda o snapshot.
- Veterinário consegue cadastrar consulta, microchipagem e deslocamento na tela de valores.
- Erros de render em produção passam a ser registrados.
- `npm run build` (que roda `verificar:dados-falsos`) e os testes do backend passando. Não usar dados fictícios em produção.
- Textos de interface em português, sem travessões (use vírgula, ponto ou dois-pontos).

## Entrega

Abra **dois PRs separados** (ou dois commits bem separados): primeiro o fix do crash + reporte de erro (vai para produção logo), depois a feature de preços. Na descrição de cada PR, explique a causa raiz encontrada, o que mudou e como testar no celular.
