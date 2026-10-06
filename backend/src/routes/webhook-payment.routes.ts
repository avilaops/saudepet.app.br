import express from 'express';
const router = express.Router();
const webhookPaymentController = require('../controllers/webhook-payment.controller');

// Endpoint público para recebimento de eventos do Asaas (sem authMiddleware)
router.post('/asaas', express.json(), webhookPaymentController.handleAsaasWebhook);

// Mercado Pago — decisão MP-only: cobranças novas nascem aqui.
// URL para o painel do MP: https://saudepet.app.br/api/v1/webhooks/payments/mercadopago
router.post('/mercadopago', express.json(), webhookPaymentController.handleMercadoPagoWebhook);

// `export =` compila para `module.exports = router` exato. O server.js faz
// `require()` e entrega o valor direto ao Express: com `export default`, o
// require devolveria o módulo e o Express receberia objeto sem `handle`.
export = router;
