import { Router } from 'express';
const router = Router();
const petPublicController = require('../controllers/pet-public.controller');
const petController = require('../controllers/pet.controller');
const { authMiddleware, isTutor } = require('../middleware/auth.middleware');
const { tenantContext, requireActiveTenant } = require('../middleware/tenant.middleware');
const validate = require('../middleware/validate.middleware');
const upload = require('../middleware/upload.middleware');
const { createPetSchema, updatePetSchema } = require('../schemas/pet.schema');
const petFichaTutorController = require('../controllers/pet-ficha-tutor.controller');
const {
  criarAlergiaTutorSchema,
  criarMedicamentoTutorSchema,
  criarVacinaTutorSchema
} = require('../schemas/pet-ficha-tutor.schema');

// Todas as rotas requerem autenticação como tutor
router.use(authMiddleware);
router.use(isTutor);
router.use(tenantContext);
router.use(requireActiveTenant);

router.post('/', validate(createPetSchema), petController.create);
router.get('/', petController.list);
router.get('/:id', petController.getById);
// Quem leu a coleira do meu pet, quando e onde. Antes o "Alertar Tutor" da
// página pública era só um link de WhatsApp e o sistema nunca registrava nada.
router.get('/:id/leituras-da-tag', petPublicController.listarLeituras);
router.put('/:id', validate(updatePetSchema), petController.update);
router.post('/:id/foto', upload.single('foto'), petController.uploadFoto);
router.delete('/:id', petController.delete);

// Ficha de saúde declarada pelo tutor (v1.0): alergias, medicamentos, vacinas.
// Vive em `/:id/ficha/...` de propósito: `ficha-clinica.routes` é montado
// ANTES deste router e reserva `/:petId/alergias/:id` (e irmãs) para a
// correção auditada do veterinário; um DELETE do tutor no mesmo caminho
// morreria lá com 403 antes de chegar aqui.
router.get('/:id/ficha', petFichaTutorController.listar);
router.post('/:id/ficha/alergias', validate(criarAlergiaTutorSchema), petFichaTutorController.criarAlergia);
router.delete('/:id/ficha/alergias/:registroId', petFichaTutorController.removerAlergia);
router.post('/:id/ficha/medicamentos', validate(criarMedicamentoTutorSchema), petFichaTutorController.criarMedicamento);
router.delete('/:id/ficha/medicamentos/:registroId', petFichaTutorController.removerMedicamento);
router.post('/:id/ficha/vacinas', validate(criarVacinaTutorSchema), petFichaTutorController.criarVacina);
router.delete('/:id/ficha/vacinas/:registroId', petFichaTutorController.removerVacina);

// `export =` compila para `module.exports = router` exato. O server.js faz
// `require()` e entrega o valor direto ao Express: com `export default`, o
// require devolveria o módulo e o Express receberia objeto sem `handle`.
export = router;
