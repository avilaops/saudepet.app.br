import { Router } from 'express';
const router = Router();
const pdfController = require('../controllers/pdf.controller');
const { authMiddleware, isVeterinario } = require('../middleware/auth.middleware');
const { tenantContext } = require('../middleware/tenant.middleware');

// Estas duas rotas estavam SEM autenticação: qualquer pessoa na internet podia
// gerar um PDF com conteúdo arbitrário e receber uma URL do nosso CDN — papel
// timbrado de receita veterinária, inclusive. Receita e prontuário são atos do
// veterinário, então é o veterinário quem pode emitir.
router.use(authMiddleware, tenantContext, isVeterinario);

router.post('/receita', pdfController.gerarReceita);
router.post('/prontuario', pdfController.gerarProntuario);

// `export =` compila para `module.exports = router` exato. O server.js faz
// `require()` e entrega o valor direto ao Express: com `export default`, o
// require devolveria o módulo e o Express receberia objeto sem `handle`.
export = router;
