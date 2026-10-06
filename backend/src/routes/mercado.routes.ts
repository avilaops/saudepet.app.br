import { Router } from 'express';
import * as mercado from '../controllers/mercado.controller';

const { authMiddleware, isTutor } = require('../middleware/auth.middleware');
const { asyncHandler } = require('../middleware/error.middleware');
const { tenantContext, requireActiveTenant } = require('../middleware/tenant.middleware');
const validate = require('../middleware/validate.middleware');
const {
  criarAssinaturaSchema,
  alterarAssinaturaSchema,
  cancelarAssinaturaSchema,
  sugestaoDeFrequenciaSchema
} = require('../schemas/mercado-assinatura.schema');

/**
 * Saúde Pet Mercado — o lado de quem compra.
 *
 * `isTutor` e não uma permissão nova: desde 26/08/2026 quem pode agir como
 * tutor é tutor OU veterinário, porque o profissional tem cachorro em casa como
 * qualquer pessoa. Comprar ração é exatamente esse tipo de ato.
 *
 * A vitrine exige sessão de propósito. Não é catálogo público de e-commerce: o
 * preço, a loja e a disponibilidade são do TENANT de quem está logado, e servir
 * isso sem sessão obrigaria a inventar um tenant padrão — que é como se vazam
 * dados de uma organização para outra.
 */
const router = Router();

router.use(authMiddleware, tenantContext, requireActiveTenant, isTutor);

// ── Vitrine ───────────────────────────────────────────────────────────────────
router.get('/resumo', asyncHandler(mercado.resumo));
router.get('/categorias', asyncHandler(mercado.categorias));
router.get('/lojas', asyncHandler(mercado.lojas));
router.get('/lojas/:slug', asyncHandler(mercado.loja));
router.get('/produtos', asyncHandler(mercado.produtos));
router.get('/produtos/:id', asyncHandler(mercado.produto));

// ── Carrinho ──────────────────────────────────────────────────────────────────
router.get('/carrinhos', asyncHandler(mercado.meusCarrinhos));
router.post('/carrinhos/itens', asyncHandler(mercado.adicionarAoCarrinho));
router.put('/carrinhos/itens/:produtoId', asyncHandler(mercado.mudarQuantidade));
router.get('/carrinhos/:lojaId', asyncHandler(mercado.carrinhoDaLoja));
router.delete('/carrinhos/:lojaId', asyncHandler(mercado.limparCarrinho));
// Cotação de entrega pela loja: distância, frete e "fora do raio" antes de
// a pessoa escolher como recebe.
router.post('/carrinhos/:lojaId/entrega', asyncHandler(mercado.cotarEntrega));
router.post('/carrinhos/:lojaId/transportadoras', asyncHandler(mercado.cotarTransportadoras));

// ── Pedido ────────────────────────────────────────────────────────────────────
router.post('/pedidos', asyncHandler(mercado.fechar));
router.get('/pedidos', asyncHandler(mercado.meusPedidos));
router.get('/pedidos/:id', asyncHandler(mercado.meuPedido));
router.post('/pedidos/:id/cancelar', asyncHandler(mercado.cancelarMeuPedido));

// A cobrança é um passo à parte do fechamento: o pedido nasce primeiro, com
// estoque reservado e código gerado, e continua de pé se o tutor fechar o app no
// meio do Pix. Sem isso, desistir do pagamento significaria montar o carrinho de
// novo.
router.post('/pedidos/:id/pagamento', asyncHandler(mercado.pagarPedido));
router.get('/pedidos/:id/pagamento', asyncHandler(mercado.statusDoPagamento));

// ── Assinatura de ração ───────────────────────────────────────────────────────
// O ciclo gera um pedido comum e avisa; pagar continua sendo pelo pedido.
router.get('/assinaturas/sugestao', validate(sugestaoDeFrequenciaSchema, 'query'), asyncHandler(mercado.sugerirFrequencia));
router.get('/assinaturas', asyncHandler(mercado.minhasAssinaturas));
router.post('/assinaturas', validate(criarAssinaturaSchema), asyncHandler(mercado.assinar));
router.get('/assinaturas/:id', asyncHandler(mercado.minhaAssinatura));
router.put('/assinaturas/:id', validate(alterarAssinaturaSchema), asyncHandler(mercado.alterarMinhaAssinatura));
router.post('/assinaturas/:id/pausar', asyncHandler(mercado.pausarMinhaAssinatura));
router.post('/assinaturas/:id/retomar', asyncHandler(mercado.retomarMinhaAssinatura));
router.post('/assinaturas/:id/cancelar', validate(cancelarAssinaturaSchema), asyncHandler(mercado.cancelarMinhaAssinatura));
router.post('/assinaturas/:id/pedir-agora', asyncHandler(mercado.pedirAgoraDaAssinatura));

export = router;
