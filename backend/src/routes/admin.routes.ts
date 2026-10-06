import { Router } from 'express';
const router = Router();
const adminController = require('../controllers/admin.controller');
const { authMiddleware, isAdmin } = require('../middleware/auth.middleware');
const { tenantContext, requireActiveTenant } = require('../middleware/tenant.middleware');
const { asyncHandler } = require('../middleware/error.middleware');
const gravacaoController = require('../controllers/gravacao-chamada.controller');

// Todas as rotas requerem autenticação como admin
router.use(authMiddleware);
router.use(isAdmin);
router.use(tenantContext);
router.use(requireActiveTenant);

// Dashboard
router.get('/dashboard', adminController.dashboard);

// Credenciamento de veterinário vive em `admin-veterinario.routes` (montado em
// /api/v1/admin/veterinarios): lá a aprovação grava `VeterinarioSubmissao`,
// registra na auditoria, derruba a sessão em caso de suspensão e dispara
// e-mail. As quatro rotas que existiam AQUI faziam o mesmo de forma mais fraca —
// sem submissão, sem trilha, sem revogar sessão — e continuavam acessíveis pelo
// prefixo legado `/api/admin`. Manter dois caminhos para aprovar um
// profissional é um caminho a mais para aprovar por fora do processo.

// Usuários
router.get('/usuarios', adminController.listarUsuarios);
router.delete('/usuarios/:id', adminController.deletarUsuario);

// Atendimentos
router.get('/atendimentos', adminController.listarAtendimentos);

// Gravação da teleorientação: a FICHA é listagem barata; o ÁUDIO exige motivo
// e vai para o AuditLog. A separação é o ponto — auditoria sem rastro de quem
// auditou é vigilância.
router.get('/atendimentos/:id/gravacoes', asyncHandler(gravacaoController.listarParaModeracao));
router.post('/gravacoes/:gravacaoId/abrir', asyncHandler(gravacaoController.abrirParaModeracao));

// Intervenção num atendimento travado. Um chamado preso em
// `procurando_veterinario` não tinha nenhuma saída pelo painel: o admin via o
// problema e não podia fazer nada, e o tutor ficava impedido de abrir outro.
router.post('/solicitacoes/:id/cancelar', adminController.cancelarAtendimento);
router.post('/solicitacoes/:id/reatribuir', adminController.reatribuirAtendimento);
router.get('/veterinarios-disponiveis', adminController.listarVeterinariosCredenciados);

// `export =` compila para `module.exports = router` exato. O server.js faz
// `require()` e entrega o valor direto ao Express: com `export default`, o
// require devolveria o módulo e o Express receberia objeto sem `handle`.
export = router;
