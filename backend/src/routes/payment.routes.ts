import { Router } from 'express';
const router = Router();
const paymentController = require('../controllers/payment.controller');
const cartaoController = require('../controllers/cartao-salvo.controller');
const { authMiddleware, isTutor } = require('../middleware/auth.middleware');
const { asyncHandler } = require('../middleware/error.middleware');
const { tenantContext, requireActiveTenant } = require('../middleware/tenant.middleware');

router.use(authMiddleware, tenantContext, requireActiveTenant);

// Chave PÚBLICA do gateway: o navegador tokeniza o cartão direto com o
// Mercado Pago, e número e CVV nunca passam pelo nosso servidor.
router.get('/chave-publica', paymentController.chavePublica);
router.post('/checkout', isTutor, paymentController.createCheckout);

// A carteira do tutor. Guardamos referência, nunca cartão: o token de uso único
// vem do navegador, e o número nunca chega a este servidor.
router.get('/cartoes', isTutor, asyncHandler(cartaoController.listar));
router.post('/cartoes', isTutor, asyncHandler(cartaoController.salvar));
router.delete('/cartoes/:id', isTutor, asyncHandler(cartaoController.remover));
router.put('/cartoes/:id/principal', isTutor, asyncHandler(cartaoController.tornarPrincipal));
// Rota específica antes de /:id/status para o "atendimento" não ser lido como um id
// Benefício do plano do tutor. A vitrine promete "10% de desconto em todas as
// consultas" e não havia onde ver se estava valendo nem quanto restava no mês.
router.get('/meu-beneficio', isTutor, paymentController.meuBeneficio);
router.get('/atendimento/:atendimentoId', paymentController.getPaymentByAtendimento);
router.get('/:id/status', paymentController.getPaymentStatus);

// `export =` compila para `module.exports = router` exato. O server.js faz
// `require()` e entrega o valor direto ao Express: com `export default`, o
// require devolveria o módulo e o Express receberia objeto sem `handle`.
export = router;
