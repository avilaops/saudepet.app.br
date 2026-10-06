import { Router } from 'express';
import { authMiddleware, isVeterinario, requireApprovedVeterinarian } from '../middleware/auth.middleware';
import { tenantContext, requireActiveTenant } from '../middleware/tenant.middleware';
import validate from '../middleware/validate.middleware';
import { salvarCatalogoVeterinarioSchema } from '../schemas/catalogo-veterinario.schema';
import { obterMeuCatalogo, salvarMeuCatalogo } from '../controllers/catalogo-veterinario.controller';

const router = Router();

router.use(authMiddleware, tenantContext, requireActiveTenant, isVeterinario);
router.get('/', obterMeuCatalogo);
router.put('/', requireApprovedVeterinarian, validate(salvarCatalogoVeterinarioSchema), salvarMeuCatalogo);

export = router;
