import type { Request, Response } from 'express';
import type { PlanoTenant, Prisma, StatusTenant } from '@prisma/client';
import type { z } from 'zod';
import prisma from '../config/database';
import AuditService from '../services/audit.service';
import { NotFoundError, ForbiddenError, ConflictError, asyncHandler } from '../middleware/error.middleware';
import type {
  createTenantSchema,
  updateTenantSchema,
  updateTenantStatusSchema,
  updateTenantPlanSchema,
  updateTenantConfigSchema
} from '../schemas/tenant.schema';

/** Query string vem como texto, lista ou objeto; só o texto interessa aqui. */
const textoDaQuery = (valor: unknown): string | undefined =>
  typeof valor === 'string' ? valor : undefined;

class TenantController {
  /**
   * Criar novo tenant (apenas super_admin)
   * POST /api/v1/tenants
   */
  criar = asyncHandler(async (req: Request, res: Response) => {
    const corpo: z.infer<typeof createTenantSchema> = req.body;
    const { slug, cnpj, email, ...restData } = corpo;

    // Verificar se slug já existe
    const slugExists = await prisma.tenant.findUnique({
      where: { slug }
    });

    if (slugExists) {
      throw new ConflictError('Este slug já está em uso');
    }

    // Verificar CNPJ se fornecido
    if (cnpj) {
      const cnpjExists = await prisma.tenant.findUnique({
        where: { cnpj }
      });

      if (cnpjExists) {
        throw new ConflictError('Este CNPJ já está cadastrado');
      }
    }

    // Criar tenant com configurações padrão
    const tenant = await prisma.tenant.create({
      data: {
        slug,
        cnpj,
        email,
        ...restData,
        configuracoes: {
          create: {} // Usa valores padrão do schema
        }
      },
      include: {
        configuracoes: true
      }
    });

    return res.status(201).json({
      message: 'Organização criada com sucesso',
      tenant
    });
  });

  /**
   * Listar todos os tenants (super_admin) ou tenant atual
   * GET /api/v1/tenants
   */
  listar = asyncHandler(async (req: Request, res: Response) => {
    const { page = 1, limit = 20 } = req.query;
    const status = textoDaQuery(req.query.status);
    const plano = textoDaQuery(req.query.plano);
    const skip = (Number(page) - 1) * Number(limit);

    const where: Prisma.TenantWhereInput = {};

    // Super admin pode filtrar, usuário normal só vê seu tenant
    if (!req.isSuperAdmin) {
      where.id = String(req.tenantId);
    } else {
      // Status e plano chegam como texto livre da query; quem os valida é o
      // Prisma, como antes da migração.
      if (status) where.status = status as StatusTenant;
      if (plano) where.plano = plano as PlanoTenant;
    }

    const [tenants, total] = await Promise.all([
      prisma.tenant.findMany({
        where,
        skip: parseInt(String(skip)),
        take: parseInt(String(limit)),
        include: {
          configuracoes: true,
          _count: {
            select: {
              usuarios: true
            }
          }
        },
        orderBy: { criado_em: 'desc' }
      }),
      prisma.tenant.count({ where })
    ]);

    return res.json({
      tenants,
      pagination: {
        total,
        page: parseInt(String(page)),
        limit: parseInt(String(limit)),
        pages: Math.ceil(total / Number(limit))
      }
    });
  });

  /**
   * Buscar tenant por ID
   * GET /api/v1/tenants/:id
   */
  buscarPorId = asyncHandler(async (req: Request, res: Response) => {
    const id = String(req.params.id);

    // Usuário normal só pode ver seu próprio tenant
    if (!req.isSuperAdmin && id !== req.tenantId) {
      throw new ForbiddenError('Você não tem permissão para acessar esta organização');
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id },
      include: {
        configuracoes: true,
        _count: {
          select: {
            usuarios: true
          }
        }
      }
    });

    if (!tenant) {
      throw new NotFoundError('Organização não encontrada');
    }

