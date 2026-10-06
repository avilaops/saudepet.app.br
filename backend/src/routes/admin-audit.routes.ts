import { Router } from 'express';
const router = Router();
const adminAuditController = require('../controllers/admin-audit.controller');
const { authMiddleware, isAdmin } = require('../middleware/auth.middleware');
const { tenantContext, requireActiveTenant } = require('../middleware/tenant.middleware');

router.use(authMiddleware, tenantContext, requireActiveTenant, isAdmin);

// Central de Auditoria Geral
router.get('/logs', adminAuditController.getCentralAuditLogs);
router.get('/export', adminAuditController.exportAuditLogs);

// Linha do Tempo Forense Unificada por Atendimento
router.get('/atendimento/:id', adminAuditController.getAtendimentoForensicTimeline);

// `export =` compila para `module.exports = router` exato. O server.js faz
// `require()` e entrega o valor direto ao Express: com `export default`, o
// require devolveria o módulo e o Express receberia objeto sem `handle`.
export = router;
