import jwt from 'jsonwebtoken';
import type { Request, Response } from 'express';
import prisma from '../config/database';
import AuditService from '../services/audit.service';
import {
  asyncHandler,
  NotFoundError,
  ForbiddenError,
  ValidationError
} from '../middleware/error.middleware';

/**
 * Ver o produto pelos olhos de uma pessoa real.
 *
 * O recurso anterior ("ver como tutor / veterinário") era um interruptor de
 * PAPEL guardado no navegador. Não tinha nada por trás: o super_admin virava
 * "veterinário" sem ter cadastro de veterinário, as telas pediam dados que não
 * existiam, e a marca ficava presa no aparelho — foi assim que o Abraão ficou
 * sem conseguir usar o sistema, entrando com a senha certa e caindo na página
 * pública. Também não servia para o que a gente realmente precisa: quando um
 * tutor liga dizendo "não aparece meu pet aqui", ver um veterinário genérico
 * não ajuda em nada.
 *
 * Aqui o suporte entra na conta DAQUELA pessoa, com os dados dela, por tempo
 * curto e com registro de quem entrou. É o padrão de quem faz isso a sério.
 */

// Uma hora resolve um atendimento de suporte e não vira uma sessão paralela
// esquecida aberta.
const DURACAO = '1h';

class ImpersonacaoController {
  /**
   * Quem o suporte pode ver
   * GET /api/v1/admin/impersonar/usuarios?busca=
   */
  listarAlvos = asyncHandler(async (req: Request, res: Response) => {
    const busca = req.query.busca ?? '';
    const termo = String(busca).trim();

    const usuarios = await prisma.usuario.findMany({
      where: {
        tenant_id: req.tenantId,
        // Admin não entra na conta de admin: seria escalar privilégio com outro
        // nome, e o registro de quem fez o quê perderia o sentido.
        tipo_usuario: { in: ['tutor', 'veterinario'] },
        ativo: true,
        ...(termo.length >= 2
          ? {
              OR: [
                { nome: { contains: termo, mode: 'insensitive' as const } },
                { email: { contains: termo, mode: 'insensitive' as const } }
              ]
            }
          : {})
      },
      select: {
        id: true,
        nome: true,
        email: true,
        tipo_usuario: true,
        cidade: true,
        criado_em: true
      },
      orderBy: { criado_em: 'desc' },
      take: 20
    });

    return res.json({ usuarios });
  });

  /**
   * Começar a ver como alguém
   * POST /api/v1/admin/impersonar/:usuarioId
   */
  entrar = asyncHandler(async (req: Request, res: Response) => {
    const { usuarioId } = req.params;
    const motivo: unknown = (req.body || {}).motivo;

    if (!motivo || String(motivo).trim().length < 5) {
      throw new ValidationError('Diga por que precisa ver a conta desta pessoa — fica registrado.');
    }

    const alvo = await prisma.usuario.findFirst({
      where: { id: usuarioId, tenant_id: req.tenantId },
      select: { id: true, nome: true, email: true, tipo_usuario: true, tenant_id: true, ativo: true }
    });

    if (!alvo) throw new NotFoundError('Usuário não encontrado');

    if (!['tutor', 'veterinario'].includes(alvo.tipo_usuario)) {
      throw new ForbiddenError('Só é possível ver a conta de tutores e veterinários.');
    }

    if (!alvo.ativo) {
      throw new ForbiddenError('Esta conta está inativa.');
    }

    // O token carrega quem está por trás. Sem isso, tudo que acontecesse na
    // sessão apareceria como ato da própria pessoa — e um suporte capaz de agir
    // sem deixar rastro é pior do que suporte nenhum.
    const token = jwt.sign(
      {
        id: alvo.id,
        tipo_usuario: alvo.tipo_usuario,
        tenant_id: alvo.tenant_id,
        impersonado_por: req.userId
      },
      process.env.JWT_SECRET as string,
      { expiresIn: DURACAO }
    );

    await AuditService.logForensicEvent({
      req,
      tenantId: req.tenantId,
      entityType: 'usuario',
      entityId: alvo.id,
      action: 'suporte.impersonacao_iniciada',
      motivo: String(motivo).trim(),
      detalhes: { alvo: { nome: alvo.nome, email: alvo.email, tipo: alvo.tipo_usuario }, duracao: DURACAO }
    });

    return res.json({
      access_token: token,
      // Sem refresh: a sessão de suporte termina quando termina, e não se
      // renova sozinha no bolso de ninguém.
      refresh_token: null,
      expira_em: DURACAO,
      usuario: {
        id: alvo.id,
        nome: alvo.nome,
        email: alvo.email,
        tipo_usuario: alvo.tipo_usuario,
        tenant_id: alvo.tenant_id
      }
    });
  });

  /**
   * Registrar o fim da visita
   * POST /api/v1/admin/impersonar/sair
   *
   * Quem chama é a sessão impersonada; o token do admin volta a valer no
   * navegador, que nunca o descartou.
   */
  sair = asyncHandler(async (req: Request, res: Response) => {
    if (!req.impersonadoPor) {
      throw new ValidationError('Esta sessão não é uma visita de suporte.');
    }

    await AuditService.logForensicEvent({
      req,
      tenantId: req.tenantId,
      actorUserId: req.impersonadoPor,
      entityType: 'usuario',
      entityId: req.userId,
      action: 'suporte.impersonacao_encerrada'
    });

    return res.json({ success: true });
  });
}

const impersonacaoController = new ImpersonacaoController();

module.exports = impersonacaoController;
export default impersonacaoController;
