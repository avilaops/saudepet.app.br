import { Router } from 'express';
const router = Router();
const solicitacaoController = require('../controllers/solicitacao.controller');
const buscaController = require('../controllers/busca.controller');
const midiaController = require('../controllers/midia-atendimento.controller');
const avaliacaoDoTutorController = require('../controllers/avaliacao-do-tutor.controller');
const videochamadaController = require('../controllers/videochamada.controller');
const gravacaoController = require('../controllers/gravacao-chamada.controller');
const cancelamentoController = require('../controllers/cancelamento.controller');
const escolhaController = require('../controllers/escolha-de-veterinario.controller');
const ditadoProntuarioController = require('../controllers/ditado-prontuario.controller');
const { uploadMidiaAtendimento, uploadDitadoProntuario } = require('../middleware/upload.middleware');
const { authMiddleware, isTutor, isVeterinario, requireApprovedVeterinarian } = require('../middleware/auth.middleware');
const { tenantContext, requireActiveTenant } = require('../middleware/tenant.middleware');
const validate = require('../middleware/validate.middleware');
const { asyncHandler } = require('../middleware/error.middleware');
const { createSolicitacaoSchema, updateStatusSchema, updatePrescriptionSchema } = require('../schemas/solicitacao.schema');
const { finalizarAtendimentoSchema } = require('../schemas/prontuario.schema');

// Rotas do tutor
router.use(authMiddleware, tenantContext, requireActiveTenant);

router.post('/', isTutor, validate(createSolicitacaoSchema), solicitacaoController.create);
// Vitrine de profissionais para os tipos sem pressa (vacinação, avaliação,
// consulta de rotina). Em emergência a resposta diz que não há escolha — e a
// tela nem mostra a lista.
router.get('/profissionais', isTutor, asyncHandler(escolhaController.listar));
router.get('/tutor/lista', isTutor, solicitacaoController.listarDoTutor);
router.get('/tutor/ativa', isTutor, solicitacaoController.buscarAtiva);
// Cancelamento pelo tutor. A tela chamava esta rota desde sempre e ela nunca
// existiu — sem ela, um chamado sem resposta travava o tutor para sempre.
// O que acontece com o dinheiro se cancelar agora. A tela pergunta ANTES de
// mostrar o botão: ninguém deve descobrir a taxa depois de confirmar.
router.get('/:id/cancelamento', asyncHandler(cancelamentoController.previa));
router.put('/:id/cancelar', isTutor, solicitacaoController.cancelar);
// Busca encerrada por falta de plantonista: o tutor manda procurar de novo sem
// recomeçar o formulário.
router.post('/:id/retomar-busca', isTutor, asyncHandler(buscaController.retomar));

// Mídia do atendimento — foto, vídeo ou áudio.
//
// O TUTOR anexa ao pedir socorro: é o que o veterinário olha antes de aceitar.
// O VETERINÁRIO anexa durante a consulta: é o registro clínico que permite
// comparar no retorno. O papel sai do token, não do corpo.
//
// A leitura é conferida dentro do controller: participantes e admin sempre, e
// os veterinários aprovados do tenant enquanto ninguém aceitou o chamado.
// Avaliação nas duas direções. O tutor avalia por `/avaliacoes`, que já
// existia; aqui é o lado que faltava — o profissional avalia a experiência de
// ter atendido ali: endereço certo, alguém para receber, pet contido.
router.get('/:id/avaliacoes', asyncHandler(avaliacaoDoTutorController.listar));
router.post(
  '/:id/avaliar-tutor',
  isVeterinario,
  requireApprovedVeterinarian,
  asyncHandler(avaliacaoDoTutorController.avaliar)
);

// Videochamada da teleorientação: o navegador pega aqui os servidores de
// conexão e a confirmação de que a chamada pode ser aberta.
router.get('/:id/chamada', asyncHandler(videochamadaController.configuracao));

