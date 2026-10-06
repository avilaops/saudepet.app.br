import { Router } from 'express';
const { rateLimit } = require('express-rate-limit');
const router = Router();
const authController = require('../controllers/auth.controller');
const { authMiddleware, bloquearVisitaDeSuporte } = require('../middleware/auth.middleware');
const validate = require('../middleware/validate.middleware');
const { registerSchema, loginSchema } = require('../schemas/auth.schema');
import type { NextFunction, Request, Response } from 'express';
const {
  refreshTokenSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  verifyEmailSchema,
  resendVerificationSchema
} = require('../schemas/auth-advanced.schema');

// ═══════════════════════════════════════════════════════
// ROTAS PÚBLICAS
// ═══════════════════════════════════════════════════════

// Registro e Login
router.post('/register', validate(registerSchema), authController.register);
// Segunda trava contra força bruta, POR CONTA. A primeira (em server.js) é
// por IP e protege contra um atacante batendo em muitas contas; esta protege
// UMA conta de um atacante espalhado em muitos IPs. 10 falhas em 15 minutos
// bloqueiam novas tentativas naquele e-mail; acerto não conta.
const limitePorConta = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: (req: Request) => `conta:${String(req.body?.email || '').trim().toLowerCase()}`,
  skip: (req: Request) => !req.body?.email
    || (process.env.NODE_ENV === 'test' && process.env.TESTAR_LIMITE_POR_CONTA !== 'true'),
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => res.status(429).json({
    error: 'Muitas tentativas para esta conta. Aguarde 15 minutos ou redefina a senha.'
  })
});

router.post('/login', limitePorConta, validate(loginSchema), authController.login);

// Refresh Token
router.post('/refresh', validate(refreshTokenSchema), authController.refreshToken);

// Recuperação de Senha
router.post('/forgot-password', validate(forgotPasswordSchema), authController.forgotPassword);
router.post('/reset-password', validate(resetPasswordSchema), authController.resetPassword);

// Verificação de Email
router.post('/verify-email', validate(verifyEmailSchema), authController.verifyEmail);
router.post('/resend-verification', validate(resendVerificationSchema), authController.resendVerification);

// Login com Facebook
router.get('/facebook', authController.facebookRedirect);
router.get('/facebook/callback', authController.facebookCallback);

// ═══════════════════════════════════════════════════════
// ROTAS PROTEGIDAS (Requerem Autenticação)
// ═══════════════════════════════════════════════════════

// Perfil
router.get('/me', authMiddleware, authController.me);
router.get('/profile', authMiddleware, authController.me);

// Alterar Senha
router.post('/change-password', authMiddleware, bloquearVisitaDeSuporte, validate(changePasswordSchema), authController.changePassword);

// Logout
router.post('/logout', authMiddleware, authController.logout);

// `export =` compila para `module.exports = router` exato. O server.js faz
// `require()` e entrega o valor direto ao Express: com `export default`, o
// require devolveria o módulo e o Express receberia objeto sem `handle`.
export = router;
