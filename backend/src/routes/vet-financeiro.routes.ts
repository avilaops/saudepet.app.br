import { Router } from 'express';
const router = Router();
const vetFinanceiroController = require('../controllers/vet-financeiro.controller');
const { authMiddleware, isVeterinario, requireApprovedVeterinarian } = require('../middleware/auth.middleware');
const { tenantContext, requireActiveTenant } = require('../middleware/tenant.middleware');
const validate = require('../middleware/validate.middleware');
const { contaBancariaSchema, criarCobrancaSchema } = require('../schemas/vet-financeiro.schema');

router.use(authMiddleware, tenantContext, requireActiveTenant, isVeterinario);

router.get('/status', vetFinanceiroController.getStatus);
router.get('/extrato', vetFinanceiroController.getExtrato);

// Conta bancária de recebimento
router.get('/conta-bancaria', vetFinanceiroController.getContaBancaria);
router.put(
  '/conta-bancaria',
  requireApprovedVeterinarian,
  validate(contaBancariaSchema),
  vetFinanceiroController.salvarContaBancaria
);
// Compatibilidade com o dashboard financeiro antigo
router.post(
  '/onboarding',
  requireApprovedVeterinarian,
  validate(contaBancariaSchema),
  vetFinanceiroController.solicitarOnboarding
);

// Controle de cobranças dos atendimentos do próprio veterinário
router.get('/cobrancas', vetFinanceiroController.listarCobrancas);
router.get('/cobrancas/atendimentos', requireApprovedVeterinarian, vetFinanceiroController.listarAtendimentosCobraveis);
router.post(
  '/cobrancas',
  requireApprovedVeterinarian,
  validate(criarCobrancaSchema),
  vetFinanceiroController.criarCobranca
);
router.post('/cobrancas/:id/cancelar', requireApprovedVeterinarian, vetFinanceiroController.cancelarCobranca);

// `export =` compila para `module.exports = router` exato. O server.js faz
// `require()` e entrega o valor direto ao Express: com `export default`, o
// require devolveria o módulo e o Express receberia objeto sem `handle`.
export = router;
