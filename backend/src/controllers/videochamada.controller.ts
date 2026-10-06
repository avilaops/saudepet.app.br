import type { Request, Response } from 'express';
import { podeAbrirChamada, servidoresDeConexao } from '../services/videochamada.service';

const prisma = require('../config/database');

/**
 * O que o navegador precisa saber para abrir a chamada: os servidores que
 * ajudam os dois aparelhos a se encontrarem, e se este atendimento é mesmo uma
 * teleorientação em andamento.
 */

type RequestAutenticada = Request & { userId?: string; tenantId?: string; userType?: string };

export async function configuracao(req: RequestAutenticada, res: Response) {
  const atendimento = await prisma.solicitacao.findFirst({
    where: { id: String(req.params.id), tenant_id: String(req.tenantId) },
    select: {
      id: true,
      status: true,
      tipo_atendimento: true,
      tutor_id: true,
      veterinario: { select: { usuario_id: true } }
    }
  });

  const participa =
    atendimento &&
    (atendimento.tutor_id === req.userId || atendimento.veterinario?.usuario_id === req.userId);

  // 404 para quem não participa: a existência da consulta já é informação.
  if (!atendimento || !participa) {
    return res.status(404).json({ error: 'Atendimento não encontrado' });
  }

  return res.json({
    pode_chamar: podeAbrirChamada(atendimento),
    ...servidoresDeConexao()
  });
}
