import type { Request, Response } from 'express';
import prisma from '../config/database';
import { ConflictError, NotFoundError, ValidationError } from '../middleware/error.middleware';
import { lojaDaVitrine, listarLojasDaVitrine } from '../services/mercado/loja.service';
import { buscarNaVitrine, listarCategorias, produtoDaVitrine } from '../services/mercado/catalogo.service';
import {
  adicionarItem,
  alterarQuantidade,
  contarItens,
  esvaziarCarrinho,
  listarCarrinhos,
  verCarrinho
} from '../services/mercado/carrinho.service';
import {
  cancelarPedido,
  fecharPedido,
  linhaDoTempo,
  listarPedidosDoTutor,
  pedidoDoTutor
} from '../services/mercado/pedido.service';
import { avisarMudancaDeStatus } from '../services/mercado/notificacao-mercado.service';
import {
  alterarAssinatura,
  assinaturaDoTutor,
  cancelarAssinatura,
  criarAssinatura,
  frequenciaSugerida,
  listarAssinaturasDoTutor,
  pausarAssinatura,
  pedirAgora,
  retomarAssinatura
} from '../services/mercado/assinatura.service';
import { cotarEntregaDaLoja } from '../services/mercado/entrega.service';
import { cotarTransportadoras as cotarNaCepCerto } from '../services/mercado/frete-transportadora.service';

const paymentService = require('../services/payment/payment.service');

/**
 * O Saúde Pet Mercado pelo lado de quem compra.
 *
 * A ordem das telas é a da vida real: vejo as lojas da minha cidade, entro numa,
 * encho o carrinho, escolho como recebo, pago, acompanho. Cada passo tem uma
 * rota, e nenhuma delas aceita preço vindo do navegador — o valor é sempre
 * recalculado aqui a partir do catálogo, porque um `amount` no body é um convite
 * a comprar ração de quinze quilos por um real.
 */

type RequestAutenticada = Request & {
  userId?: string;
  tenantId?: string;
  userType?: string;
  /** Preenchido pelo `authMiddleware`. A cidade é o que centra a vitrine. */
  user?: { cidade?: string | null };
};

const tenantDe = (req: RequestAutenticada) => String(req.tenantId);
const usuarioDe = (req: RequestAutenticada) => String(req.userId);

// ── Vitrine ───────────────────────────────────────────────────────────────────

export async function categorias(req: RequestAutenticada, res: Response) {
  return res.json({ categorias: await listarCategorias(tenantDe(req)) });
}

export async function lojas(req: RequestAutenticada, res: Response) {
  const lista = await listarLojasDaVitrine({
    tenantId: tenantDe(req),
    // Sem cidade explícita, vale a do próprio tutor: uma vitrine nacional numa
    // operação de retirada no balcão é uma lista de lugares aonde ele não vai.
    cidade: (req.query.cidade as string) ?? req.user?.cidade ?? null,
    busca: (req.query.busca as string) || null,
    limite: Number(req.query.limite) || undefined
  });

  return res.json({ lojas: lista });
}

export async function loja(req: RequestAutenticada, res: Response) {
  const encontrada = await lojaDaVitrine({ tenantId: tenantDe(req), slugOuId: String(req.params.slug) });
  return res.json({ loja: encontrada });
}

export async function produtos(req: RequestAutenticada, res: Response) {
  const resultado = await buscarNaVitrine({
    tenantId: tenantDe(req),
    busca: (req.query.busca as string) || null,
    categoriaSlug: (req.query.categoria as string) || null,
    lojaId: (req.query.loja as string) || null,
    cidade: (req.query.cidade as string) || null,
    especie: (req.query.especie as string) || null,
    limite: Number(req.query.limite) || undefined,
    pagina: Number(req.query.pagina) || undefined
  });

  return res.json(resultado);
}

export async function produto(req: RequestAutenticada, res: Response) {
  const encontrado = await produtoDaVitrine({ tenantId: tenantDe(req), produtoId: String(req.params.id) });
  return res.json({ produto: encontrado });
}

// ── Carrinho ──────────────────────────────────────────────────────────────────

export async function meusCarrinhos(req: RequestAutenticada, res: Response) {
  const [carrinhos, total] = await Promise.all([
    listarCarrinhos(tenantDe(req), usuarioDe(req)),
    contarItens(tenantDe(req), usuarioDe(req))
  ]);
  return res.json({ carrinhos, total_itens: total });
}

export async function carrinhoDaLoja(req: RequestAutenticada, res: Response) {
  const carrinho = await verCarrinho({
    tenantId: tenantDe(req),
    tutorId: usuarioDe(req),
    lojaId: String(req.params.lojaId)
  });
  return res.json({ carrinho });
}

