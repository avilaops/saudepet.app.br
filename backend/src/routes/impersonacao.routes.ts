import { Router } from 'express';
const router = Router();
const impersonacaoController = require('../controllers/impersonacao.controller');
const { authMiddleware, isAdmin } = require('../middleware/auth.middleware');
const { tenantContext, requireActiveTenant } = require('../middleware/tenant.middleware');

// Sair da visita é chamado PELA sessão visitada, que é do tutor/veterinário —
// por isso fica antes do `isAdmin`.
router.post('/sair', authMiddleware, tenantContext, impersonacaoController.sair);

router.use(authMiddleware, tenantContext, requireActiveTenant, isAdmin);

router.get('/usuarios', impersonacaoController.listarAlvos);
router.post('/:usuarioId', impersonacaoController.entrar);

// `export =` compila para `module.exports = router` exato. O server.js faz
// `require()` e entrega o valor direto ao Express: com `export default`, o
// require devolveria o módulo e o Express receberia objeto sem `handle`.
export = router;
