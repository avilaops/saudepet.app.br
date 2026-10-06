import { Router } from 'express';
import * as admin from '../controllers/mercado-admin.controller';

const { authMiddleware, isAdmin } = require('../middleware/auth.middleware');
const { asyncHandler } = require('../middleware/error.middleware');
const { tenantContext, requireActiveTenant } = require('../middleware/tenant.middleware');

/**
 * Saúde Pet Mercado — o lado de quem responde pela plataforma.
 *
 * Aprovar uma loja é decidir quem pode vender medicamento de uso animal dentro
 * do aplicativo. Suspender é tirar o ganha-pão de alguém do ar. Os dois atos
 * gravam evento pericial no controller, com estado anterior e posterior — a
 * mesma trilha das outras ações irreversíveis que a auditoria já tranca.
 */
const router = Router();

router.use(authMiddleware, tenantContext, requireActiveTenant, isAdmin);

router.get('/lojas', asyncHandler(admin.lojas));
router.post('/lojas/:id/decisao', asyncHandler(admin.decidir));

router.get('/categorias', asyncHandler(admin.categorias));
router.post('/categorias', asyncHandler(admin.novaCategoria));
router.put('/categorias/:id', asyncHandler(admin.editarCategoria));

router.get('/pedidos', asyncHandler(admin.pedidos));
router.post('/pedidos/:id/reembolso', asyncHandler(admin.reembolsar));

router.get('/financeiro', asyncHandler(admin.resumoFinanceiro));

export = router;