export async function adicionarAoCarrinho(req: RequestAutenticada, res: Response) {
  const carrinho = await adicionarItem({
    tenantId: tenantDe(req),
    tutorId: usuarioDe(req),
    produtoId: String(req.body?.produto_id || ''),
    quantidade: Number(req.body?.quantidade ?? 1)
  });
  return res.status(201).json({ carrinho });
}

export async function mudarQuantidade(req: RequestAutenticada, res: Response) {
  const carrinho = await alterarQuantidade({
    tenantId: tenantDe(req),
    tutorId: usuarioDe(req),
    produtoId: String(req.params.produtoId),
    quantidade: Number(req.body?.quantidade)
  });
  return res.json({ carrinho });
}

/**
 * Quanto custa a loja levar até este endereço.
 *
 * Responde ANTES de a pessoa escolher: o frete e o "fora do raio" aparecem no
 * carrinho, não na tela de pagamento. A mesma função que responde aqui é a que
 * o fechamento usa para cobrar — então o número mostrado é o número cobrado.
 */
export async function cotarEntrega(req: RequestAutenticada, res: Response) {
  const carrinho = await verCarrinho({
    tenantId: tenantDe(req),
    tutorId: usuarioDe(req),
    lojaId: String(req.params.lojaId)
  });
  if (!carrinho) throw new NotFoundError('Carrinho não encontrado.');

  const cotacao = await cotarEntregaDaLoja({
    tenantId: tenantDe(req),
    lojaId: String(req.params.lojaId),
    latitude: req.body?.latitude,
    longitude: req.body?.longitude,
    subtotal: carrinho.subtotal
  });

  return res.json({ cotacao, subtotal: carrinho.subtotal });
}

/** PAC, SEDEX, Jadlog e Loggi para o CEP informado, sempre calculados no servidor. */
export async function cotarTransportadoras(req: RequestAutenticada, res: Response) {
  const carrinho = await verCarrinho({
    tenantId: tenantDe(req),
    tutorId: usuarioDe(req),
    lojaId: String(req.params.lojaId)
  });
  if (!carrinho) throw new NotFoundError('Carrinho não encontrado.');
  const resultado = await cotarNaCepCerto({ carrinho, cepDestino: req.body?.cep });
  return res.json(resultado);
}

export async function limparCarrinho(req: RequestAutenticada, res: Response) {
  const resultado = await esvaziarCarrinho({
    tenantId: tenantDe(req),
    tutorId: usuarioDe(req),
    lojaId: String(req.params.lojaId)
  });
  return res.json(resultado);
}

// ── Pedido ────────────────────────────────────────────────────────────────────

export async function fechar(req: RequestAutenticada, res: Response) {
  const pedido = await fecharPedido({
    tenantId: tenantDe(req),
    tutorId: usuarioDe(req),
    lojaId: String(req.body?.loja_id || ''),
    entregaTipo: String(req.body?.entrega_tipo || 'retirada'),
    endereco: req.body?.endereco || null,
    freteServico: req.body?.frete_servico || null,
    observacao: req.body?.observacao || null
  });

  return res.status(201).json({ pedido });
}

export async function meusPedidos(req: RequestAutenticada, res: Response) {
  const pedidos = await listarPedidosDoTutor({
    tenantId: tenantDe(req),
    tutorId: usuarioDe(req),
    limite: Number(req.query.limite) || undefined
  });
  return res.json({ pedidos });
}

export async function meuPedido(req: RequestAutenticada, res: Response) {
  const pedido = await pedidoDoTutor({
    tenantId: tenantDe(req),
    tutorId: usuarioDe(req),
    pedidoId: String(req.params.id)
  });

  const eventos = await linhaDoTempo({ tenantId: tenantDe(req), pedidoId: pedido.id });
  return res.json({ pedido, eventos });
}

export async function cancelarMeuPedido(req: RequestAutenticada, res: Response) {
  const resultado = await cancelarPedido({
    tenantId: tenantDe(req),
    pedidoId: String(req.params.id),
    motivo: String(req.body?.motivo || ''),
    atorId: usuarioDe(req),
    atorPapel: 'tutor',
    tutorId: usuarioDe(req)
  });

  // Cancelar pedido pago sem devolver o dinheiro seria ficar com o que não é
  // nosso. O estorno roda depois da transição — se o gateway falhar, o pedido
  // já está cancelado e o estoque já voltou; o estorno pendente aparece para o
  // admin em /admin/financeiro, que é onde ele é resolvido hoje.
  if (resultado.estornoDevido && resultado.paymentId) {
    await paymentService
      .refundPayment({
        paymentId: resultado.paymentId,
        reason: `Pedido ${resultado.pedido.codigo} cancelado pelo tutor`,
        requestedBy: usuarioDe(req),
        tenantId: tenantDe(req)
      })
      .catch((erro: Error) => {
        console.error('❌ [MERCADO] estorno do cancelamento falhou:', erro.message);
      });
  }

  avisarMudancaDeStatus(resultado.pedido.id, 'cancelado').catch(() => {});

  return res.json({ pedido: resultado.pedido, estorno_solicitado: resultado.estornoDevido });
}

