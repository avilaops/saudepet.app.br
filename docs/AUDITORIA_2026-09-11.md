# Auditoria de estado real: Roadmap, Todoist e produção (11/09/2026)

Feita antes de qualquer alteração de código, confrontando `docs/ROADMAP.md`, os dois projetos
do Todoist ("Saúde Pet app" e "Prospecção / Canais de Vendas"), o código, o `schema.prisma`,
o banco de produção, o servidor (`/opt/saudepet`), o Docker Compose, o nginx, o site no ar e
os logs. Toda linha traz a evidência de onde o estado foi lido.

## Retrato de produção às 12h de 11/09

| O quê | Estado | Evidência |
| --- | --- | --- |
| Containers | backend, web, transcricao: `Up 2 days (healthy)`, 0 reinícios | `docker ps` |
| Servidor x repositório | servidor em `14170fe`; local só tem `4629b07` (doc) à frente | `git log 14170fe..HEAD` |
| Árvore do servidor | 9 itens sem rastreio: `seed-demo-mercado.js`, `offer-expiry.worker.js`, `backups/`, 6 `dist.bak.*` (57 MB) | `git status --short` no servidor |
| Rotas públicas | `/`, `/blog`, `/login`, `/tutor`, `/veterinario/home`, `/parceiro`, `/mercado`, `/admin`, `/api/health`, feed público: todas 200 pelo nginx | `curl` externo |
| Rotas protegidas | `/api/v1/pets`, `/solicitacoes`, `/minhas-notificacoes`, `/veterinarios/estatisticas`: 401 sem token | `curl` externo |
| Transcrição | healthy, `/saude` 200 no log, imagem de 08/09 (`requests` fixado) | `docker inspect` + log |
| nginx | 18 `proxy_pass http://backend:3000`, sem `resolver`: IP resolvido só no boot | conf montada no container |
| Banco | 7 tutores, 2 vets (3 fichas), 3 admin, 2 super_admin; 7 solicitações (3 `sem_veterinario`, 2 finalizadas, 2 canceladas); 0 pedidos do Mercado; 8 notificações | Prisma no container |
| Mercado | 2 lojas `aprovada` (ambas aprovadas em 01/09 13:57): BioVet (demo, Rio Preto, `aceita_entrega`, sem coordenada) e Casa de Rações (Ribeirão, sem endereço, só retirada, sem coordenada); 178 produtos (109 ativos + 66 inativos na Casa de Rações, 3 na BioVet) | Prisma no container |
| Mercado Pago | credenciais no `GatewayConfig` (produção, ativo, `testado_em` nulo); nenhuma variável MP no `.env` (correto: mora no banco) | Prisma no container |
| Meta / WhatsApp | `META_APP_ID`, `META_APP_SECRET`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN` ausentes; rotas respondem 503 por desenho | `.env` do servidor (só presença) |
| CEP Certo / Correios | código existe (`cepcerto.service`, `postagem.service`, `frete-transportadora.service`); `CEP_CERTO_POSTAGEM_API_KEY` ausente | `.env` do servidor (só presença) |
| `VITE_WHATSAPP_URL` | vazia no servidor e **não é mais lida por nenhum arquivo do frontend** | `grep` em `frontend/src` |
| Logs (48 h) | só `[ERROR]` de 404 em `POST /api/public/render/blog/index.php` (varredura de robô); nenhum 5xx | `docker compose logs` |
| Sanitização de logs | existe (`utils/redigir-segredo.ts`, usado no `error.middleware`) | código |

## Tabela de itens

| # | Item | Roadmap/Todoist | Prioridade | Estado real | Evidência | Responsável | Próxima ação |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Fase 5: jornada ponta a ponta no celular real (tutor pede, vet aceita, atende, prontuário, avaliação, dinheiro em teste) | Roadmap F5; Todoist "Portal do parceiro: comprovar no celular" (p1, vencida 01/09) | P1 | Não comprovada. A API tem suíte de jornada (`tests/e2e/flows`, 62 casos) e o parceiro tem telas, mas ninguém rodou no celular com conta real. Os 3 chamados `sem_veterinario` mostram tutor pedindo sem vet online. | banco; `tests/e2e` | Nicolas (celular + conta MP de teste); Dev prepara roteiro | Dev entrega roteiro e evidência automatizada; Nicolas executa no aparelho |
| 2 | Loja de demonstração BioVet pública | Todoist "loja de demonstração estava publicada (resolvido)" (p3) reaberto pelo fato | P1/P2 | **Reaberto**: `aprovada` desde 01/09 13:57, na vitrine, no sitemap e no feed. Nada no schema distingue demo de loja real; o seed do servidor cria já `aprovada`. | Prisma; `seed-demo-mercado.js` no servidor | Dev | Portão estrutural: campo `demonstracao`, filtro em toda leitura pública, recusa na aprovação, seed corrigido, teste de regressão |
| 3 | nginx perde o backend após recriar o container | Prompt (seção 4) | P2 | Confirmado: sem `resolver`, `proxy_pass http://backend:3000` fixa o IP no boot. Hoje o deploy faz `restart web` à mão. | conf + `resolv.conf` do container (127.0.0.11) | Dev | `resolver 127.0.0.11` + upstream em variável, validar as 18 regras, provar recriação sem 502 |
| 4 | Lojas sem coordenada | Todoist "nenhuma das lojas tem coordenada" (p2) | P2 | Código já geocodifica e recusa entrega sem ponto (`localizarLoja`, `exigirPontoParaEntregar`). Só registros antigos: BioVet (entrega ligada, endereço real) e Casa de Rações (sem endereço, sem entrega: não precisa). | `loja.service.ts:232-262`; banco | Dev | Script idempotente de preenchimento a partir do endereço real; nunca inventar |
| 5 | Segredo do webhook Mercado Pago (401) | Todoist p2 vencida 01/09 (Abraão) + "aplicar quando entregar" (Dev) | P2 | Credenciais MP estão no banco, ativas, produção; só o segredo do webhook está errado; reconciliação de 5 min cobre. | `GatewayConfig` | Abraão entrega; Dev aplica | Aguardar o texto do segredo por canal seguro |
| 6 | Meta / WhatsApp | Roadmap F6 | P2 | Código pronto e inerte; nenhuma variável Meta no servidor; bloqueios são todos no painel da Meta. | `.env`; Roadmap F6 | Nicolas (painel Meta) | Sem ação de código |
| 7 | Correios / CEP Certo | Prompt (seção 20); Todoist "Definir política de frete e embalagem" | P2 | Serviço e mapeamento existem; sem chave, `aceita_transportadora` desligado nas duas lojas; UI não promete Correios. | código; banco | Abraão/Nicolas (conta CEP Certo); Dev mapeia | Documentar o fluxo e o que falta; nada de prometer na tela |
| 8 | WhatsApp oficial do site (`VITE_WHATSAPP_URL`) | Roadmap 0.6 | P3 | Item obsoleto: a variável não é mais lida. O contato público hoje é o formulário e o WhatsApp de cada loja. | `grep` no frontend | Nicolas decide se volta a existir botão | Fechar 0.6 como "sem efeito" no Roadmap |
| 9 | Chave de deploy do servidor | Todoist p2 (claude) | P2 | Sem chave válida; deploy segue por bundle. | `git fetch` no servidor: `Permission denied` | Nicolas (cadastrar chave no GitHub) | Manter bundle |
| 10 | Lixo na árvore do servidor | (nenhum) | P3 | `offer-expiry.worker.js` é JS órfão (não compila com `allowJs: false`, não roda); 6 `dist.bak.*` e `backups/` ocupam 57 MB | `git status` no servidor | Dev | Remover no próximo deploy (backups ficam) |
| 11 | 404 de robô logado como `[ERROR]` | (nenhum) | P3 | `POST .../blog/index.php` vira erro vermelho no log e polui a busca por falha real | log | Dev | Rebaixar 404 de rota inexistente para nível de aviso |
| 12 | QA administrativo com conta real (0.5) | Roadmap 0.5 | P3 | Não comprovado por conta de admin real | Roadmap | Nicolas | Executar as 4 operações |
| 13 | `limite_atendimentos` registrar a regra (2.B.4) | Roadmap 2.B.4 | P3 | Só documentação | Roadmap | Dev | Registrar a regra no Roadmap |
| 14 | Produtos sem foto e sem preço | Todoist p2 | Decisão comercial | 175 sem foto; 66 sem preço estão inativos | banco | Abraão/Nicolas | Decidir se o catálogo da Casa de Rações vira loja |
| 15 | Decisões comerciais abertas (Clube Vet cobra do 1º atendimento? clínica é fornecedora?) | Todoist p1/p3 (Nicolas) | Decisão | Não decididas | Todoist | Nicolas | Reunião |

