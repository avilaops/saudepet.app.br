import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';

function iguais(a: string, b: string): boolean {
  const esquerda = Buffer.from(a);
  const direita = Buffer.from(b);
  return esquerda.length === direita.length && crypto.timingSafeEqual(esquerda, direita);
}

/** Autenticacao exclusiva para integracoes servidor-servidor do n8n. */
export function automationAuth(req: Request, res: Response, next: NextFunction) {
  const configurada = String(process.env.N8N_AUTOMATION_API_KEY || '').trim();
  const recebida = String(req.headers['x-saude-pet-automation-key'] || '').trim();

  if (!configurada) {
    return res.status(503).json({ error: 'Integracao de automacao nao configurada.' });
  }
  if (!recebida || !iguais(recebida, configurada)) {
    return res.status(401).json({ error: 'Identidade de automacao invalida.' });
  }
  return next();
}