// ── Pagamento ─────────────────────────────────────────────────────────────────

/**
 * Gera a cobrança de um pedido.
 *
 * Separado do fechamento de propósito: o pedido nasce primeiro, com estoque
 * reservado e código gerado, e só então vira cobrança. Assim o tutor que fecha
 * o Pix e volta amanhã encontra o pedido de pé para pagar de novo, em vez de
 * ter de montar o carrinho outra vez.
 *
 * O valor NUNCA vem do navegador: é `pedido.total`, calculado no fechamento a
 * partir do catálogo.
 */
export async function pagarPedido(req: RequestAutenticada, res: Response) {
  const metodo = String(req.body?.method || 'PIX').toUpperCase();
  const cardToken = req.body?.cardToken ? String(req.body.cardToken) : undefined;

  if (metodo === 'CREDIT_CARD' && !cardToken) {
    throw new ValidationError('Pagamento com cartão exige o token gerado no navegador.');
  }

  const pedido = await prisma.pedidoMercado.findFirst({
    where: { id: String(req.params.id), tenant_id: tenantDe(req), tutor_id: usuarioDe(req) },
    select: {
      id: true,
      codigo: true,
      status: true,
      total: true,
      comissao_valor: true,
      repasse_loja: true,
      loja: { select: { id: true, nome_fantasia: true, gateway_recebedor_id: true } }
    }
  });
  if (!pedido) throw new NotFoundError('Pedido não encontrado.');

  if (pedido.status !== 'aguardando_pagamento' && pedido.status !== 'pagamento_falhou') {
    throw new ConflictError(`Este pedido está ${pedido.status} e não espera pagamento.`);
  }

  // Cobrança viva do mesmo pedido é reaproveitada: gerar outra criaria dois Pix
  // abertos para a mesma compra, e o tutor pagaria o que tivesse à mão.
  const existente = await prisma.payment.findFirst({
    where: {
      tenant_id: tenantDe(req),
      pedido_mercado_id: pedido.id,
      status: { in: ['PAID', 'CREATED', 'PENDING', 'PROCESSING', 'AUTHORIZED'] }
    },
    orderBy: { criado_em: 'desc' }
  });

  if (existente) {
    return res.json({ reaproveitada: true, payment: existente });
  }

  const payment = await paymentService.createPaymentIntent({
    tenantId: tenantDe(req),
    tutorId: usuarioDe(req),
    method: metodo,
    amount: Number(pedido.total),
    cardToken,
    cardDetails: req.body?.parcelas ? { installments: Number(req.body.parcelas) } : undefined,
    pedidoMercadoId: pedido.id,
    descricao: `Saúde Pet Mercado ${pedido.codigo} — ${pedido.loja.nome_fantasia}`,
    recebedorMercado: {
      lojaId: pedido.loja.id,
      providerRecipientId: pedido.loja.gateway_recebedor_id,
      repasse: Number(pedido.repasse_loja),
      comissao: Number(pedido.comissao_valor)
    }
  });

  await prisma.pedidoMercado.update({ where: { id: pedido.id }, data: { payment_id: payment.id } });

  return res.status(201).json({ payment });
}

/** Situação da cobrança de um pedido, para a tela do Pix conferir sem socket. */
export async function statusDoPagamento(req: RequestAutenticada, res: Response) {
  const pedido = await prisma.pedidoMercado.findFirst({
    where: { id: String(req.params.id), tenant_id: tenantDe(req), tutor_id: usuarioDe(req) },
    select: { id: true, status: true, payment_id: true }
  });
  if (!pedido) throw new NotFoundError('Pedido não encontrado.');

  const payment = pedido.payment_id
    ? await prisma.payment.findFirst({
        where: { id: pedido.payment_id, tenant_id: tenantDe(req) },
        select: {
          id: true,
          status: true,
          method: true,
          amount: true,
          pix_copy_paste: true,
          pix_qr_code_ref: true,
          expires_at: true,
          paid_at: true
        }
      })
    : null;

  return res.json({ pedido_status: pedido.status, payment });
}

