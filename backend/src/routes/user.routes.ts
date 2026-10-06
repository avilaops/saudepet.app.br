import { Router } from 'express';
const router = Router();
const { authMiddleware, isAdmin, bloquearVisitaDeSuporte } = require('../middleware/auth.middleware');
const { tenantContext, requireActiveTenant } = require('../middleware/tenant.middleware');
const userController = require('../controllers/user.controller');
const validate = require('../middleware/validate.middleware');
const upload = require('../middleware/upload.middleware');
const { createUserSchema, updateProfileSchema } = require('../schemas/user.schema');

// Estatísticas e gestão: autorização real no servidor
router.get('/stats', authMiddleware, isAdmin, tenantContext, requireActiveTenant, userController.getStats);

// Listar todos os usuários
router.get('/', authMiddleware, isAdmin, tenantContext, requireActiveTenant, userController.listarTodos);

// Direitos do titular sobre os próprios dados (LGPD, art. 18). A Política de
// Privacidade prometia acesso, portabilidade e exclusão e não havia endpoint
// nenhum. Estas rotas vêm ANTES de `/:id` — senão `meus-dados` seria lido como
// um identificador de usuário.
router.get('/meus-dados', authMiddleware, tenantContext, requireActiveTenant, userController.exportarMeusDados);
router.get('/minha-conta/pendencias', authMiddleware, tenantContext, requireActiveTenant, userController.pendenciasDaConta);
router.post('/minha-conta/encerrar', authMiddleware, bloquearVisitaDeSuporte, tenantContext, requireActiveTenant, userController.encerrarMinhaConta);

// Buscar usuário por ID
router.get('/:id', authMiddleware, tenantContext, requireActiveTenant, userController.buscarPorId);

// Atualizar perfil
router.put('/profile', authMiddleware, tenantContext, requireActiveTenant, validate(updateProfileSchema), userController.updateProfile);

// Upload de foto de perfil ou capa (:tipo = 'perfil' | 'capa')
router.post('/foto/:tipo', authMiddleware, tenantContext, requireActiveTenant, upload.single('foto'), userController.uploadFoto);

// Criar usuário (apenas admin)
router.post('/', authMiddleware, isAdmin, tenantContext, requireActiveTenant, validate(createUserSchema), userController.criar);

// Deletar usuário
router.delete('/:id', authMiddleware, isAdmin, tenantContext, requireActiveTenant, userController.delete);

// `export =` compila para `module.exports = router` exato. O server.js faz
// `require()` e entrega o valor direto ao Express: com `export default`, o
// require devolveria o módulo e o Express receberia objeto sem `handle`.
export = router;
