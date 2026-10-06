import { Router } from 'express';
const router = Router();
const formularioController = require('../controllers/formulario.controller');
const { authMiddleware, isAdmin } = require('../middleware/auth.middleware');
const { tenantContext, requireActiveTenant } = require('../middleware/tenant.middleware');
const validate = require('../middleware/validate.middleware');
const { uploadAnexoChat } = require('../middleware/upload.middleware');
const {
  createFormularioSchema,
  updateFormularioSchema,
  responderFormularioSchema,
  buscarFormulariosSchema
} = require('../schemas/formulario.schema');

router.use(authMiddleware, tenantContext, requireActiveTenant);

// ═══════════════════════════════════════════════════════
// ROTAS ADMINISTRATIVAS (Admin only)
// ═══════════════════════════════════════════════════════

// Criar formulário
router.post(
  '/',
  authMiddleware,
  isAdmin,
  validate(createFormularioSchema),
  formularioController.criar
);

// Atualizar formulário
router.put(
  '/:id',
  authMiddleware,
  isAdmin,
  validate(updateFormularioSchema),
  formularioController.atualizar
);

// Deletar formulário
router.delete(
  '/:id',
  authMiddleware,
  isAdmin,
  formularioController.deletar
);

// Listar respostas de um formulário
router.get(
  '/:id/respostas',
  authMiddleware,
  isAdmin,
  formularioController.listarRespostas
);

// Estatísticas
router.get(
  '/estatisticas',
  authMiddleware,
  isAdmin,
  formularioController.estatisticas
);

// ═══════════════════════════════════════════════════════
// ROTAS PÚBLICAS/AUTENTICADAS
// ═══════════════════════════════════════════════════════

// Listar formulários
router.get(
  '/',
  authMiddleware,
  validate(buscarFormulariosSchema, 'query'),
  formularioController.listar
);

// Minhas respostas — antes de '/:id', senão o parâmetro captura a rota e
// 'minhas-respostas' vira um id inexistente (404 permanente).
router.get(
  '/minhas-respostas',
  authMiddleware,
  formularioController.minhasRespostas
);

// Respostas de um atendimento, para os participantes (tutor, vet ou admin)
router.get(
  '/respostas/atendimento/:atendimentoId',
  authMiddleware,
  formularioController.respostasDoAtendimento
);

// Buscar por ID
router.get(
  '/:id',
  authMiddleware,
  formularioController.buscarPorId
);

// Anexo de resposta. O construtor do admin oferecia o campo do tipo "Arquivo"
// e a tela de resposta não renderizava nada para ele: o campo existia e não
// coletava coisa nenhuma.
router.post(
  '/:id/anexo',
  authMiddleware,
  tenantContext,
  requireActiveTenant,
  uploadAnexoChat.single('arquivo'),
  formularioController.anexar
);

// Responder formulário
router.post(
  '/:id/responder',
  authMiddleware,
  validate(responderFormularioSchema),
  formularioController.responder
);

// `export =` compila para `module.exports = router` exato. O server.js faz
// `require()` e entrega o valor direto ao Express: com `export default`, o
// require devolveria o módulo e o Express receberia objeto sem `handle`.
export = router;
