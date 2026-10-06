import type { Request, Response } from 'express';
import {
  definirPrincipal,
  listarCartoes,
  removerCartao,
  salvarCartao
} from '../services/cartao-salvo.service';

/**
 * A carteira do tutor.
 *
 * O gateway é resolvido por tenant (cada clínica tem a própria credencial), e
 * por isso ele é injetado a cada chamada em vez de importado no topo.
 */

const paymentService = require('../services/payment/payment.service');

type RequestAutenticada = Request & { userId?: string; tenantId?: string };

const gatewayDoTenant = (tenantId: string) => paymentService.getGateway('mercado_pago', tenantId);

export async function listar(req: RequestAutenticada, res: Response) {
  const cartoes = await listarCartoes(String(req.userId), String(req.tenantId));
  return res.json({ cartoes });
}

export async function salvar(req: RequestAutenticada, res: Response) {
  const cartao = await salvarCartao({
    usuarioId: String(req.userId),
    tenantId: String(req.tenantId),
    // Token de uso único, gerado pelo SDK no navegador. O número do cartão não
    // chega até aqui, e é assim que tem que ser.
    cardToken: String(req.body?.card_token || ''),
    apelido: typeof req.body?.apelido === 'string' ? req.body.apelido : undefined,
    gateway: await gatewayDoTenant(String(req.tenantId))
  });

  return res.status(201).json({ cartao });
}

export async function remover(req: RequestAutenticada, res: Response) {
  const resultado = await removerCartao({
    cartaoId: String(req.params.id),
    usuarioId: String(req.userId),
    tenantId: String(req.tenantId),
    gateway: await gatewayDoTenant(String(req.tenantId))
  });

  return res.json(resultado);
}

export async function tornarPrincipal(req: RequestAutenticada, res: Response) {
  const resultado = await definirPrincipal({
    cartaoId: String(req.params.id),
    usuarioId: String(req.userId),
    tenantId: String(req.tenantId)
  });

  return res.json(resultado);
}
