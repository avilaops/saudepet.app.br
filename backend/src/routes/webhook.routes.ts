import express from 'express';
const router = express.Router();
const webhookController = require('../controllers/webhook.controller');

/**
 * Rotas de Webhooks
 * 
 * IMPORTANTE:
 * - Essas rotas NÃO devem ter authMiddleware
 * - Gateways fazem requests diretamente
 * - Verificação é feita através de assinaturas
 */


// Mercado Pago webhook  
// URL para configurar no Mercado Pago: https://seudominio.com/api/v1/webhooks/mercadopago/{tenantSlug}
router.post('/mercadopago/:tenantSlug', express.json({ limit: '1mb' }), webhookController.webhookMercadoPago);

// `export =` compila para `module.exports = router` exato. O server.js faz
// `require()` e entrega o valor direto ao Express: com `export default`, o
// require devolveria o módulo e o Express receberia objeto sem `handle`.
export = router;
