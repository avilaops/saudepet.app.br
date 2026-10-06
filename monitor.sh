#!/bin/bash
# Monitor de disponibilidade do Saúde Pet — roda no cron do servidor a cada
# 5 minutos. Até 20/08/2026 não havia nada avisando se a produção caísse: o
# primeiro a descobrir seria um tutor tentando chamar um veterinário.
#
# Alerta por e-mail usando o SMTP já configurado no backend (Porkbun), e só
# quando o estado MUDA (ok → falha e falha → ok). Sem isso, uma queda de duas
# horas viraria 24 e-mails idênticos e ninguém leria o próximo.
#
#   */5 * * * * /bin/bash /opt/saudepet/monitor.sh
set -uo pipefail

# Parametrizável para dar para exercitar o caminho de alerta sem derrubar nada.
BASE_URL="${MONITOR_BASE_URL:-https://saudepet.app.br}"
ALERTA_PARA="${MONITOR_EMAIL:-nicolas@avilaops.com}"
ESTADO_DIR=/opt/backups
ESTADO="$ESTADO_DIR/saudepet-monitor.state"
LOG="$ESTADO_DIR/saudepet-monitor.log"
BACKUP_DIR="$ESTADO_DIR/saudepet-db"
CONTAINERS=("saudepet-backend-1" "saudepet-web-1")

# Backup mais velho que isto significa que o cron das 3h parou de rodar.
BACKUP_MAX_HORAS=30
# Disco acima disto e o Postgres começa a recusar escrita antes do esperado.
DISCO_MAX_PCT=90

mkdir -p "$ESTADO_DIR"
problemas=()

# ── Aplicação de pé, do ponto de vista de quem usa ────────────────────────────
codigo_health=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$BASE_URL/api/health" || echo "000")
[ "$codigo_health" != "200" ] && problemas+=("API /api/health respondeu $codigo_health")

codigo_home=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$BASE_URL/" || echo "000")
[ "$codigo_home" != "200" ] && problemas+=("Site respondeu $codigo_home na home")

# ── Containers ────────────────────────────────────────────────────────────────
for nome in "${CONTAINERS[@]}"; do
  estado=$(docker inspect -f '{{.State.Status}}' "$nome" 2>/dev/null || echo "ausente")
  if [ "$estado" != "running" ]; then
    problemas+=("Container $nome está '$estado'")
    continue
  fi
  saude=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}sem-healthcheck{{end}}' "$nome" 2>/dev/null || echo "desconhecido")
  [ "$saude" = "unhealthy" ] && problemas+=("Container $nome unhealthy")
done

# ── Backup do banco em dia ────────────────────────────────────────────────────
ultimo_backup=$(find "$BACKUP_DIR" -name 'saudepet-*.dump' -mmin -$((BACKUP_MAX_HORAS * 60)) 2>/dev/null | head -1)
if [ -z "$ultimo_backup" ]; then
  problemas+=("Nenhum backup do banco nas últimas ${BACKUP_MAX_HORAS}h em $BACKUP_DIR")
fi

# ── Disco ─────────────────────────────────────────────────────────────────────
uso_disco=$(df --output=pcent / | tail -1 | tr -dc '0-9')
if [ -n "$uso_disco" ] && [ "$uso_disco" -ge "$DISCO_MAX_PCT" ]; then
  problemas+=("Disco em ${uso_disco}% (limite ${DISCO_MAX_PCT}%)")
fi

# ── Decide e alerta só na virada ──────────────────────────────────────────────
estado_anterior=$(cat "$ESTADO" 2>/dev/null || echo "ok")
agora=$(date -Is)

# O envio reaproveita o SMTP do backend (Porkbun) em vez de repetir credencial
# aqui — o corpo viaja por variável de ambiente para não escapar aspas na mão.
if [ ${#problemas[@]} -gt 0 ]; then
  detalhe=$(printf '  - %s\n' "${problemas[@]}")
  echo "$agora FALHA${detalhe//$'\n'/ |}" >> "$LOG"
  if [ "$estado_anterior" != "falha" ]; then
    ALVO="$ALERTA_PARA" \
    ASSUNTO="🔴 Saúde Pet fora do ar ou degradado" \
    CORPO="Verificação de $agora encontrou:

$detalhe
Servidor: $(hostname)
Uso de disco: ${uso_disco}%

Este alerta só se repete quando o estado mudar." \
      docker exec -e ALVO -e ASSUNTO -e CORPO saudepet-backend-1 node -e "
        const svc = require('/app/src/services/email.service');
        svc.sendMail({ to: process.env.ALVO, subject: process.env.ASSUNTO, html: '<pre style=\"font:14px/1.5 monospace\">' + process.env.CORPO + '</pre>' })
          .then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1); });
      " >> "$LOG" 2>&1 && echo "$agora alerta de falha enviado" >> "$LOG"
  fi
  echo "falha" > "$ESTADO"
  exit 1
fi

echo "$agora OK (health=$codigo_health home=$codigo_home disco=${uso_disco}%)" >> "$LOG"
if [ "$estado_anterior" = "falha" ]; then
  ALVO="$ALERTA_PARA" \
  ASSUNTO="🟢 Saúde Pet normalizado" \
  CORPO="Tudo respondendo de novo em $agora.

API e site em 200, containers de pé, backup em dia, disco em ${uso_disco}%." \
    docker exec -e ALVO -e ASSUNTO -e CORPO saudepet-backend-1 node -e "
      const svc = require('/app/src/services/email.service');
      svc.sendMail({ to: process.env.ALVO, subject: process.env.ASSUNTO, html: '<pre style=\"font:14px/1.5 monospace\">' + process.env.CORPO + '</pre>' })
        .then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1); });
    " >> "$LOG" 2>&1 && echo "$agora alerta de normalização enviado" >> "$LOG"
fi
echo "ok" > "$ESTADO"

# Log não pode crescer para sempre num disco de 38 GB.
tail -n 2000 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
