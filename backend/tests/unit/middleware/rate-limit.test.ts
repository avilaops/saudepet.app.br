/**
 * O limite que limitava o uso, não o abuso.
 *
 * Até 26/08/2026 a API inteira aceitava 100 requisições por IP a cada 15
 * minutos. Medido no log de produção: um aparelho em uso normal fez 37 em UM
 * minuto — o orçamento da janela acabava em menos de três, e daí em diante
 * toda tela falhava. O sintoma que apareceu primeiro foi a visita de suporte
 * dizendo "Não foi possível carregar os usuários", que parecia permissão e era
 * 429 com corpo em texto puro, sem o campo que as telas leem.
 *
 * Estes testes prendem as três decisões: quem é contado, quanto cabe e o que a
 * pessoa vê.
 */

import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

const SEGREDO = 'test-secret-key-super-secure';

function appComLimite(limiter: any) {
  const app = express();
  app.set('trust proxy', 1);
  app.use('/api/', limiter);
  app.get('/api/qualquer', (_req, res) => res.json({ ok: true }));
  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  return app;
}

/** Recria o limiter do server.js com uma janela curta, para o teste ser rápido. */
function montarLimiter({ maxAutenticado = 3, maxAnonimo = 2 } = {}) {
  const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

  const usuarioDoToken = (req: any) => {
    const [scheme, token] = String(req.headers.authorization || '').trim().split(/\s+/);
    if (scheme !== 'Bearer' || !token) return null;
    try {
      return jwt.verify(token, SEGREDO) as any ? (jwt.verify(token, SEGREDO) as any).id : null;
    } catch {
      return null;
    }
  };

  return rateLimit({
    windowMs: 60_000,
    max: (req: any) => (usuarioDoToken(req) ? maxAutenticado : maxAnonimo),
    keyGenerator: (req: any) => {
      const id = usuarioDoToken(req);
      return id ? `u:${id}` : `ip:${ipKeyGenerator(req.ip)}`;
    },
    skip: (req: any) => req.path === '/health' || req.path === '/v1/health',
    handler: (_req: any, res: any) =>
      res.status(429).json({ error: 'Muitas requisições em pouco tempo.', retryAfterSegundos: 60 }),
    standardHeaders: true,
    legacyHeaders: false
  });
}

const tokenDe = (id: string) => jwt.sign({ id, tipo_usuario: 'tutor' }, SEGREDO, { expiresIn: '5m' });

describe('Quem é contado', () => {
  it('duas pessoas atrás do MESMO IP têm baldes separados', async () => {
    const app = appComLimite(montarLimiter({ maxAutenticado: 2 }));
    const ana = tokenDe('usuario-ana');
    const bruno = tokenDe('usuario-bruno');

    // Ana gasta o balde dela inteiro.
    await request(app).get('/api/qualquer').set('Authorization', `Bearer ${ana}`);
    await request(app).get('/api/qualquer').set('Authorization', `Bearer ${ana}`);
    const anaEstourou = await request(app).get('/api/qualquer').set('Authorization', `Bearer ${ana}`);
    expect(anaEstourou.status).toBe(429);

    // Bruno, na mesma casa e no mesmo IP, não paga por isso.
    const brunoPrimeira = await request(app).get('/api/qualquer').set('Authorization', `Bearer ${bruno}`);
    expect(brunoPrimeira.status).toBe(200);
  });

  it('token adulterado não vira chave nova — senão bastaria forjar um por requisição', async () => {
    const app = appComLimite(montarLimiter({ maxAnonimo: 2 }));
    const forjado = jwt.sign({ id: 'quem-eu-quiser' }, 'segredo-errado');

    await request(app).get('/api/qualquer').set('Authorization', `Bearer ${forjado}`);
    await request(app).get('/api/qualquer').set('Authorization', `Bearer ${forjado}`);
    // Caiu no balde do IP, como anônimo, e o balde anônimo é pequeno.
    const terceira = await request(app).get('/api/qualquer').set('Authorization', `Bearer ${forjado}`);
    expect(terceira.status).toBe(429);
  });

  it('quem não se identificou tem teto menor que quem tem sessão', async () => {
    const app = appComLimite(montarLimiter({ maxAutenticado: 3, maxAnonimo: 1 }));

    await request(app).get('/api/qualquer');
    const anonimoEstourou = await request(app).get('/api/qualquer');
    expect(anonimoEstourou.status).toBe(429);

    const comSessao = await request(app).get('/api/qualquer').set('Authorization', `Bearer ${tokenDe('u1')}`);
    expect(comSessao.status).toBe(200);
  });
});

describe('O que a pessoa vê ao estourar', () => {
  it('devolve JSON com `error` — o campo que as telas leem', async () => {
    const app = appComLimite(montarLimiter({ maxAnonimo: 1 }));

    await request(app).get('/api/qualquer');
    const estourou = await request(app).get('/api/qualquer');

    expect(estourou.status).toBe(429);
    // Sem isto, o front caía no texto genérico e ninguém descobria o motivo.
    expect(estourou.body.error).toMatch(/muitas requisições/i);
    expect(estourou.body.retryAfterSegundos).toBeGreaterThan(0);
  });
});

describe('O health check não gasta o orçamento de ninguém', () => {
  it('o monitor bate de 5 em 5 minutos e não conta', async () => {
    const app = appComLimite(montarLimiter({ maxAnonimo: 1 }));

    await request(app).get('/api/health');
    await request(app).get('/api/health');
    await request(app).get('/api/health');

    // O orçamento continua intacto para o tráfego de verdade.
    const real = await request(app).get('/api/qualquer');
    expect(real.status).toBe(200);
  });
});
