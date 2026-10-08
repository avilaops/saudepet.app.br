import { Router } from 'express';
const router = Router();
const veterinarioController = require('../controllers/veterinario.controller');
const { authMiddleware, isVeterinario, requireApprovedVeterinarian } = require('../middleware/auth.middleware');
const { tenantContext, requireActiveTenant } = require('../middleware/tenant.middleware');
const validate = require('../middleware/validate.middleware');
const upload = require('../middleware/upload.middleware');
const { RECURSOS, requerRecurso } = require('../middleware/plano-vet.middleware');
const { updateVeterinarioSchema, updateOnlineStatusSchema } = require('../schemas/veterinario.schema');

// Rotas públicas (para tutores verem veterinários disponíveis)
router.use(authMiddleware, tenantContext, requireActiveTenant);
router.get('/online', veterinarioController.listarOnline);

// Pedir credenciamento de dentro da conta. SEM `isVeterinario` de propósito:
// quem pede ainda não é veterinário — é justamente esse o ponto. Antes desta
// rota, virar profissional só era possível na tela de cadastro, e quem tinha
// entrado com o Google (sempre tutor) não tinha saída nenhuma.
router.post('/credenciamento', veterinarioController.solicitarCredenciamento);

// Rotas do veterinário (devem vir ANTES da rota /:id)
router.get('/meus-dados', isVeterinario, veterinarioController.obterDados);
router.put('/status-online', isVeterinario, requireApprovedVeterinarian, validate(updateOnlineStatusSchema), veterinarioController.atualizarStatusOnline);
router.get('/estatisticas', isVeterinario, requireApprovedVeterinarian, veterinarioController.estatisticas);
router.put('/perfil', isVeterinario, validate(updateVeterinarioSchema), veterinarioController.atualizar);
router.post('/documento', isVeterinario, upload.uploadDocumento.single('documento'), veterinarioController.uploadDocumento);
// Logo do consultório na receita e no prontuário: recurso de plano.
router.post('/logo-documentos', isVeterinario, requerRecurso(RECURSOS.LOGO_DOCUMENTOS), upload.single('logo'), veterinarioController.enviarLogoDocumentos);
router.delete('/logo-documentos', isVeterinario, veterinarioController.removerLogoDocumentos);
router.post('/prontuario-ia-parse', isVeterinario, veterinarioController.parseProntuarioPorVoz);

// Rota com parâmetro dinâmico DEVE vir por último
router.get('/:id', veterinarioController.buscarPorId);

// `export =` compila para `module.exports = router` exato. O server.js faz
// `require()` e entrega o valor direto ao Express: com `export default`, o
// require devolveria o módulo e o Express receberia objeto sem `handle`.
export = router;
