import { Router } from 'express';
const router = Router();
const enderecoController = require('../controllers/endereco.controller');
const { authMiddleware, isTutor } = require('../middleware/auth.middleware');
const { tenantContext, requireActiveTenant } = require('../middleware/tenant.middleware');

router.use(authMiddleware, tenantContext, requireActiveTenant, isTutor);

router.get('/', enderecoController.listar);
router.post('/', enderecoController.criar);
router.put('/:id', enderecoController.atualizar);
router.delete('/:id', enderecoController.remover);

// `export =` compila para `module.exports = router` exato. O server.js faz
// `require()` e entrega o valor direto ao Express: com `export default`, o
// require devolveria o módulo e o Express receberia objeto sem `handle`.
export = router;
