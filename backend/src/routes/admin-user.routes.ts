import { Router } from 'express';
const router = Router();
const adminUserController = require('../controllers/admin-user.controller');
const { authMiddleware, isAdmin } = require('../middleware/auth.middleware');
const { tenantContext, requireActiveTenant } = require('../middleware/tenant.middleware');

router.use(authMiddleware, tenantContext, requireActiveTenant, isAdmin);

router.get('/', adminUserController.listarUsuarios);
router.post('/:id/revoke-sessions', adminUserController.revogarSessoes);
router.post('/:id/role', adminUserController.alterarRole);

// `export =` compila para `module.exports = router` exato. O server.js faz
// `require()` e entrega o valor direto ao Express: com `export default`, o
// require devolveria o módulo e o Express receberia objeto sem `handle`.
export = router;
