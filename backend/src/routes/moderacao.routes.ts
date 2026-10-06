import { Router } from 'express';
const router = Router();
const moderacaoController = require('../controllers/moderacao.controller');
const { authMiddleware, isAdmin } = require('../middleware/auth.middleware');
const { tenantContext, requireActiveTenant } = require('../middleware/tenant.middleware');
const validate = require('../middleware/validate.middleware');
const {
  reportarViolacaoSchema,
  analisarViolacaoSchema,
  aplicarPunicaoSchema,
  revogarPunicaoSchema,
  consultarViolacoesSchema,
  consultarPunicoesSchema
} = require('../schemas/moderacao.schema');

router.use(authMiddleware, tenantContext, requireActiveTenant);

// ═══════════════════════════════════════════════════════
// ROTAS ADMINISTRATIVAS (Admin only)
// ═══════════════════════════════════════════════════════

// Listar violações
router.get(
  '/violacoes',
  authMiddleware,
  isAdmin,
  validate(consultarViolacoesSchema, 'query'),
  moderacaoController.listarViolacoes
);

// Analisar violação
router.put(
  '/violacoes/:id/analisar',
  authMiddleware,
  isAdmin,
  validate(analisarViolacaoSchema),
  moderacaoController.analisarViolacao
);

// Aplicar punição
router.post(
  '/punicoes',
  authMiddleware,
  isAdmin,
  validate(aplicarPunicaoSchema),
  moderacaoController.aplicarPunicao
);

// Listar punições
router.get(
  '/punicoes',
  authMiddleware,
  isAdmin,
  validate(consultarPunicoesSchema, 'query'),
  moderacaoController.listarPunicoes
);

// Revogar punição
router.put(
  '/punicoes/:id/revogar',
  authMiddleware,
  isAdmin,
  validate(revogarPunicaoSchema),
  moderacaoController.revogarPunicao
);

// Histórico de usuário
router.get(
  '/usuarios/:id',
  authMiddleware,
  isAdmin,
  moderacaoController.historicoUsuario
);

// Estatísticas
router.get(
  '/estatisticas',
  authMiddleware,
  isAdmin,
  moderacaoController.estatisticas
);

// ═══════════════════════════════════════════════════════
// ROTAS PÚBLICAS/AUTENTICADAS
// ═══════════════════════════════════════════════════════

// Reportar violação
router.post(
  '/reportar',
  authMiddleware,
  validate(reportarViolacaoSchema),
  moderacaoController.reportarViolacao
);

// Meu status de moderação
router.get(
  '/meu-status',
  authMiddleware,
  moderacaoController.meuStatus
);

// `export =` compila para `module.exports = router` exato. O server.js faz
// `require()` e entrega o valor direto ao Express: com `export default`, o
// require devolveria o módulo e o Express receberia objeto sem `handle`.
export = router;
