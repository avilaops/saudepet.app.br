import crypto from 'crypto';

const BOT_PATTERN = /bot|crawler|spider|slurp|bingpreview|facebookexternalhit|whatsapp|headless/i;

function textOrNull(value: unknown, max = 500): string | null {
  if (typeof value !== 'string') return null;
  const clean = value.trim();
  return clean ? clean.slice(0, max) : null;
}

function detectClient(userAgent = '') {
  const deviceCategory = /tablet|ipad/i.test(userAgent)
    ? 'tablet'
    : /mobile|android|iphone/i.test(userAgent) ? 'mobile' : 'desktop';
  const browserFamily = /edg/i.test(userAgent) ? 'Edge'
    : /firefox/i.test(userAgent) ? 'Firefox'
      : /safari/i.test(userAgent) && !/chrome|chromium/i.test(userAgent) ? 'Safari'
        : /chrome|chromium/i.test(userAgent) ? 'Chrome' : 'Other';
  return { deviceCategory, browserFamily, isBot: BOT_PATTERN.test(userAgent) };
}

/**
 * Impressão do IP para a analítica, sem guardar o IP.
 *
 * Só o tipo do que é usado: cabeçalhos e o endereço do socket. Pedir o
 * `Request` inteiro do Express aqui obrigaria quem chama a ter um — e este
 * ajudante serve para qualquer coisa com essa forma.
 */
function hashRequestIp(req: {
  headers: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
}): string | null {
  const salt = process.env.ANALYTICS_HASH_SALT;
  if (!salt) return null;
  const forwarded = req.headers['x-forwarded-for'];
  const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0]) || req.socket?.remoteAddress;
  return ip ? crypto.createHmac('sha256', salt).update(ip.trim()).digest('hex') : null;
}

export {
  textOrNull,
  detectClient,
  hashRequestIp
};
