import { Router } from 'express';
const router = Router();
const adminVeterinarioController = require('../controllers/admin-veterinario.controller');
const { authMiddleware, isAdmin } = require('../middleware/auth.middleware');
const { tenantContext, requireActiveTenant } = require('../middleware/tenant.middleware');

router.use(authMiddleware, tenantContext, requireActiveTenant, isAdmin);

// Listagem e Fila de Moderação
router.get('/', adminVeterinarioController.listarFilaAnalise);
router.get('/:id', adminVeterinarioController.detalhesComDocumentos);

// Ações Administrativas de Credenciamento
router.post('/:id/aprovar', adminVeterinarioController.aprovarCredenciamento);
router.post('/:id/rejeitar', adminVeterinarioController.rejeitarCredenciamento);
router.post('/:id/solicitar-reenvio', adminVeterinarioController.solicitarReenvio);
router.post('/:id/suspender', adminVeterinarioController.suspenderVeterinario);
router.post('/:id/reativar', adminVeterinarioController.reativarVeterinario);

// `export =` compila para `module.exports = router` exato. O server.js faz
// `require()` e entrega o valor direto ao Express: com `export default`, o
// require devolveria o módulo e o Express receberia objeto sem `handle`.
export = router;
