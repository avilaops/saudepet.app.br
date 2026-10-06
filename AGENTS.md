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

### Deploy

O GitHub Actions compila o codigo e publica imagens no GHCR. O servidor recebe
imagens por digest via SSH, preservando os volumes de dados. O deploy deve ser
verificado pelo nginx e por `bash scripts/verificar-deploy.sh`, com `REPO` apontando
para o checkout do commit publicado.

- Mudança em `schema.prisma` exige `docker compose up -d --build backend`.
- Mudança em `frontend/nginx.saudepet.conf` exige `docker compose up -d --force-recreate web`
  uma vez: a conf é bind mount de arquivo único e o `git reset` troca o inode.
- Recriar o backend não exige mais reiniciar o web: o nginx resolve o nome pelo DNS do Docker
  (`resolver 127.0.0.11`).