## A. Concluído, mas não registrado

- Fase 1 fechada em 08/09 já está no Roadmap. O servidor ainda não tem o commit da documentação
  (`4629b07`), vai junto no próximo deploy.
- Sanitização de credenciais nos logs existe no código (`redigir-segredo.ts`); a tarefa do
  Todoist de 28/08 (p1, Dev) continua aberta.
- Transcrição: imagem reconstruída em 08/09, healthy, `/saude` respondendo. O prompt confirma
  que a API transcreveu webm/opus de ponta a ponta. Falta só o ditado pela tela do prontuário
  no teste da Fase 5.
- `/parceiro` responde 200 pelo nginx. Blog com artigos publicados.
- Roadmap 0.6 (`VITE_WHATSAPP_URL`) ficou sem efeito: nenhum componente lê a variável.

## B. Pendências técnicas por prioridade

- **P1** Fase 5 no celular real (item 1). Parte de engenharia: roteiro e evidência automatizada;
  parte que só o Nicolas faz: aparelho e pagamento em ambiente de teste.
- **P1/P2** Portão estrutural da loja de demonstração (item 2).
- **P2** nginx com resolução dinâmica (item 3).
- **P2** Preenchimento de coordenadas dos registros antigos (item 4).
- **P2** Correios/CEP Certo: mapeamento documentado (item 7).
- **P3** Lixo no servidor (10), 404 de robô como erro (11), 2.B.4 (13).

