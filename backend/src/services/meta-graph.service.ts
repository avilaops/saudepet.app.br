import crypto from 'crypto';
import axios from 'axios';

const GRAPH_API_VERSION = process.env.META_GRAPH_API_VERSION || 'v21.0';
const GRAPH_BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

type Parametros = Record<string, string | number | boolean | undefined>;

/**
 * Cliente fino pra Graph API da Meta (WhatsApp, Lead Ads, Conversions API, Threads
 * ficam em endpoints próprios mas usam o mesmo padrão de autenticação/erro).
 */
async function graphGet<T = any>(path: string, accessToken: string, params: Parametros = {}): Promise<T> {
  const url = `${GRAPH_BASE_URL}/${path}`;
  const { data } = await axios.get<T>(url, { params: { ...params, access_token: accessToken } });
  return data;
}

async function graphPost<T = any>(path: string, accessToken: string, body: unknown = {}): Promise<T> {
  const url = `${GRAPH_BASE_URL}/${path}`;
  const { data } = await axios.post<T>(url, body, {
    params: { access_token: accessToken },
    headers: { 'Content-Type': 'application/json' }
  });
  return data;
}

/**
 * Verifica a assinatura X-Hub-Signature-256 que a Meta envia em todo webhook,
 * calculada com HMAC-SHA256 do corpo cru usando o App Secret.
 */
function verifyWebhookSignature(rawBody: string | Buffer, signatureHeader: string | undefined, appSecret: string | undefined): boolean {
  if (!signatureHeader || !appSecret) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const provided = Buffer.from(signatureHeader);
  const expectedBuf = Buffer.from(expected);
  if (provided.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(provided, expectedBuf);
}

function hashSha256(value: unknown): string | undefined {
  if (!value) return undefined;
  return crypto.createHash('sha256').update(String(value).trim().toLowerCase()).digest('hex');
}

export { graphGet, graphPost, verifyWebhookSignature, hashSha256, GRAPH_API_VERSION };