    return res.json(tenant);
  });

  /**
   * Buscar tenant por slug (público para subdomínios)
   * GET /api/v1/tenants/slug/:slug
   */
  buscarPorSlug = asyncHandler(async (req: Request, res: Response) => {
    const slug = String(req.params.slug);

    const tenant = await prisma.tenant.findUnique({
      where: { slug },
      select: {
        id: true,
        nome: true,
        slug: true,
        logo: true,
        cidade: true,
        estado: true,
        status: true,
        configuracoes: {
          select: {
            permitir_cadastro: true,
            cor_primaria: true,
            cor_secundaria: true
          }
        }
      }
    });

    if (!tenant) {
      throw new NotFoundError('Organização não encontrada');
    }

    if (tenant.status !== 'ativo' && tenant.status !== 'trial') {
      throw new ForbiddenError('Organização não disponível');
    }

    return res.json(tenant);
  });

  /**
   * Atualizar dados do tenant
   * PUT /api/v1/tenants/:id
   */
  atualizar = asyncHandler(async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const dados: z.infer<typeof updateTenantSchema> = req.body;

    // Usuário normal só pode atualizar seu próprio tenant
    if (!req.isSuperAdmin && id !== req.tenantId) {
      throw new ForbiddenError('Você não tem permissão para atualizar esta organização');
    }

    const tenant = await prisma.tenant.update({
      where: { id },
      data: dados,
      include: {
        configuracoes: true
      }
    });

    return res.json({
      message: 'Organização atualizada com sucesso',
      tenant
    });
  });

  /**
   * Atualizar status do tenant (apenas super_admin)
   * PUT /api/v1/tenants/:id/status
   */
  atualizarStatus = asyncHandler(async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const corpo: z.infer<typeof updateTenantStatusSchema> = req.body;
    const { status } = corpo;

    const anterior = await prisma.tenant.findUnique({ where: { id }, select: { status: true, nome: true } });

    const tenant = await prisma.tenant.update({
      where: { id },
      data: { status }
    });

    // Suspender ou cancelar uma organização bloqueia o acesso de TODOS os
    // usuários dela de uma vez — a ação mais destrutiva do painel.
    await AuditService.logForensicEvent({
      req,
      tenantId: id,
      entityType: 'Tenant',
      entityId: id,
      action: 'tenant.status_alterado',
      estadoAnterior: { status: anterior?.status },
      estadoPosterior: { status },
      motivo: `Status da organização "${anterior?.nome || id}" alterado por administrador`
    });

    return res.json({
      message: 'Status atualizado com sucesso',
      tenant
    });
  });

  /**
   * Atualizar plano do tenant (apenas super_admin)
   * PUT /api/v1/tenants/:id/plano
   */
  atualizarPlano = asyncHandler(async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const corpo: z.infer<typeof updateTenantPlanSchema> = req.body;
    const { plano, limite_usuarios, limite_pets, expira_em } = corpo;

    const data: Prisma.TenantUpdateInput = { plano };
    if (limite_usuarios !== undefined) data.limite_usuarios = limite_usuarios;
    if (limite_pets !== undefined) data.limite_pets = limite_pets;
    if (expira_em !== undefined) data.expira_em = new Date(expira_em);

    const tenant = await prisma.tenant.update({
      where: { id },
      data
    });

    return res.json({
      message: 'Plano atualizado com sucesso',
      tenant
    });
  });

  /**
   * Atualizar configurações do tenant
   * PUT /api/v1/tenants/:id/config
   */
  atualizarConfig = asyncHandler(async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const dados: z.infer<typeof updateTenantConfigSchema> = req.body;

    // Usuário normal só pode atualizar config do seu próprio tenant
    if (!req.isSuperAdmin && id !== req.tenantId) {
      throw new ForbiddenError('Você não tem permissão para atualizar esta organização');
    }

    const config = await prisma.configuracaoTenant.update({
      where: { tenant_id: id },
      data: dados
    });

    return res.json({
      message: 'Configurações atualizadas com sucesso',
      config
    });
  });

  /**
   * Estatísticas do tenant
   * GET /api/v1/tenants/:id/stats
   */
  estatisticas = asyncHandler(async (req: Request, res: Response) => {
    const id = String(req.params.id);

    // Usuário normal só pode ver stats do seu próprio tenant
    if (!req.isSuperAdmin && id !== req.tenantId) {
      throw new ForbiddenError('Você não tem permissão para acessar estas estatísticas');
    }

    const [
      totalUsuarios,
      totalPets,
      totalAtendimentos,
      totalVeterinarios,
      atendimentosAtivos,
      veterinariosOnline
    ] = await Promise.all([
      prisma.usuario.count({ where: { tenant_id: id } }),
      prisma.pet.count({ where: { tenant_id: id } }),
      prisma.solicitacao.count({ where: { tenant_id: id } }),
      prisma.veterinario.count({ where: { tenant_id: id } }),
      prisma.solicitacao.count({
        where: {
          tenant_id: id,
          status: { in: ['procurando_veterinario', 'veterinario_encontrado', 'a_caminho', 'atendimento_em_andamento'] }
        }
      }),
      prisma.veterinario.count({
        where: {
          tenant_id: id,
          online: true
        }
      })
    ]);

    const tenant = await prisma.tenant.findUnique({
      where: { id },
      select: {
        limite_usuarios: true,
        limite_pets: true,
        plano: true,
        status: true
      }
    });

    // Antes da migração, organização inexistente estourava TypeError (500) ao
    // ler `tenant.limite_usuarios`; agora responde 404 como as demais rotas.
    if (!tenant) {
      throw new NotFoundError('Organização não encontrada');
    }

    return res.json({
      usuarios: {
        total: totalUsuarios,
        limite: tenant.limite_usuarios,
        percentual: (totalUsuarios / tenant.limite_usuarios * 100).toFixed(1)
      },
      pets: {
        total: totalPets,
        limite: tenant.limite_pets,
        percentual: (totalPets / tenant.limite_pets * 100).toFixed(1)
      },
      atendimentos: {
        total: totalAtendimentos,
        ativos: atendimentosAtivos
      },
      veterinarios: {
        total: totalVeterinarios,
        online: veterinariosOnline
      },
      plano: tenant.plano,
      status: tenant.status
    });
  });

  /**
   * Deletar tenant (apenas super_admin)
   * DELETE /api/v1/tenants/:id
   */
  deletar = asyncHandler(async (req: Request, res: Response) => {
    const id = String(req.params.id);

    // Verificar se tem dados
    const totalUsuarios = await prisma.usuario.count({
      where: { tenant_id: id }
    });

    if (totalUsuarios > 0) {
      throw new ForbiddenError(
        'Não é possível deletar organização com usuários. Considere suspender ao invés de deletar.'
      );
    }

    const alvo = await prisma.tenant.findUnique({ where: { id }, select: { nome: true, slug: true, status: true } });

    await prisma.tenant.delete({ where: { id } });

    await AuditService.logForensicEvent({
      req,
      entityType: 'Tenant',
      entityId: id,
      action: 'tenant.removido',
      estadoAnterior: { nome: alvo?.nome, slug: alvo?.slug, status: alvo?.status },
      motivo: 'Organização removida pelo super administrador'
    });

    return res.json({
      message: 'Organização deletada com sucesso'
    });
  });
}

const tenantController = new TenantController();

// As rotas fazem `require('../controllers/tenant.controller')` e leem os
// métodos direto da instância — a forma exportada precisa continuar a mesma.
module.exports = tenantController;

export default tenantController;
