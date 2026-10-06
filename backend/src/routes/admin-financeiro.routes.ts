import { Router } from 'express';
const router = Router();
const adminFinanceiroController = require('../controllers/admin-financeiro.controller');
const { authMiddleware, isAdmin } = require('../middleware/auth.middleware');
const { tenantContext, requireActiveTenant } = require('../middleware/tenant.middleware');

router.use(authMiddleware, tenantContext, requireActiveTenant, isAdmin);

router.get('/transacoes', adminFinanceiroController.getTransacoes);
router.post('/estorno/:id', adminFinanceiroController.solicitarEstorno);
router.get('/webhooks', adminFinanceiroController.getWebhooksLog);
// Webhook perdido travava o pagamento até alguém abrir o banco: o gateway
// confirmava e a nossa ponta falhava, com o tutor vendo "aguardando pagamento"
// de algo que ele já tinha pago.
router.post('/webhooks/:id/reprocessar', adminFinanceiroController.reprocessarWebhook);

// `export =` compila para `module.exports = router` exato. O server.js faz
// `require()` e entrega o valor direto ao Express: com `export default`, o
// require devolveria o módulo e o Express receberia objeto sem `handle`.
export = router;