## C. Bloqueios que só o Nicolas resolve

- Teste da Fase 5 no aparelho, com conta de teste do Mercado Pago.
- Painel da Meta: domínios do app, URL de privacidade, publicação, App Review, tokens.
- Chave de deploy nova no GitHub.
- Decisões do Todoist: Clube Vet cobra do 1º atendimento; clínica parceira como fornecedora.
- QA administrativo com conta real (0.5).

## D. Bloqueios que dependem do Abraão

- Segredo do webhook do Mercado Pago em texto (vencido em 01/09).
- Responder as 5 perguntas da proposta "sistema do veterinário" (vencido em 01/09).
- Lista de 80 estabelecimentos em Curitiba (vencido em 31/08).
- ICP e personas, planos e faixa de preço, critérios de parceiro, Meta Ads, proposta de valor B2B.
- Conta CEP Certo (ou decisão de qual transportadora) para o Mercado enviar por Correios.

## E. Bugs de produção encontrados

- Loja de demonstração pública (item 2). Não é falha de container: é ausência de portão.
- Loja com entrega ligada sem coordenada (BioVet). O código atual recusaria salvar; o registro
  é anterior à regra.
- nginx cai em 502 ao recriar o backend até alguém reiniciar o `web` (item 3).
- Nenhum 5xx real nos últimos dois dias.

## F. Ações no Todoist (feitas depois da prova, não antes)

- Reabrir/atualizar "loja de demonstração estava publicada" com o portão estrutural.
- Atualizar "nenhuma das lojas tem coordenada" com o resultado do preenchimento.
- Fechar "limpar vazamento de credenciais nos logs" (código existe; a rotação do segredo foi
  registrada em 26/08 no Roadmap 0.4).
- "Portal do parceiro: comprovar no celular": anexar o roteiro e o que falta do Nicolas.

## G. Atualizações no Roadmap

- 0.6: marcar como sem efeito (variável não lida).
- Fase 4 Infraestrutura: registrar o `resolver` do nginx quando provado.
- Fase 5: registrar o que foi provado por automação e o que fica para o aparelho.
- Mercado: registrar a regra "loja de demonstração nunca é pública".

## H. Plano de execução desta sessão

1. Portão da loja de demonstração (schema + migration + filtros + aprovação + seed + testes).
2. nginx com `resolver 127.0.0.11`, validação de todas as famílias de rota, prova de
   recriação do backend sem 502 e sem reiniciar o `web`.
3. Script idempotente de coordenadas para lojas antigas com entrega ligada.
4. Correios/CEP Certo: mapeamento do fluxo e do que falta.
5. Fase 5: roteiro e evidência automatizada da jornada; o resto fica listado para o Nicolas.
6. Commits coerentes, deploy direto no servidor, verificação externa, Todoist e Roadmap.
