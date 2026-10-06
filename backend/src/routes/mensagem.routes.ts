import { Router } from 'express';
const router = Router();
const mensagemController = require('../controllers/mensagem.controller');
const { authMiddleware } = require('../middleware/auth.middleware');
const { tenantContext, requireActiveTenant } = require('../middleware/tenant.middleware');
const validate = require('../middleware/validate.middleware');
const { uploadAnexoChat } = require('../middleware/upload.middleware');
const { enviarMensagemSchema, editarMensagemSchema } = require('../schemas/mensagem.schema');

// Todas as rotas exigem autenticação
router.use(authMiddleware);
router.use(tenantContext);
router.use(requireActiveTenant);

// Enviar nova mensagem. O multer ignora requisição que não seja multipart, então
// o envio de texto puro em JSON continua funcionando como antes.
router.post('/', uploadAnexoChat.single('arquivo'), validate(enviarMensagemSchema), mensagemController.enviar);

// Listar mensagens por solicitação (deve vir ANTES de /conversas para não conflitar)
router.get('/', mensagemController.listarPorSolicitacao);

// Listar todas as conversas do usuário
router.get('/conversas', mensagemController.listarConversas);

// Listar contatos disponíveis para iniciar uma conversa nova
router.get('/contatos', mensagemController.listarContatos);

// Listar mensagens de uma conversa específica
router.get('/conversa/:outroUsuarioId', mensagemController.buscarMensagens);

// Marcar mensagem específica como lida
router.put('/:id/lida', mensagemController.marcarLida);

// Histórico de edições da mensagem (versões anteriores preservadas)
router.get('/:id/historico', mensagemController.historico);

// Editar e excluir: edição arquiva a versão anterior, exclusão é lógica
router.put('/:id', validate(editarMensagemSchema), mensagemController.editar);
router.delete('/:id', mensagemController.excluir);

// `export =` compila para `module.exports = router` exato. O server.js faz
// `require()` e entrega o valor direto ao Express: com `export default`, o
// require devolveria o módulo e o Express receberia objeto sem `handle`.
export = router;
