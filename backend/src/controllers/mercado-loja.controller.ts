import type { Request, Response } from 'express';
import prisma from '../config/database';
import { ForbiddenError, ValidationError } from '../middleware/error.middleware';
import {
  atualizarLoja,
  criarLoja,
  enviarParaAnalise,
  minhaLoja
} from '../services/mercado/loja.service';
import {
  atualizarProduto,
  criarProduto,
  desativarProduto,
  listarCategorias,
  listarProdutosDaLoja,
  lojaDoResponsavel
} from '../services/mercado/catalogo.service';
import { margemEfetiva, precoSugerido } from '../services/mercado/comum';
import {
  adicionarFotoDoProduto,
  definirCapaDoProduto,
  MAXIMO_DE_FOTOS,
  removerFotoDoProduto
} from '../services/mercado/imagem-produto.service';
import { baseDoSite, montarFeed } from '../services/mercado/feed.service';
import {
  avancarPelaLoja,
  cancelarPedido,
  linhaDoTempo,
  listarPedidosDaLoja
} from '../services/mercado/pedido.service';
import { avisarMudancaDeStatus } from '../services/mercado/notificacao-mercado.service';
import { listarAssinaturasDaLoja } from '../services/mercado/assinatura.service';
import { emitirEtiquetaDoPedido } from '../services/mercado/postagem.service';

const paymentService = require('../services/payment/payment.service');

/**
 * O Saúde Pet Mercado pelo lado de quem vende.
 *
 * Tudo aqui é feito pela TELA, na conta que a pessoa já tem: cadastrar a
 * empresa, subir o catálogo, enviar para análise, receber pedido, separar e
 * fechar. Não existe caminho paralelo por e-mail para a equipe cadastrar no
 * lugar dela — serviço sem fluxo completo na interface não está entregue.
 *
 * A porta é o vínculo `responsavel_id`, e não um tipo de usuário novo. Quem
 * responde por uma loja continua sendo tutor do próprio cachorro: criar um
 * `tipo_usuario = lojista` obrigaria a mesma pessoa a ter duas contas, que é
 * exatamente o problema que o produto resolveu em 26/08 para o veterinário.
 */

type RequestAutenticada = Request & { userId?: string; tenantId?: string; userType?: string };

const tenantDe = (req: RequestAutenticada) => String(req.tenantId);
const usuarioDe = (req: RequestAutenticada) => String(req.userId);

// ── Cadastro da loja ──────────────────────────────────────────────────────────

export async function minha(req: RequestAutenticada, res: Response) {
  const loja = await minhaLoja(tenantDe(req), usuarioDe(req));
  return res.json({ loja });
}

export async function criar(req: RequestAutenticada, res: Response) {
  const loja = await criarLoja({ tenantId: tenantDe(req), usuarioId: usuarioDe(req), dados: req.body || {} });
  return res.status(201).json({
    loja,
    message: 'Loja criada. Cadastre seus produtos e envie para análise quando estiver pronta.'
  });
}

export async function atualizar(req: RequestAutenticada, res: Response) {
  const loja = await atualizarLoja({ tenantId: tenantDe(req), usuarioId: usuarioDe(req), dados: req.body || {} });
  return res.json({ loja });
}

export async function enviar(req: RequestAutenticada, res: Response) {
  const loja = await enviarParaAnalise({ tenantId: tenantDe(req), usuarioId: usuarioDe(req) });
  return res.json({
    loja,
    message: 'Cadastro enviado. A equipe confere os dados e avisa por e-mail — em geral em até dois dias úteis.'
  });
}

// ── Catálogo ──────────────────────────────────────────────────────────────────

export async function categorias(req: RequestAutenticada, res: Response) {
  return res.json({ categorias: await listarCategorias(tenantDe(req)) });
}

