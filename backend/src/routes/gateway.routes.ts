import { Router } from 'express';
const router = Router();
const gatewayController = require('../controllers/gateway.controller');
const { authMiddleware, isAdmin, requireRoles } = require('../middleware/auth.middleware');
const { tenantContext, requireActiveTenant } = require('../middleware/tenant.middleware');

router.use(authMiddleware, isAdmin, tenantContext, requireActiveTenant);

// ═══════════════════════════════════════════════════════
// TODAS AS ROTAS REQUEREM ADMIN
// ═══════════════════════════════════════════════════════

// Configurar gateway
router.post(
  '/configure',
  gatewayController.configurar
);

// Listar gateways
router.get(
  '/',
  gatewayController.listar
);

// Testar conexão
router.post(
  '/:gateway/test',
  gatewayController.testar
);

// Ativar/desativar
router.patch(
  '/:id/toggle',
  gatewayController.toggleStatus
);

// Deletar
router.delete(
  '/:id',
  gatewayController.deletar
);

// Gerar chave de criptografia (apenas desenvolvimento)
router.get(
  '/generate-key',
  requireRoles('super_admin'),
  gatewayController.gerarChave
);

// `export =` compila para `module.exports = router` exato. O server.js faz
// `require()` e entrega o valor direto ao Express: com `export default`, o
// require devolveria o módulo e o Express receberia objeto sem `handle`.
export = router;
