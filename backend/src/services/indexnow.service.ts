/**
 * Avisa buscadores que uma página mudou, em vez de esperar o rastreamento.
 *
 * IndexNow é o protocolo que Bing, Yandex e outros aceitam: em vez de torcer
 * para o robô voltar, o site empurra a lista de URLs alteradas. Para um blog
 * que publica com frequência, é a diferença entre aparecer em horas e aparecer
 * em semanas.
 *
 * Sem `INDEXNOW_ENABLED=true` e `INDEXNOW_KEY`, a parte de indexação fica
 * inerte e o resto continua — o webhook do n8n é independente.
 */

const DEFAULT_ENDPOINT = 'https://api.indexnow.org/indexnow';

/** Timeout curto: isto roda depois de publicar, e não pode segurar a resposta. */
const TIMEOUT_MS = 8_000;

/** Teto do protocolo por requisição. */
const MAXIMO_DE_URLS = 10_000;

function siteBase(): string {
  return (process.env.PUBLIC_SITE_URL || 'https://saudepet.app.br').replace(/\/$/, '');
}

/**
 * Absolutiza, remove repetidas e DESCARTA o que não é do próprio domínio.
 *
 * A checagem de host não é zelo: o protocolo exige que a chave prove posse do
 * domínio, então mandar URL de terceiro faz o buscador recusar o lote INTEIRO.
 * Uma URL errada derrubaria a indexação de todas as outras.
 */
export function normalizeUrls(urls: string[] = []): string[] {
  const base = siteBase();
  const host = new URL(base).host;

  const absolutas = urls
    .map((valor) => {
      try {
        return new URL(valor, base).toString();
      } catch {
        return null;
      }
    })
    .filter((valor): valor is string => Boolean(valor) && new URL(valor as string).host === host);

  return [...new Set(absolutas)].slice(0, MAXIMO_DE_URLS);
}

export function isConfigured(): boolean {
  return process.env.INDEXNOW_ENABLED === 'true' && Boolean(process.env.INDEXNOW_KEY);
}

/** @returns o status HTTP. 202 é sucesso aqui — "aceito, vou processar". */
async function postJson(url: string, body: unknown): Promise<number> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });

  if (!response.ok && response.status !== 202) {
    throw new Error(`Serviço de indexação respondeu com HTTP ${response.status}`);
  }

  return response.status;
}

export type ResultadoDaNotificacao = {
  skipped?: boolean;
  reason?: string;
  indexNowStatus?: number;
  indexNowSkipped?: boolean;
  automationStatus?: number;
};

export async function notifyUrls(
  urls: string[],
  event = 'content_updated'
): Promise<ResultadoDaNotificacao> {
  const urlList = normalizeUrls(urls);
  if (!urlList.length) return { skipped: true, reason: 'no_urls' };

  const resultado: ResultadoDaNotificacao = {};

  if (isConfigured()) {
    const base = siteBase();
    const key = process.env.INDEXNOW_KEY as string;

    resultado.indexNowStatus = await postJson(process.env.INDEXNOW_ENDPOINT || DEFAULT_ENDPOINT, {
      host: new URL(base).host,
      key,
      // O buscador baixa este arquivo para confirmar que quem avisa é dono do
      // domínio. Sem ele publicado na raiz, o lote é recusado.
      keyLocation: `${base}/${key}.txt`,
      urlList
    });
  } else {
    resultado.indexNowSkipped = true;
  }

  if (process.env.N8N_SEO_WEBHOOK_URL) {
    resultado.automationStatus = await postJson(process.env.N8N_SEO_WEBHOOK_URL, {
      event,
      site: siteBase(),
      urls: urlList,
      occurredAt: new Date().toISOString()
    });
  }

  return resultado;
}

module.exports = { isConfigured, normalizeUrls, notifyUrls };