export async function produtos(req: RequestAutenticada, res: Response) {
  const loja = await lojaDoResponsavel(tenantDe(req), usuarioDe(req));
  const lista = await listarProdutosDaLoja({
    tenantId: tenantDe(req),
    lojaId: loja.id,
    busca: (req.query.busca as string) || null,
    // O painel do lojista mostra o inativo de propósito: é justamente o que ele
    // precisa corrigir para o item entrar na vitrine.
    incluirInativos: true
  });

  return res.json({
    produtos: lista,
    resumo: {
      total: lista.length,
      publicados: lista.filter((produto) => produto.ativo && produto.disponivel).length,
      // Contar isto separado evita a pergunta "cadastrei 175 produtos, por que a
      // vitrine mostra 109?".
      sem_preco: lista.filter((produto) => !produto.ativo).length,
      com_pendencia: lista.filter((produto) => Boolean(produto.nota_interna)).length
    }
  });
}

export async function novoProduto(req: RequestAutenticada, res: Response) {
  const produto = await criarProduto({
    tenantId: tenantDe(req),
    usuarioId: usuarioDe(req),
    dados: req.body || {}
  });
  return res.status(201).json({ produto });
}

export async function editarProduto(req: RequestAutenticada, res: Response) {
  const produto = await atualizarProduto({
    tenantId: tenantDe(req),
    usuarioId: usuarioDe(req),
    produtoId: String(req.params.id),
    dados: req.body || {}
  });
  return res.json({ produto });
}

export async function tirarDaVitrine(req: RequestAutenticada, res: Response) {
  const produto = await desativarProduto({
    tenantId: tenantDe(req),
    usuarioId: usuarioDe(req),
    produtoId: String(req.params.id)
  });
  return res.json({ produto });
}

/**
 * Preço sugerido a partir do custo e da margem.
 *
 * A planilha de levantamento fazia essa conta numa coluna; aqui ela responde na
 * tela, para o lojista não precisar de calculadora ao lado do formulário.
 */
export async function sugerirPreco(req: RequestAutenticada, res: Response) {
  // A margem vem do produto quando a loja digitou uma; senão, da prateleira
  // (categoria); e só em último caso do padrão da casa. É a decisão de
  // 27/08/2026: "margem por categoria em vez de 40% fixo".
  const categoriaId = req.query.categoria_id ? String(req.query.categoria_id) : null;
  const categoria = categoriaId
    ? await prisma.categoriaMercado.findFirst({
        where: { id: categoriaId, tenant_id: tenantDe(req) },
        select: { nome: true, margem_padrao_pct: true }
      })
    : null;

  const margemDoProduto = req.query.margem === undefined || req.query.margem === '' ? null : req.query.margem;
  const margem = margemEfetiva(margemDoProduto, categoria?.margem_padrao_pct);
  const origem = margemDoProduto !== null ? 'produto' : categoria?.margem_padrao_pct != null ? 'categoria' : 'padrao';

  return res.json({
    preco_sugerido: precoSugerido(req.query.custo, margem),
    margem_aplicada: margem,
    origem,
    categoria: categoria?.nome || null
  });
}

// ── Fotos ─────────────────────────────────────────────────────────────────────

type RequestComArquivo = RequestAutenticada & {
  file?: { buffer: Buffer; mimetype?: string; size?: number; originalname?: string };
};

export async function subirFoto(req: RequestComArquivo, res: Response) {
  if (!req.file) {
    throw new ValidationError('Envie a foto no campo "foto".');
  }
  const produto = await adicionarFotoDoProduto({
    tenantId: tenantDe(req),
    usuarioId: usuarioDe(req),
    produtoId: String(req.params.id),
    arquivo: req.file
  });
  return res.status(201).json({ produto, maximo: MAXIMO_DE_FOTOS });
}

export async function removerFoto(req: RequestAutenticada, res: Response) {
  const produto = await removerFotoDoProduto({
    tenantId: tenantDe(req),
    usuarioId: usuarioDe(req),
    produtoId: String(req.params.id),
    url: String(req.body?.url || '')
  });
  return res.json({ produto });
}

