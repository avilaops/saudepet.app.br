import { Router } from 'express';
const router = Router();
const notificacaoController = require('../controllers/notificacao.controller');
const { authMiddleware, requireRoles } = require('../middleware/auth.middleware');

router.use(authMiddleware, requireRoles('super_admin'));

// Obter configurações de notificação
router.get('/configuracoes', notificacaoController.obterConfiguracoes);

// Atualizar configurações de notificação
router.put('/configuracoes', notificacaoController.atualizarConfiguracoes);

// `export =` compila para `module.exports = router` exato. O server.js faz
// `require()` e entrega o valor direto ao Express: com `export default`, o
// require devolveria o módulo e o Express receberia objeto sem `handle`.
export = router;
