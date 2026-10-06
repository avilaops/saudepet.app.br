import { Router } from 'express';
const controller = require('../controllers/meta-admin.controller');
const { authMiddleware, isAdmin } = require('../middleware/auth.middleware');
const { tenantContext, requireActiveTenant } = require('../middleware/tenant.middleware');

const router = Router();
router.use(authMiddleware, isAdmin, tenantContext, requireActiveTenant);

router.get('/status', controller.integrationsStatus);
router.get('/whatsapp/mensagens', controller.listWhatsappMessages);
router.post('/whatsapp/enviar', controller.sendWhatsappMessage);

// `export =` compila para `module.exports = router` exato. O server.js faz
// `require()` e entrega o valor direto ao Express: com `export default`, o
// require devolveria o módulo e o Express receberia objeto sem `handle`.
export = router;
