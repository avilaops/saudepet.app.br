import { Router } from 'express';
const router = Router();
const adminCidadeController = require('../controllers/admin-cidade.controller');
const { authMiddleware, isAdmin } = require('../middleware/auth.middleware');
const { tenantContext, requireActiveTenant } = require('../middleware/tenant.middleware');

router.use(authMiddleware, tenantContext, requireActiveTenant, isAdmin);

router.get('/', adminCidadeController.listarCidades);
router.post('/', adminCidadeController.salvarCidade);

// `export =` compila para `module.exports = router` exato. O server.js faz
// `require()` e entrega o valor direto ao Express: com `export default`, o
// require devolveria o módulo e o Express receberia objeto sem `handle`.
export = router;
