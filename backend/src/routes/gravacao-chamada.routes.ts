import { Router } from 'express';
const router = Router();

const gravacaoController = require('../controllers/gravacao-chamada.controller');
const { authMiddleware, isAdmin } = require('../middleware/auth.middleware');
const { tenantContext, requireActiveTenant } = require('../middleware/tenant.middleware');
const { uploadGravacaoChamada } = require('../middleware/upload.middleware');
const { asyncHandler } = require('../middleware/error.middleware');

/**
 * Gravação de chamada, montada em `/api/v1/chamada/gravacao`.
 *
 * Só ESCRITA, e só de quem está gravando: subir um pedaço e fechar. A
 * conferência de dono é do serviço, que recusa gravação de outro participante
 * — o id na URL não é credencial.
 *
 * A leitura mora em `admin.routes`, atrás de `isAdmin` e com motivo obrigatório.
 * Se um dia alguém quiser "deixar o veterinário rever a consulta", isso é uma
 * decisão de produto com implicação de LGPD, e não uma rota a mais neste
 * arquivo.
 */
router.use(authMiddleware, tenantContext, requireActiveTenant);

router.post(
  '/:gravacaoId/parte',
  uploadGravacaoChamada.single('trecho'),
  asyncHandler(gravacaoController.enviarParte)
);

router.post('/:gravacaoId/finalizar', asyncHandler(gravacaoController.finalizar));

// `export =` compila para `module.exports = router` exato. O server.js faz
// `require()` e entrega o valor direto ao Express: com `export default`, o
// require devolveria o módulo e o Express receberia objeto sem `handle`.
export = router;
