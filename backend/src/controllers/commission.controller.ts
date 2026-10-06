import type { Request, Response } from 'express';
import type { Prisma, ReferralConversion, SettlementStatus } from '@prisma/client';
import prisma from '../config/database';
import AuditService from '../services/audit.service';
import {
  asyncHandler,
  NotFoundError,
  BadRequestError,
  ConflictError,
  UnauthorizedError
} from '../middleware/error.middleware';

// Rotas de admin, sempre atrás do `authMiddleware`. Sem `req.user` o JavaScript
// estourava TypeError (500) ao ler `tenant_id`; aqui o erro tem nome.
const usuarioDe = (req: Request) => {
  if (!req.user) throw new UnauthorizedError();
  return req.user;
};

/** Primeiro valor de um parâmetro de query, como string; vazio vira undefined. */
const textoDaQuery = (valor: unknown): string | undefined => {
  if (valor === undefined || valor === null || valor === '') return undefined;
  return String(Array.isArray(valor) ? valor[0] : valor);
};

/**
 * 📊 ADMIN: Listar regras de comissão
 */
const listCommissionRules = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.user?.tenant_id || 'saudepet';

  const rules = await prisma.commissionRule.findMany({
    where: { tenantId },
    include: {
      partner: { select: { tradeName: true } }
    },
    orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }]
  });

  return res.json({ success: true, rules });
});

/**
 * ➕ ADMIN: Criar nova regra de comissão dinâmica
 */
const createCommissionRule = asyncHandler(async (req: Request, res: Response) => {
  const { name, partnerId, partnerUnitId, partnerServiceId, calculationType, percentage, fixedAmount, minimumCommission, maximumCommission, priority } = req.body;
  const tenantId = req.user?.tenant_id || 'saudepet';

  if (!name) throw new BadRequestError('Informe o nome identificador da regra de comissão');

  const rule = await prisma.commissionRule.create({
    data: {
      tenantId,
      partnerId: partnerId || null,
      partnerUnitId: partnerUnitId || null,
      partnerServiceId: partnerServiceId || null,
      name,
      calculationType: calculationType || 'PERCENTAGE',
      percentage: percentage ? parseFloat(percentage) : 10.0,
      fixedAmount: fixedAmount ? parseFloat(fixedAmount) : 0.0,
      minimumCommission: minimumCommission ? parseFloat(minimumCommission) : null,
      maximumCommission: maximumCommission ? parseFloat(maximumCommission) : null,
      priority: priority ? parseInt(priority) : 0,
      active: true
    }
  });

  // A regra decide quanto a plataforma retem de cada indicacao: alterar isso
  // muda dinheiro de lugar, e precisa dizer quem criou e com que parametros.
  await AuditService.logForensicEvent({
    req,
    entityType: 'CommissionRule',
    entityId: rule.id,
    action: 'comissao.regra_criada',
    estadoPosterior: {
      name: rule.name,
      calculationType: rule.calculationType,
      percentage: rule.percentage,
      fixedAmount: rule.fixedAmount,
      priority: rule.priority
    },
    motivo: 'Regra de comissao criada pelo administrador'
  });

  return res.status(201).json({ success: true, message: 'Regra de comissão criada com sucesso', rule });
});

/**
 * 💳 ADMIN: Listar fechamentos financeiros (Settlements)
 */
const listSettlements = asyncHandler(async (req: Request, res: Response) => {
  const partnerId = textoDaQuery(req.query.partnerId);
  const status = textoDaQuery(req.query.status);

  // Faltava o tenant: o admin de uma organização via o fechamento das outras.
  const where: Prisma.CommissionSettlementWhereInput = { tenantId: usuarioDe(req).tenant_id };
  if (partnerId) where.partnerId = partnerId;
  // O valor vai ao Prisma como veio da URL; fora do enum ele recusa a consulta.
  if (status && status !== 'todos') where.status = status as SettlementStatus;

  const settlements = await prisma.commissionSettlement.findMany({
    where,
    include: {
      partner: { select: { id: true, tradeName: true, documentNumber: true, email: true, phone: true } },
      _count: { select: { conversions: true } }
    },
    orderBy: { createdAt: 'desc' }
  });

  const emAberto = settlements.filter((item) => !['PAID', 'CANCELLED'].includes(item.status));

  return res.json({
    success: true,
    count: settlements.length,
    total_a_receber: emAberto.reduce((soma, item) => soma + Number(item.commissionAmount), 0),
    settlements: settlements.map((item) => ({
      ...item,
      grossAmount: Number(item.grossAmount),
      commissionAmount: Number(item.commissionAmount),
      netAmount: Number(item.netAmount),
      atendimentos: item._count.conversions
    }))
  });
});

