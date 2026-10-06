import express from 'express';
const controller = require('../controllers/meta-webhook.controller');

const router = express.Router();

/**
 * Webhook único do App "Saúde Pet Brasil" na Meta — recebe tanto eventos de
 * Lead Ads (campo "leadgen") quanto de WhatsApp (campos "messages"/"statuses").
 * Configurar essa mesma URL nos dois produtos no painel da Meta.
 *
 * NÃO tem authMiddleware — a Meta chama direto. Segurança é via assinatura
 * X-Hub-Signature-256 (verificada no controller) + verify_token no GET.
 */
router.get('/', controller.verify);
router.post('/', express.raw({ type: 'application/json', limit: '2mb' }), controller.receive);

// `export =` compila para `module.exports = router` exato. O server.js faz
// `require()` e entrega o valor direto ao Express: com `export default`, o
// require devolveria o módulo e o Express receberia objeto sem `handle`.
export = router;
