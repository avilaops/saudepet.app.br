import prisma from '../config/database';

/**
 * Apaga sessão de visita antiga do analytics próprio.
 *
 * `VisitSession` guarda comportamento de quem navegou no site — dado pessoal
 * pela LGPD, mesmo sem nome. Guardar para sempre não serve a ninguém: métrica
 * de dois anos atrás não decide nada e continua sendo dado de alguém sob nossa
 * guarda. A retenção é o que transforma "coletamos" em "coletamos por um
 * tempo, com propósito".
 */

/** Padrão de meio ano, e a faixa aceita vai de um mês a dois anos. */
const DIAS_PADRAO = 180;
const DIAS_MINIMO = 30;
const DIAS_MAXIMO = 730;

const DIA_EM_MS = 86_400_000;

/**
 * Uma varredura por dia, lembrada em memória.
 *
 * Fica no processo de propósito: é limpeza oportunista, disparada por tráfego
 * que já está acontecendo. Reiniciar o servidor zera a marca e roda de novo no
 * primeiro acesso — o custo disso é um `deleteMany` que não acha nada.
 */
let ultimoDiaExecutado: string | null = null;

/** Dias configurados, presos na faixa aceita. Valor inválido cai no padrão. */
export function diasDeRetencao(): number {
  const configurado = Number.parseInt(process.env.ANALYTICS_RETENTION_DAYS || String(DIAS_PADRAO), 10);
  if (!Number.isFinite(configurado)) return DIAS_PADRAO;
  return Math.min(DIAS_MAXIMO, Math.max(DIAS_MINIMO, configurado));
}

export async function applyAnalyticsRetention(tenantId: string): Promise<void> {
  const hoje = new Date().toISOString().slice(0, 10);
  if (ultimoDiaExecutado === hoje) return;
  ultimoDiaExecutado = hoje;

  const corte = new Date(Date.now() - diasDeRetencao() * DIA_EM_MS);

  await prisma.visitSession.deleteMany({
    where: { tenant_id: tenantId, last_seen_at: { lt: corte } }
  });
}

module.exports = { applyAnalyticsRetention, diasDeRetencao };
