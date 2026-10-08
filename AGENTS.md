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

Desde 06/10/2026 esse pipeline está parado: o repositório foi recriado e perdeu as chaves
de deploy, a variável `DEPLOY_ENABLED` e o acesso aos pacotes do GHCR. Em 08/10 (`fe6f492`)
saiu a falha de inicialização: o repositório é público e chamava os workflows reutilizáveis
do `avilaops/infra`, que é privado; `container.yml` e `deploy-ssh.yml` agora são cópias
locais em `.github/workflows/` (mudou no `infra`, traga para cá). O `verify` e o build das
três imagens passam; **falta o envio ao GHCR**, que responde `permission_denied`: os pacotes
`saudepet.app.br-backend`, `-web` e `-transcricao` ficaram privados e sem repositório
vinculado. Para destravar, em cada pacote (github.com/users/avilaops/packages/container/…,
Package settings › Manage Actions access), adicionar este repositório com papel `Write`.
Depois disso ainda faltam os segredos `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_KNOWN_HOSTS`,
`DEPLOY_BACKEND_SSH_KEY`, `DEPLOY_WEB_SSH_KEY` e `DEPLOY_TRANSCRICAO_SSH_KEY` e a variável
`DEPLOY_ENABLED=true`. Enquanto isso não for refeito, o deploy é `bash scripts/deploy-manual.sh <web|backend|transcricao> [commit]`,
rodado da máquina de desenvolvimento: o build acontece no `apps-noclient` (sem cliente
nenhum), nunca no servidor de produção, e a troca tem checagem de saúde e volta automática.
Desde 08/10 backend e web saem por esse caminho (o `prisma migrate deploy` roda antes da
troca, com a imagem nova). Publique o backend primeiro e o web depois, do mesmo commit, e
faça dump do banco antes quando houver migração.

### Páginas públicas: um `.tsx` só, desenhado também no servidor

Toda página é `.tsx` em `frontend/src/pages`. Não existe HTML de página escrito à mão: a
pasta `landing-page/` e os resumos que o backend montava (`renderBlogHtml`,
`renderStaticPageHtml`, `mercado-render.service`) saíram em 08/10/2026.

As públicas (`/`, `/faq`, `/contato`, `/privacidade`, `/blog`, `/blog/:slug`, `/mercado`,
`/mercado/:slug`, `/mercado/:slug/:produto`) chegam prontas no HTML inicial, para o Google e
para a prévia de link:

- `frontend/src/entry-server.tsx` reúne essas rotas; `npm run build` gera
  `frontend/dist-ssr/entry-server.cjs` e roda `frontend/scripts/verificar-ssr.mjs`, que
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
  do React e a página é redesenhada do zero. O `verificar-ssr.mjs` reprova se essa lista e a
  do `entry-server.tsx` divergirem.
- Página pública nova: rota no `App.tsx` (com `paginaDoServidor`), no `entry-server.tsx` e no `nginx.saudepet.conf`
  (`proxy_pass` para `/api/public/render/...`), dados no controller e caso no
  `verificar-ssr.mjs`. Nada de `window`, `document` ou `localStorage` fora de `useEffect` e
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