/** Quantos itens estão em carrinho aberto — o selo da barra do mercado. */
export async function resumo(req: RequestAutenticada, res: Response) {
  const [itens, pedidosAbertos] = await Promise.all([
    contarItens(tenantDe(req), usuarioDe(req)),
    prisma.pedidoMercado.count({
      where: {
        tenant_id: tenantDe(req),
        tutor_id: usuarioDe(req),
        status: { in: ['aguardando_pagamento', 'pago', 'em_separacao', 'pronto'] }
      }
    })
  ]);

  return res.json({ itens_no_carrinho: itens, pedidos_abertos: pedidosAbertos });
}

// ── Assinatura de ração ───────────────────────────────────────────────────────

/** Quantos dias um saco dura para este pet — a sugestão que a tela mostra antes de assinar. */
export async function sugerirFrequencia(req: RequestAutenticada, res: Response) {
  const produto = await prisma.produtoMercado.findFirst({
    where: { id: String(req.query.produto_id || ''), tenant_id: tenantDe(req) },
    select: { peso_gramas: true }
  });
  if (!produto) throw new NotFoundError('Produto não encontrado.');

  const petId = String(req.query.pet_id || '');
  const pet = petId
    ? await prisma.pet.findFirst({
        where: { id: petId, tenant_id: tenantDe(req), tutor_id: usuarioDe(req) },
        select: { porte: true, tipo: true, especie: true }
      })
    : null;

  const sugestao = frequenciaSugerida({
    especie: pet?.especie || pet?.tipo,
    porte: pet?.porte,
    pesoGramas: produto.peso_gramas,
    quantidade: Number(req.query.quantidade) || 1
  });
  return res.json({ sugestao });
}

export async function assinar(req: RequestAutenticada, res: Response) {
  const resultado = await criarAssinatura({
    tenantId: tenantDe(req),
    tutorId: usuarioDe(req),
    itens: Array.isArray(req.body?.itens) ? req.body.itens : [],
    frequenciaDias: req.body?.frequencia_dias,
    petId: req.body?.pet_id,
    entregaTipo: req.body?.entrega_tipo,
    endereco: req.body?.endereco || null,
    observacao: req.body?.observacao,
    gerarPrimeiroCiclo: req.body?.gerar_primeiro_ciclo !== false
  });
  return res.status(201).json(resultado);
}

export async function minhasAssinaturas(req: RequestAutenticada, res: Response) {
  const assinaturas = await listarAssinaturasDoTutor({ tenantId: tenantDe(req), tutorId: usuarioDe(req) });
  return res.json({ assinaturas });
}

export async function minhaAssinatura(req: RequestAutenticada, res: Response) {
  const assinatura = await assinaturaDoTutor({
    tenantId: tenantDe(req),
    tutorId: usuarioDe(req),
    assinaturaId: String(req.params.id)
  });
  const pedidos = await prisma.pedidoMercado.findMany({
    where: { assinatura_id: assinatura.id, tenant_id: tenantDe(req) },
    select: { id: true, codigo: true, status: true, total: true, criado_em: true, pago_em: true, expira_em: true },
    orderBy: { criado_em: 'desc' },
    take: 12
  });
  return res.json({ assinatura, pedidos });
}

export async function alterarMinhaAssinatura(req: RequestAutenticada, res: Response) {
  const assinatura = await alterarAssinatura({
    tenantId: tenantDe(req),
    tutorId: usuarioDe(req),
    assinaturaId: String(req.params.id),
    frequenciaDias: req.body?.frequencia_dias,
    quantidades: Array.isArray(req.body?.itens) ? req.body.itens : []
  });
  return res.json({ assinatura });
}

export async function pausarMinhaAssinatura(req: RequestAutenticada, res: Response) {
  const assinatura = await pausarAssinatura({ tenantId: tenantDe(req), tutorId: usuarioDe(req), assinaturaId: String(req.params.id) });
  return res.json({ assinatura });
}

export async function retomarMinhaAssinatura(req: RequestAutenticada, res: Response) {
  const assinatura = await retomarAssinatura({ tenantId: tenantDe(req), tutorId: usuarioDe(req), assinaturaId: String(req.params.id) });
  return res.json({ assinatura });
}

export async function cancelarMinhaAssinatura(req: RequestAutenticada, res: Response) {
  const assinatura = await cancelarAssinatura({
    tenantId: tenantDe(req),
    tutorId: usuarioDe(req),
    assinaturaId: String(req.params.id),
    motivo: req.body?.motivo
  });
  return res.json({ assinatura });
}

export async function pedirAgoraDaAssinatura(req: RequestAutenticada, res: Response) {
  const resultado = await pedirAgora({ tenantId: tenantDe(req), tutorId: usuarioDe(req), assinaturaId: String(req.params.id) });
  return res.status(201).json(resultado);
}

