import prisma from '../config/database';
import { Router } from 'express';
const router = Router();
const { authMiddleware } = require('../middleware/auth.middleware');
const { tenantContext, requireActiveTenant } = require('../middleware/tenant.middleware');
const { asyncHandler } = require('../middleware/error.middleware');
const pushService = require('../services/push.service');
import type { NextFunction, Request, Response } from 'express';

router.use(authMiddleware, tenantContext, requireActiveTenant);

// Chave pública VAPID — o navegador precisa dela para se inscrever.
router.get('/vapid-public-key', (req: Request, res: Response) => {
  if (!pushService.estaConfigurado()) {
    return res.status(503).json({ error: 'Notificações push não configuradas neste ambiente.' });
  }
  return res.json({ publicKey: pushService.chavePublica() });
});

// Registrar a inscrição do navegador atual
/**
 * O servidor conhece este aparelho?
 *
 * A tela perguntava isso ao NAVEGADOR (`pushManager.getSubscription()`), e o
 * navegador responde sim assim que `subscribe()` roda — mesmo que o POST para
 * cá tenha falhado depois. Nesse buraco a pessoa via "notificações ativas" e
 * o servidor não tinha para onde enviar. Quem sabe a verdade é quem envia.
 */
router.get('/inscricao', asyncHandler(async (req: Request, res: Response) => {
  const endpoint = String(req.query.endpoint || '');
  if (!endpoint) return res.json({ inscrito: false });

  const inscricao = await prisma.pushSubscription.findFirst({
    where: { endpoint, usuario_id: req.userId },
    select: { id: true }
  });

  return res.json({ inscrito: Boolean(inscricao) });
}));

router.post('/subscribe', asyncHandler(async (req: Request, res: Response) => {
  if (!pushService.estaConfigurado()) {
    return res.status(503).json({ error: 'Notificações push não configuradas neste ambiente.' });
  }
  await pushService.salvarInscricao({
    tenantId: req.tenantId,
    usuarioId: req.userId,
    subscription: req.body?.subscription,
    userAgent: String(req.get('user-agent') || '').slice(0, 300)
  });
  return res.status(201).json({ ok: true });
}));

// Remover a inscrição do navegador atual (ex.: usuário desligou nas preferências)
router.delete('/subscribe', asyncHandler(async (req: Request, res: Response) => {
  await pushService.removerInscricao({ usuarioId: req.userId, endpoint: req.body?.endpoint });
  return res.json({ ok: true });
}));

// `export =` compila para `module.exports = router` exato. O server.js faz
// `require()` e entrega o valor direto ao Express: com `export default`, o
// require devolveria o módulo e o Express receberia objeto sem `handle`.
export = router;
