import { Router } from 'express';
import { automationAuth } from '../middleware/automation.middleware';
import * as automation from '../controllers/automation.controller';
import { asyncHandler } from '../middleware/error.middleware';

const router = Router();
router.use(automationAuth);

router.get('/health', automation.health);
router.get('/mercado/rastreios-pendentes', automation.rastreiosPendentes);
router.post('/mercado/pedidos/:id/rastreio-evento', automation.registrarRastreio);
router.get('/operacao/curitiba', automation.operacaoCuritiba);
router.get('/operacao/saude', asyncHandler(automation.saudeOperacional));

export = router;

