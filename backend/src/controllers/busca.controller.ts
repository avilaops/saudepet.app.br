import type { Request, Response } from 'express';
import { retomarBusca } from '../services/busca-sem-resposta.service';

/**
 * "Procurar de novo" — a saída que o tutor não tinha.
 *
 * Fica em arquivo próprio, e não dentro de `solicitacao.controller.js`, por
 * duas razões: aquele arquivo passa de mil e seiscentas linhas (migrá-lo para
 * TypeScript é item da Fase 1 do roadmap, não carona de uma correção), e este
 * caminho tem vida própria — é o par do worker que encerra a busca.
 */

// A request autenticada carrega o que o `authMiddleware` e o `tenantContext`
// penduram nela. Enquanto o middleware não é migrado, o tipo mora aqui.
type RequestAutenticada = Request & {
  userId?: string;
  tenantId?: string;
};

export async function retomar(req: RequestAutenticada, res: Response) {
  const solicitacao = await retomarBusca({
    solicitacaoId: String(req.params.id),
    tenantId: String(req.tenantId),
    tutorId: String(req.userId),
    io: req.app.get('io')
  });

  return res.json({
    solicitacao,
    mensagem: 'Estamos procurando um veterinário de novo.'
  });
}
