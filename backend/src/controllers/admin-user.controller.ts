import type { Request, Response } from 'express';
import type { Prisma, TipoUsuario } from '@prisma/client';
import prisma from '../config/database';
import AuditService from '../services/audit.service';
import TokenService from '../services/token.service';
import { NotFoundError, ValidationError, ForbiddenError, asyncHandler } from '../middleware/error.middleware';

/**
 * Paginação da gestão de usuários.
 *
 * A rota já aceitava `page`/`limit`, mas a tela nunca os mandava e mostrava a
 * primeira página como se fosse a plataforma inteira. Além de a tela passar a
 * paginar, o limite agora tem teto: `?limit=999999` transformava a listagem de
 * usuários num dump da tabela a pedido de qualquer admin.
 */
const USUARIOS_POR_PAGINA_PADRAO = 20;
const USUARIOS_POR_PAGINA_MAXIMO = 100;

function paginacaoDaLista(query: Request['query'], { padrao, maximo }: { padrao: number; maximo: number }) {
  const paginaPedida = Number.parseInt(String(query.page ?? query.pagina), 10);
  const limitePedido = Number.parseInt(String(query.limit ?? query.limite), 10);

  const pagina = Number.isFinite(paginaPedida) && paginaPedida > 0 ? paginaPedida : 1;
  const limite = Number.isFinite(limitePedido) && limitePedido > 0
    ? Math.min(limitePedido, maximo)
    : padrao;

  return { pagina, limite };
}

/** Corpo de `alterarRole`; a rota não valida com Zod, então o tipo é o do uso. */
type AlterarRoleBody = { novoTipo?: string; motivo?: string };

class AdminUserController {
  /**
   * Listar Usuários com Filtros e Permissões Granulares
   */
  listarUsuarios = asyncHandler(async (req: Request, res: Response) => {
    const { tipo, search } = req.query;
    const { pagina, limite } = paginacaoDaLista(req.query, {
      padrao: USUARIOS_POR_PAGINA_PADRAO,
      maximo: USUARIOS_POR_PAGINA_MAXIMO
    });

    const where: Prisma.UsuarioWhereInput = {};
    if (req.tenantId && !req.isSuperAdmin) {
      where.tenant_id = req.tenantId;
    }

    // O filtro vai como veio da query; valor fora do enum o Prisma recusa.
    if (tipo) where.tipo_usuario = String(tipo) as TipoUsuario;

    if (search) {
      const termo = String(search);
      where.OR = [
        { nome: { contains: termo, mode: 'insensitive' } },
        { email: { contains: termo, mode: 'insensitive' } },
        { telefone: { contains: termo, mode: 'insensitive' } }
      ];
    }

    const skip = (pagina - 1) * limite;

    const [usuarios, total] = await Promise.all([
      prisma.usuario.findMany({
        where,
        select: {
          id: true,
          tenant_id: true,
          nome: true,
          email: true,
          telefone: true,
          tipo_usuario: true,
          cidade: true,
          foto_perfil: true,
          email_verificado: true,
          criado_em: true,
          veterinario: { select: { id: true, crmv: true, status_credenciamento: true, status_financeiro: true } }
        },
        orderBy: { criado_em: 'desc' },
        skip,
        take: limite
      }),
      prisma.usuario.count({ where })
    ]);

    const paginas = Math.max(1, Math.ceil(total / limite));

    return res.json({
      success: true,
      // `total`/`page`/`totalPages` permanecem porque a tela antiga os lia;
      // `paginacao` é o formato do resto do projeto (moderação, formulários).
      total,
      page: pagina,
      totalPages: paginas,
      paginacao: { pagina, por_pagina: limite, total, paginas },
      usuarios
    });
  });

  /**
   * Revogar Todas as Sessões Ativas de um Usuário (Forçar Logout)
   */
  revogarSessoes = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const adminId = req.userId;

    const targetUser = await prisma.usuario.findUnique({
      where: { id }
    });

    if (!targetUser) {
      throw new NotFoundError('Usuário não encontrado');
    }

    // Revogar Refresh Tokens do banco E marcar o corte de sessão. Só o primeiro
    // não bastava: o botão prometia "revogar imediatamente todas as sessões",
    // mas o access token de 7 dias seguia aceito e a pessoa continuava logada
    // por até uma semana.
    await TokenService.revokeUserRefreshTokens(id);
    await prisma.usuario.update({
      where: { id },
      data: { sessoes_revogadas_em: new Date() }
    });

    // Gravar Log Pericial
    AuditService.logForensicEvent({
      req,
      entityType: 'usuario',
      entityId: id,
      action: 'SESSOES_USUARIO_REVOGADAS',
      motivo: `Revogação forçada de sessões pelo Administrador ${adminId}`
    });

    return res.json({
      success: true,
      message: `Todas as sessões ativas do usuário ${targetUser.nome} foram revogadas com sucesso.`
    });
  });

  /**
   * Alterar Papel / Role do Usuário (Prevenção de Auto-Promoção)
   */
  alterarRole = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { novoTipo, motivo }: AlterarRoleBody = req.body;
    const adminId = req.userId;

    // PREVENÇÃO DE CONFLITO DE INTERESSES: Impedir auto-promoção
    if (id === adminId) {
      throw new ForbiddenError('Impedimento de Conflito de Interesses: Você não pode alterar sua própria função ou privilégios.');
    }

    if (!motivo || motivo.trim().length < 5) {
      throw new ValidationError('A alteração de privilégios exige uma justificativa/motivo formal.');
    }

    const ROLES_ADMINISTRATIVAS = ['admin', 'super_admin'];
    if (ROLES_ADMINISTRATIVAS.includes(String(novoTipo)) && !req.isSuperAdmin) {
      throw new ForbiddenError('Apenas Super Administradores podem conceder privilégios administrativos.');
    }

    const usuarioAnterior = await prisma.usuario.findUnique({
      where: { id },
      select: { id: true, nome: true, tipo_usuario: true }
    });

    if (!usuarioAnterior) {
      throw new NotFoundError('Usuário não encontrado');
    }

    const atualizado = await prisma.usuario.update({
      where: { id },
      // O papel vai como veio do corpo; valor fora do enum o Prisma recusa.
      data: { tipo_usuario: novoTipo as TipoUsuario }
    });

    // Gravar Registro Imutável em AuditLog
    AuditService.logForensicEvent({
      req,
      entityType: 'usuario',
      entityId: id,
      action: 'ROLE_USUARIO_ALTERADO',
      estadoAnterior: { tipo_usuario: usuarioAnterior.tipo_usuario },
      estadoPosterior: { tipo_usuario: novoTipo },
      motivo
    });

    return res.json({
      success: true,
      message: `Função do usuário ${usuarioAnterior.nome} alterada para ${novoTipo}`,
      usuario: atualizado
    });
  });
}

const adminUserController = new AdminUserController();

module.exports = adminUserController;
export default adminUserController;