export async function definirCapa(req: RequestAutenticada, res: Response) {
  const produto = await definirCapaDoProduto({
    tenantId: tenantDe(req),
    usuarioId: usuarioDe(req),
    produtoId: String(req.params.id),
    url: String(req.body?.url || '')
  });
  return res.json({ produto });
}

// ── Catálogo para WhatsApp e Google ───────────────────────────────────────────

/**
 * Onde a loja pega o link do feed e quantos itens ficaram de fora.
 *
 * O WhatsApp Business e o Google Merchant recusam item sem foto; em vez de a
 * pessoa descobrir isso num erro do painel deles, o número aparece aqui, com o
 * caminho para resolver (subir foto no catálogo).
 */
export async function feed(req: RequestAutenticada, res: Response) {
  const loja = await minhaLoja(tenantDe(req), usuarioDe(req));
  if (!loja) throw new ForbiddenError('Você ainda não tem uma loja cadastrada.');

  const [dados, ativos, comFoto] = await Promise.all([
    montarFeed({ tenantId: tenantDe(req), lojaSlug: loja.slug }),
    prisma.produtoMercado.count({ where: { tenant_id: tenantDe(req), loja: { slug: loja.slug }, ativo: true } }),
    prisma.produtoMercado.count({
      where: { tenant_id: tenantDe(req), loja: { slug: loja.slug }, ativo: true, imagem_url: { not: null } }
    })
  ]);

  const base = baseDoSite();
  const noAr = loja.status === 'aprovada';

  return res.json({
    no_ar: noAr,
    status: loja.status,
    vitrine: `${base}/mercado/${loja.slug}`,
    feed: {
      xml: `${base}/api/v1/public/mercado/feed.xml?loja=${encodeURIComponent(loja.slug)}`,
      csv: `${base}/api/v1/public/mercado/feed.csv?loja=${encodeURIComponent(loja.slug)}`
    },
    // Enquanto a loja não está aprovada o feed sai vazio — os números abaixo
    // dizem o que ele TERIA, para a pessoa preparar as fotos antes.
    itens_no_feed: noAr ? dados.itens.length : 0,
    produtos_ativos: ativos,
    com_foto: comFoto,
    sem_foto: Math.max(0, ativos - comFoto)
  });
}

// ── Pedidos ───────────────────────────────────────────────────────────────────

export async function pedidos(req: RequestAutenticada, res: Response) {
  const loja = await lojaDoResponsavel(tenantDe(req), usuarioDe(req));
  const lista = await listarPedidosDaLoja({
    tenantId: tenantDe(req),
    lojaId: loja.id,
    status: (req.query.status as string) || 'abertos',
    limite: Number(req.query.limite) || undefined
  });

  return res.json({ pedidos: lista, loja: { id: loja.id, nome_fantasia: loja.nome_fantasia } });
}

export async function pedido(req: RequestAutenticada, res: Response) {
  const loja = await lojaDoResponsavel(tenantDe(req), usuarioDe(req));

  const encontrado = await prisma.pedidoMercado.findFirst({
    where: { id: String(req.params.id), tenant_id: tenantDe(req), loja_id: loja.id },
    include: {
      itens: true,
      tutor: { select: { id: true, nome: true, telefone: true, email: true } }
    }
  });
  if (!encontrado) throw new ForbiddenError('Pedido não encontrado nesta loja.');

  const eventos = await linhaDoTempo({ tenantId: tenantDe(req), pedidoId: encontrado.id });
  return res.json({ pedido: encontrado, eventos });
}

export async function avancar(req: RequestAutenticada, res: Response) {
  const loja = await lojaDoResponsavel(tenantDe(req), usuarioDe(req));
  const pedidoAtualizado = await avancarPelaLoja({
    tenantId: tenantDe(req),
    lojaId: loja.id,
    pedidoId: String(req.params.id),
    atorId: usuarioDe(req)
  });

  // Só o que muda a vida de quem espera vira aviso — "pronto" avisa, "em
  // separação" não. Avisar de tudo treina a pessoa a ignorar.
  avisarMudancaDeStatus(pedidoAtualizado.id, pedidoAtualizado.status).catch(() => {});

  return res.json({ pedido: pedidoAtualizado });
}

