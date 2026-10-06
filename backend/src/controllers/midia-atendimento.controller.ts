import type { Request, Response } from 'express';
import { anexarMidia, conferirAcesso, listarMidias, removerMidia } from '../services/midia-atendimento.service';

/**
 * Mídia do atendimento: anexar, listar e remover.
 *
 * Arquivo próprio pelo mesmo motivo do `busca.controller`: `solicitacao.controller.js`
 * passa de mil e seiscentas linhas, e migrá-lo é item da Fase 1 do roadmap — não
 * carona de uma funcionalidade nova.
 */

type RequestAutenticada = Request & {
  userId?: string;
  tenantId?: string;
  userType?: string;
  file?: { buffer: Buffer; originalname?: string; mimetype?: string; size?: number };
};

export async function anexar(req: RequestAutenticada, res: Response) {
  // O papel sai do próprio token, nunca do corpo da requisição: quem envia não
  // escolhe se o arquivo dele conta como registro clínico.
  const papel = req.userType === 'veterinario' ? 'veterinario' : 'tutor';

  const midia = await anexarMidia({
    atendimentoId: String(req.params.id),
    tenantId: String(req.tenantId),
    usuarioId: String(req.userId),
    papel,
    arquivo: req.file,
    legenda: typeof req.body?.legenda === 'string' ? req.body.legenda : undefined
  });

  return res.status(201).json({ midia });
}

export async function listar(req: RequestAutenticada, res: Response) {
  await conferirAcesso({
    atendimentoId: String(req.params.id),
    tenantId: String(req.tenantId),
    usuarioId: String(req.userId),
    tipoDeUsuario: req.userType
  });

  const midias = await listarMidias(String(req.params.id), String(req.tenantId));
  return res.json({ midias });
}

export async function remover(req: RequestAutenticada, res: Response) {
  const resultado = await removerMidia({
    midiaId: String(req.params.midiaId),
    tenantId: String(req.tenantId),
    usuarioId: String(req.userId)
  });

  return res.json(resultado);
}
