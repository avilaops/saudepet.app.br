import { Router } from 'express';

const router = Router();
const controller = require('../controllers/ficha-clinica.controller');
const {
  authMiddleware,
  isVeterinario,
  requireApprovedVeterinarian
} = require('../middleware/auth.middleware');
const { tenantContext, requireActiveTenant } = require('../middleware/tenant.middleware');
const validate = require('../middleware/validate.middleware');
import type { NextFunction, Request, Response } from 'express';

/** Erro que chega no tratador da rota; o middleware global refina depois. */
type ErroDeRota = Error & { status?: number; code?: string };
const {
  corrigirAlergiaSchema,
  corrigirVacinaSchema,
  corrigirMedicamentoSchema,
  removerRegistroClinicoSchema
} = require('../schemas/ficha-clinica.schema');

/**
 * Correção e remoção da ficha clínica do pet.
 *
 * Monta em `/pets` antes das rotas do tutor: aquelas exigem `isTutor` no router
 * inteiro e responderiam 403 ao veterinário antes de chegar aqui. Como este
 * router só declara `/:petId/alergias/:id` e irmãs, tudo que não casa segue
 * adiante para `pet.routes.js`.
 */

router.use(authMiddleware, tenantContext, requireActiveTenant);

/**
 * Quem pode corrigir: qualquer veterinário aprovado do tenant — o histórico
 * clínico é compartilhado dentro do tenant e quem está com o animal agora é
 * quem enxerga o erro — e o admin do tenant, que responde pela ficha quando o
 * veterinário que registrou não está mais na plataforma.
 *
 * `isVeterinario` sozinho barraria o admin (ele só deixa passar `veterinario` e
 * `super_admin`), por isso a composição.
 */
function vetAprovadoOuAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.userType === 'admin' || req.userType === 'super_admin') {
    return next();
  }
  return isVeterinario(req, res, (erro: ErroDeRota) => {
    if (erro) return next(erro);
    return requireApprovedVeterinarian(req, res, next);
  });
}

// ATENÇÃO: guarda POR ROTA, nunca `router.use`.
//
// Este router é montado em `/api/pets` (e `/api/v1/pets`) ANTES do router de
// pets do tutor. Um `router.use(vetAprovadoOuAdmin)` roda para TUDO que entra
// aqui — inclusive `GET /api/pets`, que é a lista de pets do tutor e não casa
// com nenhuma rota deste arquivo. O tutor recebia "Acesso negado. Apenas
// veterinários." ao abrir "Meus pets", e a requisição morria aqui sem nunca
// chegar ao router certo.
//
// As suítes não pegavam porque montam só o router de pets, sem este ao lado —
// a colisão só existe com a ordem real do servidor.

router.put('/:petId/alergias/:id', vetAprovadoOuAdmin, validate(corrigirAlergiaSchema), controller.corrigirAlergia);
router.delete('/:petId/alergias/:id', vetAprovadoOuAdmin, validate(removerRegistroClinicoSchema), controller.removerAlergia);

router.put('/:petId/vacinas/:id', vetAprovadoOuAdmin, validate(corrigirVacinaSchema), controller.corrigirVacina);
router.delete('/:petId/vacinas/:id', vetAprovadoOuAdmin, validate(removerRegistroClinicoSchema), controller.removerVacina);

router.put('/:petId/medicamentos/:id', vetAprovadoOuAdmin, validate(corrigirMedicamentoSchema), controller.corrigirMedicamento);
router.delete('/:petId/medicamentos/:id', vetAprovadoOuAdmin, validate(removerRegistroClinicoSchema), controller.removerMedicamento);

// Desfazer. Uma alergia removida por engano é uma alergia que não aparece na
// hora de medicar — e até aqui a volta só existia com acesso ao banco.
router.get('/:petId/removidos', vetAprovadoOuAdmin, controller.listarRemovidos);
router.post('/:petId/alergias/:id/restaurar', vetAprovadoOuAdmin, validate(removerRegistroClinicoSchema), controller.restaurarAlergia);
router.post('/:petId/vacinas/:id/restaurar', vetAprovadoOuAdmin, validate(removerRegistroClinicoSchema), controller.restaurarVacina);
router.post('/:petId/medicamentos/:id/restaurar', vetAprovadoOuAdmin, validate(removerRegistroClinicoSchema), controller.restaurarMedicamento);

// `export =` compila para `module.exports = router` exato. O server.js faz
// `require()` e entrega o valor direto ao Express: com `export default`, o
// require devolveria o módulo e o Express receberia objeto sem `handle`.
export = router;
module.exports.vetAprovadoOuAdmin = vetAprovadoOuAdmin;
