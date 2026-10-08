# Instruções para agentes (Copilot, Codex, Claude)

Regras de operação que valem para qualquer agente trabalhando neste repositório. O contrato do
produto está em `docs/ROADMAP.md` (seção "Regras permanentes"); aqui fica o que é do servidor.

## Servidor de produção e Docker

Estado confirmado em 11/09/2026: backend, web/nginx e transcrição healthy, zero reinícios, `/`
e `/api/health` em 200 pelo nginx, carga perto de 1,5 em 4 núcleos, 71% de disco com 11 GB
livres.

### Falha local não é falha de produção

Em 11/09 os testes locais falharam com "Can't reach database server". A causa era o Docker
Desktop da máquina de desenvolvimento com CPU em 100%, não o servidor.

- Não trate o servidor como degradado por erro visto no ambiente local.
- Não reinicie container de produção para resolver problema do Docker Desktop local.
- Quando um teste local falhar por infraestrutura, confirme produção separadamente antes de
  diagnosticar regressão da aplicação.

### Limpeza do Docker

O host tem cerca de 25 GB em imagens, 10 GB em cache de build e uns 8 GB recuperáveis, com
32 containers ativos de vários projetos. Isso é manutenção programada, não incidente.

- **Nunca** rode `docker system prune` nem qualquer limpeza global do host.
- Com 11 GB livres, não limpe só para ganhar alguns gigabytes.
- Se houver motivo técnico real, as únicas limpezas permitidas são `docker image prune` e
  `docker builder prune`, apenas sobre objetos sem uso.

Antes de limpar:

1. Registrar `docker system df`.
2. Identificar o espaço recuperável.
3. Confirmar que nenhuma imagem em uso será removida.
4. Confirmar que nenhum container ativo será afetado.

Depois de limpar:

1. `docker compose ps` dos projetos relevantes.
2. Conferir os containers críticos.
3. Validar o Saúde Pet pelo nginx, em `/` e em `/api/health`.
4. Confirmar que não houve regressão.

Prioridade: pendências do Saúde Pet vêm antes de manutenção de Docker.

### Git

Toda alteração é commitada e enviada para a `main` na mesma tarefa (regra do servidor,
`~/AGENTS.md` seção 4): `git pull --rebase origin main`, teste, `git push origin main`. Sem
branch nem PR parado. Nunca `push --force` na `main` e nunca commitar segredo.

### Deploy

O GitHub Actions compila o codigo e publica imagens no GHCR. O servidor recebe
imagens por digest via SSH, preservando os volumes de dados. O deploy deve ser
verificado pelo nginx e por `bash scripts/verificar-deploy.sh`, com `REPO` apontando
para o checkout do commit publicado.

**Push na `main` publica em produção** (desde 08/10/2026 12:2x UTC): `verify`, build das
três imagens e deploy de backend, web e transcrição, nessa ordem; o do backend roda
`prisma migrate deploy` antes da troca. Havendo migração, faça dump do banco antes do push.
O pipeline ficou parado de 06 a 08/10: o repositório foi recriado e perdeu chaves, variável e
acesso aos pacotes do GHCR, e, sendo público, não podia chamar os workflows reutilizáveis do
`avilaops/infra`, privado. Por isso `container.yml` e `deploy-ssh.yml` são cópias locais em
`.github/workflows/` (mudou no `infra`, traga para cá). Segredos do repositório:
`DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_KNOWN_HOSTS`, `DEPLOY_BACKEND_SSH_KEY`,
`DEPLOY_WEB_SSH_KEY`, `DEPLOY_TRANSCRICAO_SSH_KEY`; variável `DEPLOY_ENABLED=true` (`false`
desliga o deploy sem mexer no resto). Os pacotes do GHCR precisam do repositório em Package
settings › Manage Actions access.

Com o Actions fora do ar, a reserva é
`bash scripts/deploy-manual.sh <web|backend|transcricao> [commit]`,
rodado da máquina de desenvolvimento: o build acontece no `apps-noclient` (sem cliente
nenhum), nunca no servidor de produção, e a troca tem checagem de saúde e volta automática.
Publique o backend primeiro e o web depois, do mesmo commit, e
faça dump do banco antes quando houver migração.

### TypeScript em tudo