// Gravação da chamada — SÓ ESCRITA, e só de quem participa.
//
// Não existe rota de leitura aqui de propósito: nem o tutor nem o veterinário
// ouvem o que foi gravado. Quem lê é a moderação, por `/admin/gravacoes`, com
// motivo registrado. Se um dia aparecer um GET nesta altura do arquivo, é
// porque alguém entendeu a gravação como conteúdo do produto — e não é.
router.post('/:id/chamada/gravacao', asyncHandler(gravacaoController.abrir));

router.get('/:id/midias', asyncHandler(midiaController.listar));
router.post(
  '/:id/midias',
  uploadMidiaAtendimento.single('arquivo'),
  asyncHandler(midiaController.anexar)
);
router.delete('/:id/midias/:midiaId', asyncHandler(midiaController.remover));

// Rotas do veterinário ou tutor (genérica)
router.get('/', solicitacaoController.listar);

// Rotas do veterinário
// Chamados esperando alguém aceitar, do mais perto ao mais longe. O
// controller existia sem rota: quem abrisse o app depois do chamado nascer
// não via nada — só chegava pelo socket, para quem estivesse com a tela
// aberta naquele exato segundo.
router.get('/veterinario/disponiveis', isVeterinario, requireApprovedVeterinarian, solicitacaoController.listarDisponiveis);
router.get('/veterinario/lista', isVeterinario, requireApprovedVeterinarian, solicitacaoController.listarDoVeterinario);
router.get('/veterinario/por-status', isVeterinario, requireApprovedVeterinarian, solicitacaoController.porStatusVeterinario);
router.put('/:id/aceitar', isVeterinario, requireApprovedVeterinarian, solicitacaoController.aceitar);
router.put('/:id/recusar', isVeterinario, requireApprovedVeterinarian, solicitacaoController.recusar);
// Desistência depois de aceitar. `cancelado_vet` existia na máquina de estados
// e nenhuma tela o alcançava: o vet que não pudesse ir deixava o chamado preso
// e o tutor esperando alguém que não vinha.
router.put('/:id/desistir', isVeterinario, requireApprovedVeterinarian, solicitacaoController.desistir);
router.put('/:id/encaminhar-emergencia', isVeterinario, requireApprovedVeterinarian, solicitacaoController.encaminharEmergencia);
router.put('/:id/iniciar', isVeterinario, requireApprovedVeterinarian, solicitacaoController.iniciar);
router.put('/:id/finalizar', isVeterinario, requireApprovedVeterinarian, validate(finalizarAtendimentoSchema), solicitacaoController.finalizar);
router.put('/:id/status', isVeterinario, requireApprovedVeterinarian, validate(updateStatusSchema), solicitacaoController.atualizarStatus);
router.put('/:id/location', isVeterinario, requireApprovedVeterinarian, solicitacaoController.updateLiveLocation);
router.put('/:id/prescricao', isVeterinario, requireApprovedVeterinarian, validate(updatePrescriptionSchema), solicitacaoController.atualizarPrescricao);
// Ditado do prontuário: transcreve o áudio e devolve o texto — não grava nada,
// quem confirma é o fechamento normal em `/:id/finalizar`.
router.post(
  '/:id/ditar-prontuario',
  isVeterinario,
  requireApprovedVeterinarian,
  uploadDitadoProntuario.single('audio'),
  ditadoProntuarioController.ditar
);

// Rotas compartilhadas
router.get('/:id/timeline', solicitacaoController.timeline);
// Acervo de arquivos do atendimento, montado a partir dos anexos do chat.
router.get('/:id/anexos', solicitacaoController.anexos);
router.get('/:id/prontuario', solicitacaoController.prontuario);
router.get('/:id/historico-do-pet', solicitacaoController.historicoDoPet);
router.get('/:id', solicitacaoController.buscarPorId);

// `export =` compila para `module.exports = router` exato. O server.js faz
// `require()` e entrega o valor direto ao Express: com `export default`, o
// require devolveria o módulo e o Express receberia objeto sem `handle`.
export = router;
