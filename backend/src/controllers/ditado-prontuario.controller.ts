import type { Request, Response } from 'express';
import prisma from '../config/database';
import { NotFoundError, ForbiddenError, ValidationError, asyncHandler } from '../middleware/error.middleware';
import { ditarProntuario } from '../services/ditado-prontuario.service';
import { ErroTranscricao } from '../services/transcricao.service';

/**
 * Ditado do prontuário: o veterinário grava a consulta falando e recebe o
 * texto transcrito de volta, para colar nos campos do fechamento
 * (`/:id/finalizar`). Não grava nada em `Solicitacao` nem em qualquer tabela
 * clínica — é rascunho, a confirmação continua sendo o fechamento normal.
 */

const tenantDe = (req: Request) => String(req.tenantId);
const usuarioDe = (req: Request) => String(req.userId);

type RequestComAudio = Request & { file?: { buffer: Buffer; originalname?: string; mimetype?: string; size?: number } };

export const ditar = asyncHandler(async (req: RequestComAudio, res: Response) => {
  const { id } = req.params;

  const veterinario = await prisma.veterinario.findFirst({
    where: { usuario_id: usuarioDe(req), tenant_id: tenantDe(req), aprovado_admin: true }
  });
  if (!veterinario) {
    throw new NotFoundError('Veterinário não encontrado');
  }

  const solicitacao = await prisma.solicitacao.findFirst({
    where: { id, tenant_id: tenantDe(req) },
    select: { id: true, veterinario_id: true }
  });
  if (!solicitacao) {
    throw new NotFoundError('Solicitação não encontrada');
  }
  if (solicitacao.veterinario_id !== veterinario.id) {
    throw new ForbiddenError('Você não está atribuído a esta solicitação');
  }

  if (!req.file) {
    throw new ValidationError('Envie um áudio para transcrever');
  }

  try {
    const rascunho = await ditarProntuario(req.file);
    return res.json({ rascunho });
  } catch (erro) {
    if (erro instanceof ErroTranscricao) {
      return res.status(erro.status).json({ erro: erro.message });
    }
    throw erro;
  }
});
