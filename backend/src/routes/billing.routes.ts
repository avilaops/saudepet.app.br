import { Router } from 'express';
const router = Router();
const billingController = require('../controllers/billing.controller');
const { authMiddleware, isAdmin, isVeterinario, requireApprovedVeterinarian } = require('../middleware/auth.middleware');
const { tenantContext, requireActiveTenant } = require('../middleware/tenant.middleware');
const validate = require('../middleware/validate.middleware');
const {
  criarPagamentoSchema,
  processarSplitSchema,
  criarPlanoSchema,
  atualizarPlanoSchema,
  assinarPlanoSchema,
  cancelarAssinaturaSchema,
  solicitarTransferenciaSchema,
  consultarExtratoSchema,
  gerarFaturaSchema
} = require('../schemas/billing.schema');

// ═══════════════════════════════════════════════════════
// ROTAS ADMINISTRATIVAS (Admin only)
// ═══════════════════════════════════════════════════════

// Criar plano
router.post(
  '/planos',
  authMiddleware,
  isAdmin,
  tenantContext,
  requireActiveTenant,
  validate(criarPlanoSchema),
  billingController.criarPlano
);

// Atualizar plano (inclusive ativar/desativar)
router.put(
  '/planos/:id',
  authMiddleware,
  isAdmin,
  tenantContext,
  requireActiveTenant,
  validate(atualizarPlanoSchema),
  billingController.atualizarPlano
);

// Listar todos os planos (admin — inclui inativos e contagem de assinantes)
router.get(
  '/admin/planos',
  authMiddleware,
  isAdmin,
  tenantContext,
  requireActiveTenant,
  billingController.listarPlanosAdmin
);

// Aprovar pagamento (webhook/admin)
router.post(
  '/pagamentos/:id/aprovar',
  authMiddleware,
  isAdmin,
  tenantContext,
  requireActiveTenant,
  billingController.aprovarPagamento
);

// Confirmar pagamento
router.post(
  '/pagamentos/:id/confirmar',
  authMiddleware,
  isAdmin,
  tenantContext,
  requireActiveTenant,
  billingController.confirmarPagamento
);

// Assinaturas do ponto de vista da administração. O painel mostrava um número
// de assinantes (que nem funcionava, porque consultava um modelo inexistente) e
// não deixava abrir a lista, ver quem é, nem cancelar nada.
router.get(
  '/admin/assinaturas',
  authMiddleware,
  isAdmin,
  tenantContext,
  requireActiveTenant,
  billingController.listarAssinaturasAdmin
);

router.post(
  '/admin/assinaturas/:id/cancelar',
  authMiddleware,
  isAdmin,
  tenantContext,
  requireActiveTenant,
  billingController.cancelarAssinaturaAdmin
);

// Fila de repasses aos veterinários. O pedido do vet debitava o saldo e criava
// uma transação pendente que nenhum ponto do sistema lia — não havia rota,
// worker nem tela que pagasse aquilo.
router.get(
  '/admin/transferencias',
  authMiddleware,
  isAdmin,
  tenantContext,
  requireActiveTenant,
  billingController.listarTransferencias
);

router.post(
  '/admin/transferencias/:id/pagar',
  authMiddleware,
  isAdmin,
  tenantContext,
  requireActiveTenant,
  billingController.confirmarTransferencia
);

router.post(
  '/admin/transferencias/:id/recusar',
  authMiddleware,
  isAdmin,
  tenantContext,
  requireActiveTenant,
  billingController.recusarTransferencia
);

// Estatísticas financeiras
router.get(
  '/estatisticas',
  authMiddleware,
  isAdmin,
  tenantContext,
  requireActiveTenant,
  billingController.estatisticasFinanceiras
);

// ═══════════════════════════════════════════════════════
// ROTAS DE VETERINÁRIO
// ═══════════════════════════════════════════════════════

// Solicitar transferência
router.post(
  '/transferencias',
  authMiddleware,
  isVeterinario,
  requireApprovedVeterinarian,
  tenantContext,
  requireActiveTenant,
  validate(solicitarTransferenciaSchema),
  billingController.solicitarTransferencia
);

// ═══════════════════════════════════════════════════════
// ROTAS AUTENTICADAS (Todos)
// ═══════════════════════════════════════════════════════

// Criar pagamento
router.post(
  '/pagamentos',
  authMiddleware,
  tenantContext,
  requireActiveTenant,
  validate(criarPagamentoSchema),
  billingController.criarPagamento
);

// Consultar saldo
router.get(
  '/saldo',
  authMiddleware,
  tenantContext,
  requireActiveTenant,
  billingController.consultarSaldo
);

// Extrato
router.get(
  '/extrato',
  authMiddleware,
  tenantContext,
  requireActiveTenant,
  validate(consultarExtratoSchema, 'query'),
  billingController.extrato
);

// Listar planos
router.get(
  '/planos',
  billingController.listarPlanos // Pode ser público
);

// Assinatura ativa do usuário autenticado
router.get(
  '/minha-assinatura',
  authMiddleware,
  tenantContext,
  requireActiveTenant,
  billingController.minhaAssinatura
);

// Assinar plano
router.post(
  '/assinaturas',
  authMiddleware,
  tenantContext,
  requireActiveTenant,
  validate(assinarPlanoSchema),
  billingController.assinarPlano
);

// Cancelar assinatura
router.post(
  '/assinaturas/:id/cancelar',
  authMiddleware,
  tenantContext,
  requireActiveTenant,
  validate(cancelarAssinaturaSchema),
  billingController.cancelarAssinatura
);

// `export =` compila para `module.exports = router` exato. O server.js faz
// `require()` e entrega o valor direto ao Express: com `export default`, o
// require devolveria o módulo e o Express receberia objeto sem `handle`.
export = router;