export async function emitirEtiqueta(req: RequestAutenticada, res: Response) {
  const loja = await lojaDoResponsavel(tenantDe(req), usuarioDe(req));
  const pedido = await emitirEtiquetaDoPedido({
    tenantId: tenantDe(req),
    lojaId: loja.id,
    pedidoId: String(req.params.id)
  });
  return res.json({ pedido });
}

export async function cancelar(req: RequestAutenticada, res: Response) {
  const loja = await lojaDoResponsavel(tenantDe(req), usuarioDe(req));
  const resultado = await cancelarPedido({
    tenantId: tenantDe(req),
    pedidoId: String(req.params.id),
    motivo: String(req.body?.motivo || ''),
    atorId: usuarioDe(req),
    atorPapel: 'loja',
    lojaId: loja.id
  });

  // Loja que cancela pedido pago devolve o dinheiro. Não é cortesia: é o que a
  // pessoa pagou por algo que não vai receber.
  if (resultado.estornoDevido && resultado.paymentId) {
    await paymentService
      .refundPayment({
        paymentId: resultado.paymentId,
        reason: `Pedido ${resultado.pedido.codigo} cancelado pela loja`,
        requestedBy: usuarioDe(req),
        tenantId: tenantDe(req)
      })
      .catch((erro: Error) => {
        console.error('❌ [MERCADO] estorno do cancelamento pela loja falhou:', erro.message);
      });
  }

  avisarMudancaDeStatus(resultado.pedido.id, 'cancelado').catch(() => {});

  return res.json({ pedido: resultado.pedido, estorno_solicitado: resultado.estornoDevido });
}

/** O que a loja precisa ver ao abrir o painel: fila, faturamento e pendência. */
export async function painel(req: RequestAutenticada, res: Response) {
  const loja = await lojaDoResponsavel(tenantDe(req), usuarioDe(req));
  const inicioDoMes = new Date();
  inicioDoMes.setDate(1);
  inicioDoMes.setHours(0, 0, 0, 0);

  const [aSeparar, prontos, doMes, produtosAtivos, produtosSemPreco] = await Promise.all([
    prisma.pedidoMercado.count({ where: { loja_id: loja.id, status: { in: ['pago', 'em_separacao'] } } }),
    prisma.pedidoMercado.count({ where: { loja_id: loja.id, status: 'pronto' } }),
    prisma.pedidoMercado.aggregate({
      where: {
        loja_id: loja.id,
        // O que virou dinheiro de verdade: pedido pago que não foi devolvido.
        status: { in: ['pago', 'em_separacao', 'pronto', 'concluido'] },
        pago_em: { gte: inicioDoMes }
      },
      _sum: { total: true, repasse_loja: true, comissao_valor: true },
      _count: true
    }),
    prisma.produtoMercado.count({ where: { loja_id: loja.id, ativo: true } }),
    prisma.produtoMercado.count({ where: { loja_id: loja.id, ativo: false } })
  ]);

  return res.json({
    loja: { id: loja.id, nome_fantasia: loja.nome_fantasia, status: loja.status },
    fila: { a_separar: aSeparar, prontos },
    mes: {
      pedidos: doMes._count,
      faturado: Number(doMes._sum.total || 0),
      a_receber: Number(doMes._sum.repasse_loja || 0),
      comissao: Number(doMes._sum.comissao_valor || 0)
    },
    catalogo: { publicados: produtosAtivos, aguardando_cadastro: produtosSemPreco }
  });
}

// ── Assinantes ────────────────────────────────────────────────────────────────

/** Quem assinou nesta loja, com o quê e quando vem o próximo pedido. */
export async function assinaturas(req: RequestAutenticada, res: Response) {
  const loja = await lojaDoResponsavel(tenantDe(req), usuarioDe(req));
  const lista = await listarAssinaturasDaLoja({ tenantId: tenantDe(req), lojaId: loja.id });
  return res.json({ assinaturas: lista });
}

