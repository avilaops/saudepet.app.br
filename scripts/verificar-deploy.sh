#!/usr/bin/env bash
#
# O deploy subiu mesmo?
#
# Em 26/08/2026 um deploy "bem-sucedido" (exit 0, container healthy, health 200)
# subiu com o `dist` de uma build ANTERIOR. A causa foi cache de build corrompido
# no Docker , `failed to load ref: ... not found` , somada a duas builds
# disparadas com sobreposição, onde a última a marcar `:latest` foi a mais
# velha. Nada disso aparece no `docker ps`: o container fica saudável executando
# código de outro commit.
#
# Este script pergunta ao CONTÊINER o que ele está executando, em vez de confiar
# no que o servidor tem no disco.
#
# Uso:  ./scripts/verificar-deploy.sh
set -euo pipefail

CONTAINER="${CONTAINER:-saudepet-backend-1}"
REPO="${REPO:-/opt/saudepet}"

falhas=0
aviso() { echo "  ✗ $*"; falhas=$((falhas + 1)); }
ok()    { echo "  ✓ $*"; }

echo "═══ Fonte no servidor ═══"
cd "$REPO"
head_local="$(git rev-parse --short HEAD)"
echo "  HEAD: $head_local , $(git log -1 --pretty=%s)"

sujo="$(git status --porcelain -- backend/src | grep -v '^??' || true)"
if [ -n "$sujo" ]; then
  aviso "backend/src tem alteração não commitada , o que está no ar não é o que está no git:"
  echo "$sujo" | sed 's/^/      /'
else
  ok "backend/src limpo em relação ao commit"
fi

echo
echo "═══ O que o contêiner executa ═══"

# Todo arquivo TypeScript da fonte precisa ter, no `dist` do contêiner, um
# `.js.map` apontando para o `.ts`. Se apontar para `.js`, aquele arquivo veio
# de uma build feita ANTES da migração , é o sintoma exato do deploy velho.
mapfile -t fontes_ts < <(find backend/src -name '*.ts' ! -name '*.d.ts' | sed 's|^backend/src/||; s|\.ts$||')

if ! docker exec "$CONTAINER" test -d dist 2>/dev/null; then
  # Sem esta guarda, um contêiner reiniciando faz TODO arquivo parecer ausente
  # e o relatório acusa "55 de 55 sem map" , que é ruído, não diagnóstico.
  aviso "não consegui ler o dist do contêiner $CONTAINER (reiniciando?). Rode de novo em alguns segundos."
elif [ "${#fontes_ts[@]}" -eq 0 ]; then
  ok "nenhum arquivo .ts na fonte (nada a conferir)"
else
  velhos=0
  ausentes=0
  for rel in "${fontes_ts[@]}"; do
    # O `$` do segundo grep ancorava no fim da LINHA, e a linha termina com a
    # aspa de fechamento , nenhum arquivo casava e o relatório acusava "55 de 55
    # sem map" num deploy perfeitamente bom. Verificador que dá falso positivo
    # é pior do que verificador nenhum: ensina a ignorá-lo.
    origem="$(docker exec "$CONTAINER" sh -c "head -c 400 dist/${rel}.js.map 2>/dev/null" \
      | grep -oE '"sources":\["[^"]+"' | grep -oE '[^"/]+\.(ts|js)"' | tr -d '\"' || true)"

    if [ -z "$origem" ]; then
      ausentes=$((ausentes + 1))
      [ "$ausentes" -le 5 ] && echo "      sem map no dist: $rel"
    elif [[ "$origem" == *.js ]]; then
      velhos=$((velhos + 1))
      [ "$velhos" -le 5 ] && echo "      compilado do .js ANTIGO: $rel"
    fi
  done

  total="${#fontes_ts[@]}"
  if [ "$velhos" -gt 0 ]; then
    aviso "$velhos de $total arquivos .ts estão rodando a versão .js anterior , a imagem é de uma build velha"
    echo "      Conserto: docker builder prune -f && docker compose build --no-cache backend && docker compose up -d backend"
  elif [ "$ausentes" -gt 0 ]; then
    aviso "$ausentes de $total arquivos .ts não têm map no dist"
  else
    ok "os $total arquivos .ts do commit estão compilados de .ts no contêiner"
  fi
fi

echo
echo "═══ Saúde ═══"
estado="$(docker inspect -f '{{.State.Health.Status}}' "$CONTAINER" 2>/dev/null || echo desconhecido)"
[ "$estado" = "healthy" ] && ok "container $estado" || aviso "container $estado"

http="$(curl -s -o /dev/null -w '%{http_code}' https://saudepet.app.br/api/health || echo 000)"
[ "$http" = "200" ] && ok "/api/health $http" || aviso "/api/health $http"

echo
if [ "$falhas" -eq 0 ]; then
  echo "✅ O que está no ar é o commit $head_local."
  exit 0
fi

echo "❌ $falhas verificação(ões) falharam , NÃO trate este deploy como concluído."
exit 1
