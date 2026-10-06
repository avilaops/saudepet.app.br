import { Router } from 'express';
const router = Router();
const userController = require('../controllers/user.controller');
const { authMiddleware } = require('../middleware/auth.middleware');
const { tenantContext, requireActiveTenant } = require('../middleware/tenant.middleware');

// Buscar tutor por ID (para mensagens/perfil)
router.get('/:id', authMiddleware, tenantContext, requireActiveTenant, userController.buscarPorId);

// `export =` compila para `module.exports = router` exato. O server.js faz
// `require()` e entrega o valor direto ao Express: com `export default`, o
// require devolveria o módulo e o Express receberia objeto sem `handle`.
export = router;