Desde 08/10/2026 não há JavaScript no repositório: páginas e componentes são `.tsx`, e
backend, testes, scripts, seeds e configurações são `.ts` (`.mts` nos scripts da raiz que usam
`await` no topo). Arquivo novo nasce assim, sem exceção.

- Script roda com `tsx` (`tsx scripts/verificar-rotas.mts`, `npx tsx backend/scripts/create-admin.ts`),
  não com `node`.
- Testes, scripts e seeds foram renomeados sem tipagem: o Jest roda com `diagnostics: false` e
  o `tsc` do backend só confere `src`. Quem mexer num deles tipa o que tocar.
- O que não é TypeScript e por quê: `backend/jest.config.js` (o Jest só lê configuração `.ts`
  com `ts-node`, que o projeto não usa), `frontend/index.html` (entrada do Vite), os `.ps1`
  de Windows e os `.sh`/`.py` de operação.

### Páginas públicas: um `.tsx` só, desenhado também no servidor

Toda página é `.tsx` em `frontend/src/pages`. Não existe HTML de página escrito à mão: a
pasta `landing-page/` e os resumos que o backend montava (`renderBlogHtml`,
`renderStaticPageHtml`, `mercado-render.service`) saíram em 08/10/2026.

As públicas (`/`, `/faq`, `/contato`, `/privacidade`, `/blog`, `/blog/:slug`, `/mercado`,
`/mercado/:slug`, `/mercado/:slug/:produto`) chegam prontas no HTML inicial, para o Google e
para a prévia de link:

- `frontend/src/entry-server.tsx` reúne essas rotas; `npm run build` gera
  `frontend/dist-ssr/entry-server.cjs` e roda `frontend/scripts/verificar-ssr.ts`, que
  reprova o build se alguma página não sair desenhada ou perder o `<Seo>`.
- O backend carrega esse arquivo (`/app/ssr` na imagem) em
  `backend/src/services/pagina-publica.service.ts`: junta as respostas da API que a página
  pediria, recebe o HTML e o `<Seo>` da página, escreve o `<head>` e manda os dados num
  `<script id="dados-iniciais">`. No navegador o `main.tsx` hidrata (`data-ssr="1"`).
- A página lê o dado pronto com `useDadosIniciais()` (`frontend/src/ssr/dadosIniciais.tsx`).
  A chave é o endereço da API (`chaveDoDado`), montada igual nos dois lados.
- No `App.tsx` essas páginas são declaradas com `paginaDoServidor(...)` e listadas em
  `PAGINAS_DO_SERVIDOR`: o `main.tsx` carrega o código da página antes de hidratar. Com `lazy`
  puro a hidratação suspende, qualquer atualização que chegue antes (a sessão) dá o erro 421
  do React e a página é redesenhada do zero. O `verificar-ssr.ts` reprova se essa lista e a
  do `entry-server.tsx` divergirem.
- Provedor que fica acima das rotas (`AuthProvider`, `SocketProvider`) não muda de estado ao
  montar: o que dá para saber de forma síncrona entra no estado inicial, e o que chega depois
  vai em `startTransition`. Mudança de contexto durante a hidratação é o mesmo erro 421.
- Página pública nova: rota no `App.tsx` (com `paginaDoServidor`), no `entry-server.tsx` e no `nginx.saudepet.conf`
  (`proxy_pass` para `/api/public/render/...`), dados no controller e caso no
  `verificar-ssr.ts`. Nada de `window`, `document` ou `localStorage` fora de `useEffect` e
  de manipulador de evento.
- O `index.html` que o backend usa vem do contêiner `web` (`http://web/index.html`, com a
  cópia da imagem como reserva; `FRONTEND_TEMPLATE_URL=off` desliga). Antes ele usava só a
  cópia da própria imagem, e publicar o `web` sem o `backend` deixava as páginas públicas
  pedindo JavaScript que não existia mais (08/10/2026, 142 páginas).
- Web e backend saem do mesmo commit: mudou página pública, publique os dois.

- Mudança em `schema.prisma` exige `docker compose up -d --build backend`.
- Mudança em `frontend/nginx.saudepet.conf` exige `docker compose up -d --force-recreate web`
  uma vez: a conf é bind mount de arquivo único e o `git reset` troca o inode.
- Recriar o backend não exige mais reiniciar o web: o nginx resolve o nome pelo DNS do Docker
  (`resolver 127.0.0.11`).
