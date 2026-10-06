import { Router } from 'express';
const router = Router();
const googleAuthController = require('../controllers/google-auth.controller');

// 1. Redirecionar para o Google OAuth 2.0 (com estado CSRF)
router.get('/google', googleAuthController.redirectToGoogle);

// 2. Callback retornado do Google OAuth 2.0
router.get('/google/callback', googleAuthController.handleCallback);

// 3. Troca segura de código descartável por sessão (proteção contra vazamento de JWT na URL)
router.post('/google/exchange', googleAuthController.exchangeCode);

// 4. Validação direta por ID Token (Google One-Tap / SDK Frontend)
router.post('/google/verify', googleAuthController.verifyIdToken);

// `export =` compila para `module.exports = router` exato. O server.js faz
// `require()` e entrega o valor direto ao Express: com `export default`, o
// require devolveria o módulo e o Express receberia objeto sem `handle`.
export = router;
