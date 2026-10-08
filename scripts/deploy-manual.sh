#!/usr/bin/env bash
#
# Deploy manual, para quando o GitHub Actions não consegue publicar.
#
# Em 06/10/2026 o repositório foi recriado e perdeu as chaves de deploy e o
# vínculo com os pacotes do GHCR. O pipeline parou, a correção do login ficou
# presa na `main` e o site passou dois dias chamando `localhost`. Este script é
# o caminho que funcionou em 08/10: a imagem é construída no servidor de build
# (sem cliente nenhum, então o `npm ci` não disputa memória com site no ar),
# atravessa por esta máquina e entra no servidor de produção pelo mesmo
# mecanismo do `avila-deploy`: troca de um serviço só, checagem de saúde e
# volta automática para a imagem anterior.
#
# Uso:  scripts/deploy-manual.sh <web|backend|transcricao> [commit]
#
# O commit precisa estar no GitHub (padrão: origin/main). Nada do diretório
# local entra na imagem: o build parte de um clone limpo, sem `.env`.
set -euo pipefail

BUILD_HOST="${BUILD_HOST:-apps-noclient}"
PROD_HOST="${PROD_HOST:-applications}"
REPO_URL="https://github.com/avilaops/saudepet.app.br.git"

servico="${1:-}"
case "$servico" in
  web)         aplicacao=saudepet.app.br;      contexto=.;                   alvo=web ;;
  backend)     aplicacao=saudepet-backend;     contexto=.;                   alvo=backend ;;
  transcricao) aplicacao=saudepet-transcricao; contexto=transcricao-service; alvo= ;;
  *) echo "Uso: $0 <web|backend|transcricao> [commit]" >&2; exit 2 ;;
esac

git fetch -q origin
sha="$(git rev-parse --verify "${2:-origin/main}^{commit}")"
git branch -r --contains "$sha" | grep -q . || { echo "O commit $sha não está no GitHub." >&2; exit 1; }
imagem="saudepet-${servico}-manual:sha-${sha}"

echo "═══ Build de $servico em $BUILD_HOST ($sha) ═══"
ssh -o BatchMode=yes "$BUILD_HOST" bash -s -- "$REPO_URL" "$sha" "$imagem" "$contexto" "$alvo" <<'BUILD'
set -euo pipefail
repo=$1 sha=$2 imagem=$3 contexto=$4 alvo=$5
dir=/opt/build/saudepet.app.br
mkdir -p /opt/build
[ -d "$dir/.git" ] || git clone -q "$repo" "$dir"
cd "$dir"
git fetch -q origin
git checkout -q --detach "$sha"
args=(--build-arg "GIT_SHA=$sha"
  --label "org.opencontainers.image.source=${repo%.git}"
  --label "org.opencontainers.image.revision=$sha"
  -t "$imagem")
[ -z "$alvo" ] || args+=(--target "$alvo")
docker build -q "${args[@]}" -f "$contexto/Dockerfile" "$contexto"
BUILD

echo "═══ Enviando a imagem para $PROD_HOST ═══"
ssh -o BatchMode=yes "$BUILD_HOST" "docker save '$imagem' | gzip -1" \
  | ssh -o BatchMode=yes "$PROD_HOST" "gunzip | docker load"

echo "═══ Trocando $servico em produção ═══"
ssh -o BatchMode=yes "$PROD_HOST" bash -s -- "$aplicacao" "$imagem" <<'TROCA'
set -euo pipefail
umask 077
aplicacao=$1 imagem=$2
# Mesma configuração que o `avila-deploy` lê; instalada pelo administrador.
# shellcheck source=/dev/null
source "/etc/avilaops/deploy/$aplicacao.conf"
estado="/var/lib/avilaops/deploy/$aplicacao"
override="$estado/image.yml"
exec 9>"$estado/lock"
flock -w 600 9 || { echo 'Outro deploy continua em andamento.' >&2; exit 1; }

compose=(docker compose --project-directory "$PROJECT_DIR" -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE")
[ -z "${RUNTIME_OVERLAY:-}" ] || compose+=(-f "$RUNTIME_OVERLAY")
compose+=(-f "$override")
anterior="$(awk '/image:/{print $2}' "$override")"

gravar() { printf 'services:\n  %s:\n    image: %s\n' "$SERVICE" "$1" > "$override.next"; mv "$override.next" "$override"; }
subir()  { "${compose[@]}" up -d --no-deps --no-build --pull never "$SERVICE"; }
saudavel() {
  local i
  for i in $(seq 1 30); do
    if [ "${USE_CONTAINER_HEALTH:-false}" = true ]; then
      [ "$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$CONTAINER" 2>/dev/null)" = healthy ] && return 0
    else
      [[ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$HEALTH_URL" || true)" =~ ^2 ]] && return 0
    fi
    sleep 3
  done
  return 1
}

# Migração antes da troca, com a imagem nova, igual ao `avila-deploy`: se
# falhar, o serviço em produção não é tocado.
if [ -n "${MIGRATE_ENV_FILE:-}" ]; then
  var="${MIGRATE_DB_VAR:-DATABASE_URL}"
  url="$(grep -m1 "^${var}=" "$PROJECT_DIR/$MIGRATE_ENV_FILE" | cut -d= -f2-)"
  [ -n "$url" ] || { echo 'Variável de banco ausente.' >&2; exit 1; }
  url="${url//host.docker.internal/127.0.0.1}"
  tmp="$(mktemp -d)"
  cid="$(docker create "$imagem")"
  docker cp "$cid:${MIGRATE_SCHEMA_DIR:-/app/prisma}" "$tmp/prisma" >/dev/null
  docker rm "$cid" >/dev/null
  echo "==> aplicando migrações de $aplicacao"
  if ! env "${var}=${url}" npx -y "prisma@${MIGRATE_PRISMA_MAJOR:-6}" migrate deploy --schema "$tmp/prisma/schema.prisma"; then
    rm -rf "$tmp"
    echo 'Migração falhou; nada foi trocado.' >&2
    exit 1
  fi
  rm -rf "$tmp"
fi

echo "anterior: $anterior"
gravar "$imagem"
"${compose[@]}" config --quiet
subir
if ! saudavel; then
  echo "Falha na checagem de saúde. Restaurando $anterior." >&2
  gravar "$anterior"
  subir
  saudavel && echo 'Imagem anterior restaurada.' >&2 || echo 'RESTAURAÇÃO FALHOU: intervenção necessária.' >&2
  exit 1
fi
[ "$(docker inspect --format '{{.Image}}' "$CONTAINER")" = "$(docker image inspect --format '{{.Id}}' "$imagem")" ] \
  || { echo 'O contêiner não executa a imagem pedida.' >&2; exit 1; }

# Só as imagens manuais deste serviço que não são a nova nem a anterior: o
# disco de produção é dividido com outros projetos e já chegou a 97%.
docker images --format '{{.Repository}}:{{.Tag}}' "${imagem%%:*}" \
  | grep -vxF -e "$imagem" -e "$anterior" | xargs -r docker image rm >/dev/null || true
echo "Deploy concluído: $aplicacao $imagem"
TROCA

echo "═══ Conferindo pelo nginx ═══"
for rota in / /api/health; do
  printf '  %s -> %s\n' "$rota" "$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "https://saudepet.app.br$rota")"
done
