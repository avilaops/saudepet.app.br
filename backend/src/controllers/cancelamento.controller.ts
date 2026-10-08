import type { Request, Response } from 'express';
import { politicaDeCancelamento } from '../services/cancelamento.service';

import prisma from '../config/database';

/**
 * O que vai acontecer com o dinheiro se eu cancelar agora.
 *
 * A tela pergunta ANTES de mostrar o botão de confirmar: ninguém deve descobrir
 * a taxa de deslocamento depois de cancelar.
 */

type RequestAutenticada = Request & { userId?: string; tenantId?: string; userType?: string };

export async function previa(req: RequestAutenticada, res: Response) {
  const atendimento = await prisma.solicitacao.findFirst({
    where: { id: String(req.params.id), tenant_id: String(req.tenantId) },
    select: {
      id: true,
      status: true,
      tutor_id: true,
      veterinario: { select: { usuario_id: true } }
    }
  });

  const ehTutor = atendimento && atendimento.tutor_id === req.userId;
  const ehVet = atendimento && atendimento.veterinario?.usuario_id === req.userId;

  if (!atendimento || (!ehTutor && !ehVet && req.userType !== 'admin')) {
    return res.status(404).json({ error: 'Atendimento não encontrado' });
  }

  const quemCancelou = ehTutor ? 'tutor' : ehVet ? 'veterinario' : 'admin';

  return res.json({
    status: atendimento.status,
    politica: politicaDeCancelamento({ status: atendimento.status, quemCancelou })
  });
}
