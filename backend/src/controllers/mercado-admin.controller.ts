import type { Request, Response } from 'express';
import prisma from '../config/database';
import { ValidationError } from '../middleware/error.middleware';
import type { Prisma } from '@prisma/client';
import { decidirSobreLoja, listarLojasParaAdmin } from '../services/mercado/loja.service';
import { atualizarCategoria, criarCategoria, listarCategoriasParaAdmin } from '../services/mercado/catalogo.service';
import { marcarComoReembolsado } from '../services/mercado/pedido.service';
import { avisarDecisaoDaLoja } from '../services/mercado/notificacao-mercado.service';

const AuditService = require('../services/audit.service');

/**
 * O Saúde Pet Mercado pelo lado de quem responde pela plataforma.
 *
 * Duas responsabilidades, e as duas pesam: decidir QUEM pode vender aqui dentro
 * — parte do catálogo é medicamento de uso animal — e enxergar o dinheiro que
 * passou, com a comissão separada do que é da loja.
 *
 * Aprovar, recusar e suspender loja são atos irreversíveis na prática (mexem no
 * ganha-pão de alguém), então cada um deles grava evento pericial com estado
 * anterior e posterior, como as outras onze ações que a auditoria já tranca.
 */

type RequestAutenticada = Request & { userId?: string; tenantId?: string; userType?: string };

const tenantDe = (req: RequestAutenticada) => String(req.tenantId);

export async function lojas(req: RequestAutenticada, res: Response) {
  const lista = await listarLojasParaAdmin({
    tenantId: tenantDe(req),
    status: (req.query.status as string) || null
  });

  return res.json({
    lojas: lista,
    // A fila de trabalho da equipe fica à vista, para "pendente" não virar uma
    // aba que ninguém abre.
    pendentes: lista.filter((loja) => loja.status === 'pendente').length
  });
}

export async function decidir(req: RequestAutenticada, res: Response) {
  const decisao = String(req.body?.decisao || '');
  if (!['aprovada', 'recusada', 'suspensa'].includes(decisao)) {
    throw new ValidationError('Decisão inválida. Use "aprovada", "recusada" ou "suspensa".');
  }

  const antes = await prisma.lojaMercado.findFirst({
    where: { id: String(req.params.id), tenant_id: tenantDe(req) },
    select: { status: true, comissao_pct: true, nome_fantasia: true }
  });

  const resultado = await decidirSobreLoja({
    tenantId: tenantDe(req),
    lojaId: String(req.params.id),
    decisao: decisao as 'aprovada' | 'recusada' | 'suspensa',
    motivo: req.body?.motivo ?? null,
    adminId: String(req.userId),
    comissaoPct: req.body?.comissao_pct ?? null
  });

  await AuditService.logForensicEvent({
    req,
    entityType: 'LojaMercado',
    entityId: String(req.params.id),
    action: `MERCADO_LOJA_${decisao.toUpperCase()}`,
    estadoAnterior: antes,
    estadoPosterior: { status: decisao, comissao_pct: resultado.loja.comissao_pct },
    motivo: req.body?.motivo ?? null
  }).catch(() => {});

  avisarDecisaoDaLoja({
    responsavelId: resultado.responsavelId,
    nomeDaLoja: resultado.nome,
    decisao: decisao as 'aprovada' | 'recusada' | 'suspensa',
    motivo: req.body?.motivo ?? null
  }).catch(() => {});

  return res.json({ loja: resultado.loja });
}

export async function categorias(req: RequestAutenticada, res: Response) {
  return res.json({ categorias: await listarCategoriasParaAdmin(tenantDe(req)) });
}

export async function novaCategoria(req: RequestAutenticada, res: Response) {
  const categoria = await criarCategoria({
    tenantId: tenantDe(req),
    nome: String(req.body?.nome || ''),
    icone: req.body?.icone ?? null,
    ordem: Number(req.body?.ordem) || 0,
    margemPadraoPct: req.body?.margem_padrao_pct ?? null
  });
  return res.status(201).json({ categoria });
}

/**
 * A margem padrão da prateleira mora aqui. Mudar de 40% fixo para "ração 25%,
 * acessório 60%" é uma edição nesta tela, não um deploy.
 */
export async function editarCategoria(req: RequestAutenticada, res: Response) {
  const categoria = await atualizarCategoria({
    tenantId: tenantDe(req),
    categoriaId: String(req.params.id),
    dados: {
      nome: req.body?.nome,
      icone: req.body?.icone,
      ordem: req.body?.ordem,
      ativo: req.body?.ativo,
      margem_padrao_pct: req.body?.margem_padrao_pct
    }
  });
  return res.json({ categoria });
}

