import express from 'express';
import controller from '../controllers/minhas-notificacoes.controller';

const { authMiddleware } = require('../middleware/auth.middleware');
const { tenantContext, requireActiveTenant } = require('../middleware/tenant.middleware');

/**
 * A central de notificações de quem está logado.
 *
 * Sem papel na porta de propósito: tutor, veterinário e admin têm a mesma
 * central, e cada um só enxerga o que é dele — o `usuario_id` do filtro sai do
 * token. Não confundir com `notificacao.routes`, que é a CONFIGURAÇÃO de
 * notificação do tenant e é só de super admin.
 */
const router = express.Router();

router.use(authMiddleware, tenantContext, requireActiveTenant);

router.get('/', controller.listar);
router.get('/nao-lidas', controller.contar);
router.patch('/:id/lida', controller.marcarComoLida);
router.post('/lidas', controller.marcarTodasComoLidas);

export = router;