type ConversaoComParceiro = ReferralConversion & { referral: { partnerId: string } };
type CampoSomavel = 'grossAmount' | 'commissionAmount' | 'partnerNetAmount';

/**
 * 🧮 ADMIN: Gerar os fechamentos de um período
 *
 * Aqui é o elo que nunca existiu. `CommissionSettlement` tinha modelo, listagem
 * e rota de "marcar como pago", mas NENHUM ponto do backend criava um: a aba
 * "Liquidações & Repasses" era estruturalmente vazia e a rede de parceiros
 * acumulava conversões sem nunca fechar o ciclo do dinheiro.
 */
const generateSettlements = asyncHandler(async (req: Request, res: Response) => {
  const { periodStart, periodEnd, partnerId, diasParaVencimento = 10 } = req.body || {};
  const tenantId = String(usuarioDe(req).tenant_id);

  if (!periodStart || !periodEnd) {
    throw new BadRequestError('Informe o início e o fim do período a fechar.');
  }

  const inicio = new Date(periodStart);
  const fim = new Date(periodEnd);

  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime())) {
    throw new BadRequestError('Período inválido.');
  }
  if (inicio > fim) {
    throw new BadRequestError('O início do período não pode ser depois do fim.');
  }

  // O fim do dia entra inteiro: quem escolhe "até 31/08" espera o dia 31 dentro.
  fim.setHours(23, 59, 59, 999);

  // Só conversão confirmada e ainda não fechada. `settlementId` é o que impede
  // que rodar de novo conte a mesma comissão duas vezes.
  const conversoes: ConversaoComParceiro[] = await prisma.referralConversion.findMany({
    where: {
      status: 'CONFIRMED',
      settlementId: null,
      confirmedAt: { gte: inicio, lte: fim },
      referral: {
        tenantId,
        ...(partnerId ? { partnerId: String(partnerId) } : {})
      }
    },
    include: { referral: { select: { partnerId: true } } }
  });

  if (conversoes.length === 0) {
    return res.json({
      success: true,
      message: 'Nenhuma conversão em aberto neste período.',
      settlements: []
    });
  }

  const porParceiro = new Map<string, ConversaoComParceiro[]>();
  for (const conversao of conversoes) {
    const chave = conversao.referral.partnerId;
    const lista = porParceiro.get(chave);
    if (lista) lista.push(conversao);
    else porParceiro.set(chave, [conversao]);
  }

  const vencimento = new Date(fim);
  vencimento.setDate(vencimento.getDate() + Number(diasParaVencimento || 10));

  // Centavos inteiros na soma: somar Decimal como float acumula erro e o
  // fechamento fecha por um centavo de diferença do extrato.
  const somarCentavos = (itens: ConversaoComParceiro[], campo: CampoSomavel) =>
    itens.reduce((soma, item) => soma + Math.round(Number(item[campo]) * 100), 0) / 100;

  const criados = await prisma.$transaction(async (tx) => {
    const resultado = [];

    for (const [idDoParceiro, itens] of porParceiro.entries()) {
      const settlement = await tx.commissionSettlement.create({
        data: {
          tenantId,
          partnerId: idDoParceiro,
          periodStart: inicio,
          periodEnd: fim,
          grossAmount: somarCentavos(itens, 'grossAmount'),
          commissionAmount: somarCentavos(itens, 'commissionAmount'),
          netAmount: somarCentavos(itens, 'partnerNetAmount'),
          status: 'OPEN',
          dueDate: vencimento
        },
        include: { partner: { select: { tradeName: true } } }
      });

      await tx.referralConversion.updateMany({
        where: { id: { in: itens.map((item) => item.id) } },
        data: { settlementId: settlement.id }
      });

      resultado.push({ settlement, atendimentos: itens.length });
    }

    return resultado;
  });

  await AuditService.logForensicEvent({
    req,
    tenantId,
    entityType: 'CommissionSettlement',
    entityId: 'lote',
    action: 'comissao.fechamento_gerado',
    estadoPosterior: {
      periodo: { inicio, fim },
      fechamentos: criados.length,
      conversoes: conversoes.length
    },
    motivo: `Fechamento de ${inicio.toISOString().slice(0, 10)} a ${fim.toISOString().slice(0, 10)}`
  });

  return res.status(201).json({
    success: true,
    message: `${criados.length} fechamento${criados.length !== 1 ? 's' : ''} gerado${criados.length !== 1 ? 's' : ''} a partir de ${conversoes.length} atendimento${conversoes.length !== 1 ? 's' : ''}.`,
    settlements: criados.map(({ settlement, atendimentos }) => ({
      id: settlement.id,
      parceiro: settlement.partner?.tradeName,
      commissionAmount: Number(settlement.commissionAmount),
      atendimentos
    }))
  });
});

