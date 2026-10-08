import { Router } from 'express';
const router = Router();
const referralController = require('../controllers/referral.controller');
const { authMiddleware, isTutor, requirePartnerAccess } = require('../middleware/auth.middleware');
import prisma from '../config/database';
import type { NextFunction, Request, Response } from 'express';

// 🐶 Rotas do Tutor
router.post('/', authMiddleware, isTutor, referralController.createReferral);
router.get('/my', authMiddleware, isTutor, referralController.getTutorReferrals);

// 🩺 Rotas do Parceiro / Admin — exigem que o usuário seja staff ativo do parceiro em questão
router.get('/validate/:code', authMiddleware, referralController.validateReferralCode);
router.get(
  '/partner/:partnerId',
  authMiddleware,
  requirePartnerAccess((req: Request) => req.params.partnerId),
  referralController.getPartnerReferrals
);
router.post(
  '/:id/register-conversion',
  authMiddleware,
  requirePartnerAccess(async (req: Request) => {
    const referral = await prisma.referral.findUnique({
      where: { id: req.params.id },
      select: { partnerId: true }
    });
    return referral?.partnerId;
  }),
  referralController.registerConversion
);

// `export =` compila para `module.exports = router` exato. O server.js faz
// `require()` e entrega o valor direto ao Express: com `export default`, o
// require devolveria o módulo e o Express receberia objeto sem `handle`.
export = router;
