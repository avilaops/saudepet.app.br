import type { Response } from 'express';
import AuditService from '../services/audit.service';
import {
  abrirGravacao,
  guardarParte,
  finalizarGravacao,
  listarDoAtendimento,
  abrirParaAuditoria,
  MIME_PADRAO,
  diasDeRetencao
} from '../services/gravacao-chamada.service';

/**
 * As pontas HTTP da gravação de chamada.
 *
 * Duas famílias, e a separação é o desenho:
 *
 * - **Participante** — só ESCREVE. Abre a própria gravação, sobe pedaços,
 *   fecha. Não lê, não lista, não baixa. Nem o tutor nem o veterinário têm
 *   caminho para ouvir o que foi gravado.
 * - **Moderação** — só LÊ, e cada leitura pede motivo e vai para o `AuditLog`.
 *   Auditoria sem rastro de quem auditou é vigilância.
 */

type Req = {
  params: Record<string, string>;
  body: Record<string, any>;
  query: Record<string, any>;
  file?: { buffer: Buffer; size: number };
  userId?: string;
  userType?: string;
  tenantId?: string;
  headers: Record<string, any>;
  ip?: string;
};

/** POST /v1/solicitacoes/:id/chamada/gravacao — participante abre a própria. */
export async function abrir(req: Req, res: Response) {
  const gravacao = await abrirGravacao({
    atendimentoId: String(req.params.id),
    tenantId: String(req.tenantId),
    usuarioId: String(req.userId)
  });

  return res.status(201).json({
    ...gravacao,
    mime_type: MIME_PADRAO,
    // A tela precisa dizer isto à pessoa, em letra visível. Gravação
    // obrigatória e silenciosa é outra coisa, e não é o que estamos fazendo.
    aviso: 'Esta chamada é gravada para auditoria interna.',
    retencao_dias: diasDeRetencao()
  });
}

/** POST /v1/chamada/gravacao/:gravacaoId/parte — um pedaço do áudio. */
export async function enviarParte(req: Req, res: Response) {
  if (!req.file?.buffer) {
    return res.status(400).json({ error: 'Nenhum trecho de áudio recebido.' });
  }

  const indice = Number.parseInt(String(req.body.indice ?? ''), 10);
  if (!Number.isInteger(indice) || indice < 0) {
    return res.status(400).json({ error: 'Índice da parte inválido.' });
  }

  const resultado = await guardarParte({
    gravacaoId: String(req.params.gravacaoId),
    tenantId: String(req.tenantId),
    usuarioId: String(req.userId),
    indice,
    conteudo: req.file.buffer
  });

  return res.status(201).json(resultado);
}

/** POST /v1/chamada/gravacao/:gravacaoId/finalizar */
export async function finalizar(req: Req, res: Response) {
  const resultado = await finalizarGravacao({
    gravacaoId: String(req.params.gravacaoId),
    tenantId: String(req.tenantId),
    usuarioId: String(req.userId),
    duracaoSeg: Number(req.body?.duracao_seg)
  });

  return res.json(resultado);
}

/** GET /v1/admin/atendimentos/:id/gravacoes — a ficha, sem o áudio. */
export async function listarParaModeracao(req: Req, res: Response) {
  const gravacoes = await listarDoAtendimento(String(req.params.id), String(req.tenantId));
  return res.json({ gravacoes });
}

/**
 * POST /v1/admin/gravacoes/:gravacaoId/abrir
 *
 * É POST, e não GET, de propósito: abrir uma gravação não é uma leitura
 * inofensiva — exige motivo, produz um registro de auditoria e devolve URLs
 * assinadas de curta duração. Um GET convidaria a ser colado em link, aberto
 * por engano e cacheado.
 */
export async function abrirParaModeracao(req: Req, res: Response) {
  const motivo = String(req.body?.motivo || '').trim();

  const gravacao = await abrirParaAuditoria({
    gravacaoId: String(req.params.gravacaoId),
    tenantId: String(req.tenantId),
    motivo
  });

  // O registro vem ANTES da resposta: se a gravação for entregue, a linha de
  // auditoria já existe. Ao contrário, um erro depois do envio deixaria alguém
  // com o áudio e nenhum rastro.
  await AuditService.logForensicEvent({
    req,
    entityType: 'gravacao_chamada',
    entityId: gravacao.id,
    action: 'gravacao_aberta_para_auditoria',
    motivo,
    detalhes: {
      atendimento_id: gravacao.atendimento_id,
      papel_gravado: gravacao.papel,
      partes: gravacao.partes.length
    }
  });

  return res.json(gravacao);
}

module.exports = {
  abrir,
  enviarParte,
  finalizar,
  listarParaModeracao,
  abrirParaModeracao
};