export async function pedidos(req: RequestAutenticada, res: Response) {
  const where: Record<string, unknown> = { tenant_id: tenantDe(req) };
  if (req.query.status) where.status = String(req.query.status);
  if (req.query.loja) where.loja_id = String(req.query.loja);

  const pedidos = await prisma.pedidoMercado.findMany({
    where,
    select: {
      id: true,
      codigo: true,
      status: true,
      total: true,
      comissao_valor: true,
      repasse_loja: true,
      pago_em: true,
      criado_em: true,
      loja: { select: { id: true, nome_fantasia: true } },
      tutor: { select: { id: true, nome: true } },
      _count: { select: { itens: true } }
    },
    orderBy: { criado_em: 'desc' },
    take: Math.min(Math.max(Number(req.query.limite) || 50, 1), 200)
  });

  return res.json({ pedidos });
}

/**
 * O que o mercado movimentou no mês.
 *
 * `faturado` é o que os tutores pagaram; `comissao` é o que fica com a
 * plataforma; `a_repassar` é o que pertence às lojas. Os três aparecem juntos
 * porque só o primeiro, sozinho, dá a impressão errada de receita.
 */
export async function resumoFinanceiro(req: RequestAutenticada, res: Response) {
  const inicioDoMes = new Date();
  inicioDoMes.setDate(1);
  inicioDoMes.setHours(0, 0, 0, 0);

  // O que virou dinheiro de verdade: pedido pago que não foi cancelado nem
  // devolvido. `aguardando_pagamento` não entra — cobrança gerada não é receita.
  const pagos: Prisma.EnumStatusPedidoMercadoFilter = {
    in: ['pago', 'em_separacao', 'pronto', 'concluido']
  };

  const [mes, total, lojasAtivas, porLoja] = await Promise.all([
    prisma.pedidoMercado.aggregate({
      where: { tenant_id: tenantDe(req), status: pagos, pago_em: { gte: inicioDoMes } },
      _sum: { total: true, comissao_valor: true, repasse_loja: true },
      _count: true
    }),
    prisma.pedidoMercado.aggregate({
      where: { tenant_id: tenantDe(req), status: pagos },
      _sum: { total: true, comissao_valor: true },
      _count: true
    }),
    prisma.lojaMercado.count({ where: { tenant_id: tenantDe(req), status: 'aprovada' } }),
    prisma.pedidoMercado.groupBy({
      by: ['loja_id'],
      where: { tenant_id: tenantDe(req), status: pagos, pago_em: { gte: inicioDoMes } },
      _sum: { total: true, repasse_loja: true, comissao_valor: true },
      _count: true
    })
  ]);

  const nomes = await prisma.lojaMercado.findMany({
    where: { id: { in: porLoja.map((linha) => linha.loja_id) } },
    select: { id: true, nome_fantasia: true }
  });
  const nomePorId = new Map(nomes.map((loja) => [loja.id, loja.nome_fantasia]));

  return res.json({
    mes: {
      pedidos: mes._count,
      faturado: Number(mes._sum?.total || 0),
      comissao: Number(mes._sum?.comissao_valor || 0),
      a_repassar: Number(mes._sum?.repasse_loja || 0)
    },
    acumulado: {
      pedidos: total._count,
      faturado: Number(total._sum?.total || 0),
      comissao: Number(total._sum?.comissao_valor || 0)
    },
    lojas_ativas: lojasAtivas,
    por_loja: porLoja
      .map((linha) => ({
        loja_id: linha.loja_id,
        nome: nomePorId.get(linha.loja_id) || 'Loja removida',
        pedidos: linha._count,
        faturado: Number(linha._sum?.total || 0),
        a_repassar: Number(linha._sum?.repasse_loja || 0),
        comissao: Number(linha._sum?.comissao_valor || 0)
      }))
      .sort((a, b) => b.faturado - a.faturado)
  });
}

/**
 * Marcar pedido como reembolsado.
 *
 * O estorno em si sai pelo fluxo de pagamentos que já existe (/admin/financeiro);
 * aqui só carimbamos o pedido, para a loja e o tutor verem o mesmo estado que o
 * financeiro vê.
 */
export async function reembolsar(req: RequestAutenticada, res: Response) {
  const pedido = await marcarComoReembolsado({
    pedidoId: String(req.params.id),
    motivo: req.body?.motivo ?? null
  });

  await AuditService.logForensicEvent({
    req,
    entityType: 'PedidoMercado',
    entityId: String(req.params.id),
    action: 'MERCADO_PEDIDO_REEMBOLSADO',
    motivo: req.body?.motivo ?? null
  }).catch(() => {});

  return res.json({ pedido });
}
