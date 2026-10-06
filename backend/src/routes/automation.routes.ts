import { Router } from 'express';
import { automationAuth } from '../middleware/automation.middleware';
import * as automation from '../controllers/automation.controller';

const router = Router();
router.use(automationAuth);

router.get('/health', automation.health);
router.get('/mercado/rastreios-pendentes', automation.rastreiosPendentes);
router.post('/mercado/pedidos/:id/rastreio-evento', automation.registrarRastreio);
router.get('/operacao/curitiba', automation.operacaoCuritiba);

export = router;

