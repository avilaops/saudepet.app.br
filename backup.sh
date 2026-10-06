#!/bin/bash
# Backup diário do banco do Saúde Pet — chamado pelo cron do root (0 3 * * *).
# Recriado em 20/08/2026: o cron apontava para este caminho, mas o script
# não existia; o único dump era manual, de 12/08.
#
# O banco roda no PostgreSQL do próprio host (cluster 18/main, porta 5432).
# A URL vem do .env do backend, trocando host.docker.internal (nome que só
# resolve dentro dos containers) por 127.0.0.1.
set -euo pipefail

BACKUP_DIR=/opt/backups/saudepet-db
LOG="$BACKUP_DIR/backup.log"
ENV_FILE=/opt/saudepet/backend/.env
RETENCAO_DIAS=14

mkdir -p "$BACKUP_DIR"

URL=$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"' | sed 's/host\.docker\.internal/127.0.0.1/')
if [ -z "$URL" ]; then
  echo "$(date -Is) FALHOU: DATABASE_URL não encontrada em $ENV_FILE" >> "$LOG"
  exit 1
fi

STAMP=$(date +%Y%m%d-%H%M%S)
OUT="$BACKUP_DIR/saudepet-$STAMP.dump"

if pg_dump --dbname="$URL" -Fc -f "$OUT" 2>>"$LOG"; then
  find "$BACKUP_DIR" -name 'saudepet-*.dump' -mtime +"$RETENCAO_DIAS" -delete
  echo "$(date -Is) OK $OUT ($(du -h "$OUT" | cut -f1))" >> "$LOG"
else
  echo "$(date -Is) FALHOU: pg_dump retornou erro" >> "$LOG"
  rm -f "$OUT"
  exit 1
fi
