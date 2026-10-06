import type { NextFunction, Request, RequestHandler, Response } from 'express';
import prisma from '../config/database';
import { ForbiddenError, NotFoundError } from './error.middleware';

/**
 * Middleware para extrair tenant_id do token JWT
 * Deve ser usado APÓS authMiddleware
 *
 * O tenant_id é armazenado em req.tenantId para uso nos controllers
 */
const tenantContext = (req: Request, _res: Response, next: NextFunction): void => {
  const user = req.user;
  if (!user) {
    throw new ForbiddenError('Usuário não autenticado');
  }

  if (user.tipo_usuario === 'super_admin') {
    req.isSuperAdmin = true;

    // Aqui era sempre `null`. Só que os controllers passam `tenant_id: req.tenantId`
    // direto para o Prisma, e a coluna não aceita nulo — então toda tela de tutor
    // ou de veterinário aberta por um super admin quebrava com 500
    // ("Invalid `prisma.pet.findMany()` invocation"), inclusive as três chamadas
    // da home do tutor. Usar o tenant do próprio super admin resolve as ~96
    // consultas de uma vez.
    //
    // As rotas administrativas que precisam enxergar todos os tenants não mudam:
    // elas se guiam por `req.isSuperAdmin`, não pela ausência de tenant.
    req.tenantId = user.tenant_id || null;
    next();
    return;
  }

  // Usuários normais devem ter tenant_id
  if (!user.tenant_id) {
    throw new ForbiddenError('Usuário não está associado a nenhuma organização');
  }

  req.tenantId = user.tenant_id;
  req.isSuperAdmin = false;

  next();
};

/**
 * Middleware para verificar se o tenant está ativo
 * Deve ser usado APÓS tenantContext
 */
const requireActiveTenant = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  try {
    // Super admin bypassa validação
    if (req.isSuperAdmin) {
      next();
      return;
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: req.tenantId as string },
      select: {
        status: true,
        expira_em: true,
        plano: true
      }
    });

    if (!tenant) {
      throw new ForbiddenError('Organização não encontrada');
    }

    if (tenant.status === 'suspenso') {
      throw new ForbiddenError('Sua organização está suspensa. Entre em contato com o suporte.');
    }

    if (tenant.status === 'cancelado') {
      throw new ForbiddenError('Sua organização foi cancelada.');
    }

    // Verificar expiração do plano
    if (tenant.expira_em && new Date(tenant.expira_em) < new Date()) {
      throw new ForbiddenError('O plano da sua organização expirou. Renove para continuar.');
    }

    // Adicionar informações do tenant ao request
    req.tenant = tenant;

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware para verificar limites do plano (desbloqueado para exploração do ecossistema)
 */
const checkTenantLimit = (_resource: string, _limitField: string): RequestHandler => {
  return async (_req, _res, next) => {
    next();
  };
};

/**
 * Helper para adicionar filtro de tenant em queries Prisma
 *
 * Uso:
 * const where = addTenantFilter(req, { status: 'ativo' })
 * // Resultado: { tenant_id: '...', status: 'ativo' }
 */
const addTenantFilter = <T extends Record<string, unknown>>(
  req: Request,
  where: T = {} as T
): T & { tenant_id?: string } => {
  if (req.isSuperAdmin) {
    // Super admin pode especificar tenant via query param. A query chega como
    // texto livre (ou array, se repetida), então só um valor de texto vira
    // filtro; qualquer outra coisa é ignorada como se não tivesse vindo.
    const escolhido = req.query.tenant_id;
    if (typeof escolhido === 'string' && escolhido) {
      return { ...where, tenant_id: escolhido };
    }
    // Sem filtro de tenant para super admin
    return where;
  }

  // Usuários normais sempre filtram pelo seu tenant. `tenantId` é opcional na
  // Request e o Prisma não aceita `null` num filtro de texto: sem tenant, o
  // filtro simplesmente não entra, e quem restringe é a rota.
  return req.tenantId ? { ...where, tenant_id: req.tenantId } : where;
};

/** Modelos do Prisma que têm `tenant_id` e podem ser conferidos por `requireSameTenant`. */
type ModeloComTenant = {
  findUnique(args: { where: { id: string }; select: { tenant_id: true } }): Promise<{ tenant_id: string | null } | null>;
};

/**
 * Middleware para verificar se usuário pode acessar recurso de outro tenant
 * Usado em rotas GET /:id, PUT /:id, DELETE /:id
 */
const requireSameTenant = (resourceModel: string): RequestHandler => {
  return async (req, _res, next) => {
    try {
      // Super admin pode acessar qualquer tenant
      if (req.isSuperAdmin) {
        next();
        return;
      }

      const resourceId = req.params.id;

      const modelo = (prisma as unknown as Record<string, ModeloComTenant>)[resourceModel];
      const resource = await modelo.findUnique({
        where: { id: resourceId },
        select: { tenant_id: true }
      });

      if (!resource) {
        // Deixa o controller lidar com not found
        next();
        return;
      }

      if (resource.tenant_id !== req.tenantId) {
        throw new NotFoundError('Recurso não encontrado');
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

export {
  tenantContext,
  requireActiveTenant,
  checkTenantLimit,
  addTenantFilter,
  requireSameTenant
};
