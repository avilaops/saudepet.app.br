import type { Request, Response } from 'express';
import { avaliacoesDoAtendimento, avaliarTutor } from '../services/avaliacao-do-tutor.service';

/**
 * O lado do veterinário na avaliação. Arquivo próprio: o controller de
 * avaliação existente é do caminho tutor → veterinário e continua sendo dele.
 */

type RequestAutenticada = Request & { userId?: string; tenantId?: string };

export async function avaliar(req: RequestAutenticada, res: Response) {
  const avaliacao = await avaliarTutor({
    atendimentoId: String(req.params.id),
    tenantId: String(req.tenantId),
    usuarioId: String(req.userId),
    nota: Number(req.body?.nota),
    comentario: typeof req.body?.comentario === 'string' ? req.body.comentario : undefined
  });

  return res.status(201).json({ avaliacao });
}

export async function listar(req: RequestAutenticada, res: Response) {
  const avaliacoes = await avaliacoesDoAtendimento(String(req.params.id), String(req.tenantId));
  return res.json({ avaliacoes });
}
