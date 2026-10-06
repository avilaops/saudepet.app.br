import { Router } from 'express';
const router = Router();
const tenantController = require('../controllers/tenant.controller');
const { authMiddleware, isAdmin } = require('../middleware/auth.middleware');
const { tenantContext, requireActiveTenant } = require('../middleware/tenant.middleware');
const validate = require('../middleware/validate.middleware');
import type { NextFunction, Request, Response } from 'express';
const {
  createTenantSchema,
  updateTenantSchema,
  updateTenantStatusSchema,
  updateTenantPlanSchema,
  updateTenantConfigSchema
} = require('../schemas/tenant.schema');

// Middleware para verificar se é super_admin
const isSuperAdmin = (req: Request, res: Response, next: NextFunction) => {
  // `req.user` é opcional na Request: o `authMiddleware` roda antes e sempre
  // o preenche, mas o tipo não garante isso. Sem a interrogação, uma ordem de
  // middleware trocada derrubaria a rota com "cannot read tipo_usuario" em vez
  // de responder o 403 que já está escrito logo abaixo.
  if (req.user?.tipo_usuario !== 'super_admin') {
    return res.status(403).json({ error: 'Acesso negado. Apenas super administradores.' });
  }
  next();
};

// Rota pública para buscar tenant por slug (necessário para subdomínios)
router.get('/slug/:slug', tenantController.buscarPorSlug);

// Todas as outras rotas requerem autenticação
router.use(authMiddleware);
router.use(isAdmin);
router.use(tenantContext);
router.use(requireActiveTenant);

// Criar tenant (apenas super_admin)
router.post('/', isSuperAdmin, validate(createTenantSchema), tenantController.criar);

// Listar tenants (super_admin vê todos, admin vê apenas o seu)
router.get('/', tenantController.listar);

// Buscar tenant por ID
router.get('/:id', tenantController.buscarPorId);

// Estatísticas do tenant
router.get('/:id/stats', tenantController.estatisticas);

// Atualizar tenant
router.put('/:id', validate(updateTenantSchema), tenantController.atualizar);

// Atualizar status (apenas super_admin)
router.put('/:id/status', isSuperAdmin, validate(updateTenantStatusSchema), tenantController.atualizarStatus);

// Atualizar plano (apenas super_admin)
router.put('/:id/plano', isSuperAdmin, validate(updateTenantPlanSchema), tenantController.atualizarPlano);

// Atualizar configurações
router.put('/:id/config', validate(updateTenantConfigSchema), tenantController.atualizarConfig);

// Deletar tenant (apenas super_admin)
router.delete('/:id', isSuperAdmin, tenantController.deletar);

// `export =` compila para `module.exports = router` exato. O server.js faz
// `require()` e entrega o valor direto ao Express: com `export default`, o
// require devolveria o módulo e o Express receberia objeto sem `handle`.
export = router;
