import { Router } from 'express';
const router = Router();
const partnerController = require('../controllers/partner.controller');
const { authMiddleware, isAdmin } = require('../middleware/auth.middleware');

// 🌐 Rotas Públicas (Tutores e visitantes)
router.get('/public', partnerController.listPublicPartners);
// Categorias: `PartnerService.categoryId` é obrigatório e não havia nenhuma
// rota que listasse categoria — não existia como descobrir um id válido.
router.get('/categories', partnerController.listCategories);
router.get('/public/:id', partnerController.getPartnerDetails);

// 🏢 Rotas Administrativas & Gestão
router.get('/my', authMiddleware, partnerController.getMyPartners);
router.get('/', authMiddleware, isAdmin, partnerController.listAllPartners);
router.post('/', authMiddleware, isAdmin, partnerController.createPartner);
router.post('/:id/approve', authMiddleware, isAdmin, partnerController.approvePartner);
router.post('/:partnerId/units', authMiddleware, isAdmin, partnerController.addUnit);
router.post('/:partnerId/services', authMiddleware, isAdmin, partnerController.addService);
router.post('/categories', authMiddleware, isAdmin, partnerController.createCategory);
router.get('/:id', authMiddleware, isAdmin, partnerController.getPartnerForAdmin);

// `export =` compila para `module.exports = router` exato. O server.js faz
// `require()` e entrega o valor direto ao Express: com `export default`, o
// require devolveria o módulo e o Express receberia objeto sem `handle`.
export = router;
