import { Router } from 'express';
const router = Router();
const agendaController = require('../controllers/agenda.controller');
const agendamentoDoTutor = require('../controllers/agendamento-do-tutor.controller');
const { asyncHandler } = require('../middleware/error.middleware');
const { authMiddleware, isVeterinario, isTutor } = require('../middleware/auth.middleware');
const { tenantContext, requireActiveTenant } = require('../middleware/tenant.middleware');

router.use(authMiddleware, tenantContext, requireActiveTenant);

// Rotas Tutor (Público autenticado)
router.get('/disponiveis', agendaController.getHorariosDisponiveis);
// O tutor marcando consulta futura. A agenda existia inteira do lado do
// profissional; para marcar um check-up, o tutor precisava ligar.
router.get('/horarios-livres', isTutor, asyncHandler(agendamentoDoTutor.horarios));
router.post('/marcar', isTutor, asyncHandler(agendamentoDoTutor.marcar));
router.get('/meus-agendamentos', isTutor, agendaController.meusAgendamentos);
router.put('/agendamentos/:id/confirmar', isTutor, agendaController.confirmarAgendamento);
router.put('/agendamentos/:id/cancelar', isTutor, agendaController.cancelarAgendamento);

// Rotas Veterinário
router.get('/minha-grade', isVeterinario, agendaController.getMinhaGrade);
router.post('/grade', isVeterinario, agendaController.salvarGrade);

// `export =` compila para `module.exports = router` exato. O server.js faz
// `require()` e entrega o valor direto ao Express: com `export default`, o
// require devolveria o módulo e o Express receberia objeto sem `handle`.
export = router;
