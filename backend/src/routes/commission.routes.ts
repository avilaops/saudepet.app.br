import { Router } from 'express';
const router = Router();
const commissionController = require('../controllers/commission.controller');
const { authMiddleware, isAdmin } = require('../middleware/auth.middleware');

// 📊 Rotas Administrativas de Comissões e Fechamentos
router.get('/rules', authMiddleware, isAdmin, commissionController.listCommissionRules);
router.post('/rules', authMiddleware, isAdmin, commissionController.createCommissionRule);
router.get('/settlements', authMiddleware, isAdmin, commissionController.listSettlements);
// Geração do fechamento — o elo que faltava. Sem esta rota, `CommissionSettlement`
// nunca era criado e a aba de liquidações do painel era estruturalmente vazia.
router.post('/settlements/generate', authMiddleware, isAdmin, commissionController.generateSettlements);
router.post('/settlements/:id/pay', authMiddleware, isAdmin, commissionController.markSettlementPaid);
router.post('/settlements/:id/cancel', authMiddleware, isAdmin, commissionController.cancelSettlement);

// `export =` compila para `module.exports = router` exato. O server.js faz
// `require()` e entrega o valor direto ao Express: com `export default`, o
// require devolveria o módulo e o Express receberia objeto sem `handle`.
export = router;
