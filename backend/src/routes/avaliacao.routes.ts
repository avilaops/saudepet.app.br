import { Router } from 'express';
const router = Router();
const avaliacaoController = require('../controllers/avaliacao.controller');
const { authMiddleware, isTutor } = require('../middleware/auth.middleware');
const { tenantContext, requireActiveTenant } = require('../middleware/tenant.middleware');
const validate = require('../middleware/validate.middleware');
const { createAvaliacaoSchema } = require('../schemas/avaliacao.schema');

// Criar avaliação (apenas tutor)
router.use(authMiddleware, tenantContext, requireActiveTenant);
router.post('/', isTutor, validate(createAvaliacaoSchema), avaliacaoController.criar);

// Listar avaliações (via query param veterinario_id ou rota /veterinario/:id)
router.get('/', avaliacaoController.listarPorVeterinario);

// Listar avaliações de um veterinário (via path param)
router.get('/veterinario/:veterinarioId', avaliacaoController.listarPorVeterinario);

// Obter avaliação por ID
router.get('/:id', avaliacaoController.buscarPorId);

// `export =` compila para `module.exports = router` exato. O server.js faz
// `require()` e entrega o valor direto ao Express: com `export default`, o
// require devolveria o módulo e o Express receberia objeto sem `handle`.
export = router;