/**
 * 🏦 ADMIN: Marcar fechamento financeiro como pago
 */
const markSettlementPaid = asyncHandler(async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const { paymentReference } = req.body || {};
  const tenantId = usuarioDe(req).tenant_id;

  // `findUnique` por id, sem tenant, deixava um admin quitar o fechamento de
  // outra organização só com o identificador.
  const settlement = await prisma.commissionSettlement.findFirst({
    where: { id, tenantId }
  });
  if (!settlement) throw new NotFoundError('Fechamento financeiro não encontrado');

  if (settlement.status === 'PAID') {
    throw new ConflictError('Este fechamento já está quitado.');
  }
  if (settlement.status === 'CANCELLED') {
    throw new ConflictError('Este fechamento foi cancelado.');
  }

  const updated = await prisma.commissionSettlement.update({
    where: { id },
    data: {
      status: 'PAID',
      paidAt: new Date(),
      paymentReference: (typeof paymentReference === 'string' && paymentReference.trim()) || 'PAGO_VIA_ADMIN'
    }
  });

  // Dar baixa em dinheiro é ato que precisa de dono e data na trilha.
  await AuditService.logForensicEvent({
    req,
    tenantId,
    entityType: 'CommissionSettlement',
    entityId: id,
    action: 'comissao.fechamento_quitado',
    estadoAnterior: { status: settlement.status },
    estadoPosterior: { status: 'PAID', paidAt: updated.paidAt, paymentReference: updated.paymentReference },
    detalhes: { partnerId: settlement.partnerId, commissionAmount: Number(settlement.commissionAmount) }
  });

  return res.json({
    success: true,
    message: 'Fechamento financeiro marcado como pago!',
    settlement: { ...updated, commissionAmount: Number(updated.commissionAmount) }
  });
});

/**
 * ↩️ ADMIN: Cancelar um fechamento e devolver as conversões para a fila
 */
const cancelSettlement = asyncHandler(async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const { motivo } = req.body || {};
  const tenantId = usuarioDe(req).tenant_id;

  if (!motivo || String(motivo).trim().length < 5) {
    throw new BadRequestError('Explique o motivo do cancelamento.');
  }

  const settlement = await prisma.commissionSettlement.findFirst({ where: { id, tenantId } });
  if (!settlement) throw new NotFoundError('Fechamento financeiro não encontrado');
  if (settlement.status === 'PAID') {
    throw new ConflictError('Fechamento já quitado não pode ser cancelado. Registre um estorno.');
  }

  const atualizado = await prisma.$transaction(async (tx) => {
    // Soltar as conversões é o que permite refazer o fechamento — senão elas
    // ficariam presas a um fechamento morto e nunca mais seriam cobradas.
    await tx.referralConversion.updateMany({
      where: { settlementId: id },
      data: { settlementId: null }
    });

    return tx.commissionSettlement.update({
      where: { id },
      data: { status: 'CANCELLED' }
    });
  });

  await AuditService.logForensicEvent({
    req,
    tenantId,
    entityType: 'CommissionSettlement',
    entityId: id,
    action: 'comissao.fechamento_cancelado',
    estadoAnterior: { status: settlement.status },
    estadoPosterior: { status: 'CANCELLED' },
    motivo: String(motivo).trim()
  });

  return res.json({ success: true, message: 'Fechamento cancelado e atendimentos devolvidos à fila.', settlement: atualizado });
});

const commissionController = {
  listCommissionRules,
  createCommissionRule,
  listSettlements,
  generateSettlements,
  markSettlementPaid,
  cancelSettlement
};

module.exports = commissionController;

export default commissionController;
export {
  listCommissionRules,
  createCommissionRule,
  listSettlements,
  generateSettlements,
  markSettlementPaid,
  cancelSettlement
};
