import type { Request, Response } from 'express';
import prisma from '../config/database';

const texto = (valor: unknown, limite = 500) => String(valor ?? '').trim().slice(0, limite);

export async function health(_req: Request, res: Response) {
  return res.json({ ok: true, service: 'saude-pet-automation', timestamp: new Date().toISOString() });
}

export async function rastreiosPendentes(req: Request, res: Response) {
  const limite = Math.min(200, Math.max(1, Number(req.query.limit || 100)));
  const pedidos = await prisma.pedidoMercado.findMany({
    where: {
      entrega_tipo: 'transportadora',
      rastreio_codigo: { not: null },
      status: { in: ['em_separacao', 'pronto'] }
    },
    orderBy: { atualizado_em: 'asc' },
    take: limite,
    select: {
      id: true,
      codigo: true,
      status: true,
      rastreio_codigo: true,
      frete_transportadora: true,
      atualizado_em: true,
      tutor: { select: { nome: true, telefone: true, email: true, preferencias: true } },
      loja: { select: { nome_fantasia: true } },
      eventos: { orderBy: { criado_em: 'desc' }, take: 1, select: { motivo: true, criado_em: true } }
    }
  });
  return res.json({ total: pedidos.length, pedidos });
}

export async function registrarRastreio(req: Request, res: Response) {
  const evento = texto(req.body?.evento, 180);
  const detalhe = texto(req.body?.detalhe, 500);
  const codigo = texto(req.body?.codigo_rastreio, 80);
  const entregue = req.body?.entregue === true || /entregue|delivery complete/i.test(evento);
  if (!evento) return res.status(400).json({ error: 'evento e obrigatorio.' });

  const atual = await prisma.pedidoMercado.findFirst({
    where: { id: req.params.id, rastreio_codigo: codigo || undefined },
    select: { id: true, status: true, rastreio_codigo: true }
  });
  if (!atual) return res.status(404).json({ error: 'Pedido rastreavel nao encontrado.' });

  const motivo = ['Rastreio', evento, detalhe].filter(Boolean).join(': ').slice(0, 700);
  const resultado = await prisma.$transaction(async (tx) => {
    const pedido = entregue && atual.status !== 'concluido'
      ? await tx.pedidoMercado.update({
          where: { id: atual.id },
          data: { status: 'concluido', concluido_em: new Date() },
          select: { id: true, codigo: true, status: true, rastreio_codigo: true }
        })
      : await tx.pedidoMercado.findUnique({
          where: { id: atual.id },
          select: { id: true, codigo: true, status: true, rastreio_codigo: true }
        });

    await tx.eventoPedidoMercado.create({
      data: {
        pedido_id: atual.id,
        status: entregue ? 'concluido' : atual.status,
        status_anterior: entregue ? atual.status : null,
        origem: 'n8n',
        ator_papel: 'automacao',
        motivo
      }
    });
    return pedido;
  });
  return res.json({ atualizado: true, pedido: resultado, evento });
}

export async function operacaoCuritiba(_req: Request, res: Response) {
  const inicio = new Date();
  inicio.setHours(0, 0, 0, 0);
  const [veterinariosPr, tutoresCuritiba, solicitacoes, pagamentos, avaliacoes] = await Promise.all([
    prisma.veterinario.groupBy({ by: ['status_credenciamento'], where: { crmv_uf: 'PR' }, _count: { _all: true } }),
    prisma.usuario.count({ where: { tipo_usuario: 'tutor', cidade: { contains: 'Curitiba', mode: 'insensitive' } } }),
    prisma.solicitacao.count({ where: { criado_em: { gte: inicio } } }),
    prisma.payment.count({ where: { status: 'PAID', atualizado_em: { gte: inicio } } }),
    prisma.avaliacao.count({ where: { criado_em: { gte: inicio } } })
  ]);
  return res.json({ data: inicio.toISOString().slice(0, 10), veterinariosPr, tutoresCuritiba, solicitacoesHoje: solicitacoes, pagamentosHoje: pagamentos, avaliacoesHoje: avaliacoes });
}
