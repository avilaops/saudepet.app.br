import { Router } from 'express';
const router = Router();
const configController = require('../controllers/config.controller');
const { authMiddleware, requireRoles } = require('../middleware/auth.middleware');
const { tenantContext, requireActiveTenant } = require('../middleware/tenant.middleware');

// Todas as rotas de configuração requerem autenticação
router.use(authMiddleware, requireRoles('super_admin'), tenantContext, requireActiveTenant);

// Rotas SMTP
router.get('/smtp', configController.obterConfigSMTP);
router.post('/smtp/testar', configController.testarSMTP);
router.post('/smtp/email-teste', configController.enviarEmailTeste);

// `export =` compila para `module.exports = router` exato. O server.js faz
// `require()` e entrega o valor direto ao Express: com `export default`, o
// require devolveria o módulo e o Express receberia objeto sem `handle`.
export = router;
