import { Router } from 'express';

const router = Router();
const controller = require('../controllers/crm-veterinario.controller');
const {
  authMiddleware,
  isVeterinario,
  requireApprovedVeterinarian
} = require('../middleware/auth.middleware');
const { tenantContext, requireActiveTenant } = require('../middleware/tenant.middleware');
const { requerRecurso, RECURSOS } = require('../middleware/plano-vet.middleware');

// Todo o CRM exige veterinário aprovado do tenant ativo. O `tenantId` vem da
// identidade autenticada, nunca do corpo da requisição.
router.use(authMiddleware, tenantContext, requireActiveTenant, isVeterinario, requireApprovedVeterinarian);

// O que o plano atual libera — o frontend usa para decidir o que mostrar
// habilitado e onde oferecer upgrade, em vez de descobrir por 402.
router.get('/meu-plano', controller.meuPlano);

// ── Clientela ───────────────────────────────────────────────────────────────
// Ver a carteira é gratuito; anotar sobre ela é o que se paga.
router.get('/clientes', requerRecurso(RECURSOS.CLIENTES_LISTA), controller.listarClientes);
router.get('/clientes/tags', requerRecurso(RECURSOS.CLIENTES_LISTA), controller.listarTags);
router.get('/clientes/:tutorId', requerRecurso(RECURSOS.CLIENTES_LISTA), controller.obterCliente);
router.put('/clientes/:tutorId', requerRecurso(RECURSOS.CLIENTES_NOTAS), controller.atualizarCliente);

// ── Agenda ──────────────────────────────────────────────────────────────────
router.get('/agendamentos', requerRecurso(RECURSOS.AGENDA), controller.listarAgendamentos);
router.get('/agendamentos/horarios-livres', requerRecurso(RECURSOS.AGENDA), controller.horariosLivres);
router.post('/agendamentos', requerRecurso(RECURSOS.AGENDA), controller.criarAgendamento);
router.put('/agendamentos/:id/status', requerRecurso(RECURSOS.AGENDA), controller.alterarStatusAgendamento);
router.put('/agendamentos/:id/remarcar', requerRecurso(RECURSOS.AGENDA), controller.remarcarAgendamento);
// A consulta marcada vira atendimento (com prontuário e cobrança) por aqui.
router.post('/agendamentos/:id/iniciar-atendimento', requerRecurso(RECURSOS.AGENDA), controller.iniciarAtendimentoDoAgendamento);

// ── Relatórios ──────────────────────────────────────────────────────────────
router.get('/painel', requerRecurso(RECURSOS.RELATORIOS), controller.painel);

// ── Retenção ────────────────────────────────────────────────────────────────
router.get('/retencao/inativos', requerRecurso(RECURSOS.RETENCAO), controller.clientesInativos);
router.get('/retencao/lembretes', requerRecurso(RECURSOS.RETENCAO), controller.listarLembretes);
router.post('/retencao/lembretes', requerRecurso(RECURSOS.RETENCAO), controller.criarLembrete);
router.post('/retencao/convocar', requerRecurso(RECURSOS.RETENCAO), controller.convocarEmLote);

// `export =` compila para `module.exports = router` exato. O server.js faz
// `require()` e entrega o valor direto ao Express: com `export default`, o
// require devolveria o módulo e o Express receberia objeto sem `handle`.
export = router;
