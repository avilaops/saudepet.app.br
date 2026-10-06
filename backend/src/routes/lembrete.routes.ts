import { Router } from 'express';
const router = Router();
const lembreteController = require('../controllers/lembrete.controller');
const { authMiddleware, isTutor } = require('../middleware/auth.middleware');
const { tenantContext, requireActiveTenant } = require('../middleware/tenant.middleware');
const validate = require('../middleware/validate.middleware');
const { createLembreteSchema, concluirLembreteSchema } = require('../schemas/lembrete.schema');

// O lembrete é do tutor: quem escreve pelo lado clínico é o fechamento do
// atendimento, não uma rota do veterinário.
router.use(authMiddleware, isTutor, tenantContext, requireActiveTenant);

router.get('/', lembreteController.listar);
router.post('/', validate(createLembreteSchema), lembreteController.criar);
router.put('/:id/concluir', validate(concluirLembreteSchema), lembreteController.concluir);

// `export =` compila para `module.exports = router` exato. O server.js faz
// `require()` e entrega o valor direto ao Express: com `export default`, o
// require devolveria o módulo e o Express receberia objeto sem `handle`.
export = router;
