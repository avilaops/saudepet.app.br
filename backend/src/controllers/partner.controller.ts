import type { Request, Response } from 'express';
import type { PartnerStatus, PartnerType, PartnerUnit, Prisma } from '@prisma/client';
import prisma from '../config/database';
import AuditService from '../services/audit.service';
import { asyncHandler, NotFoundError, BadRequestError } from '../middleware/error.middleware';

/** Query string vem como texto, lista ou objeto; só o texto interessa aqui. */
const textoDaQuery = (valor: unknown): string | undefined =>
  typeof valor === 'string' ? valor : undefined;

/** Tenant do admin autenticado — as rotas administrativas passam pelo `authMiddleware`. */
const tenantDoUsuario = (req: Request) => String(req.user?.tenant_id);

/** Corpo de POST /partners. */
interface CorpoDoParceiro {
  legalName?: string;
  tradeName?: string;
  documentNumber?: string;
  partnerType?: PartnerType;
  description?: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  website?: string;
  logoUrl?: string;
}

/** Corpo de POST /partners/:id/approve. */
interface CorpoDaAprovacao {
  approve?: boolean;
  reason?: string;
}

/** Corpo de POST /partners/:partnerId/units. */
interface CorpoDaUnidade {
  name?: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  addressLine?: string;
  addressNumber?: string;
  complement?: string;
  district?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  latitude?: string | number;
  longitude?: string | number;
  emergencyService?: unknown;
}

/** Corpo de POST /partners/:partnerId/services. */
interface CorpoDoServico {
  name?: string;
  categoryId?: string;
  description?: string;
  publicPrice?: string | number | null;
  priceType?: string;
  requiresScheduling?: unknown;
  estimatedDuration?: string | number;
  partnerUnitId?: string;
}

/** Corpo de POST /partners/categories. */
interface CorpoDaCategoria {
  name?: string;
  slug?: string;
  description?: string;
  icon?: string;
  displayOrder?: unknown;
}

/** Unidades e serviços ativos, do jeito que a tela do parceiro consome. */
const relacoesAtivas = {
  units: { where: { active: true }, orderBy: { createdAt: 'asc' } },
  services: { where: { active: true }, include: { category: true } }
} satisfies Prisma.PartnerInclude;

type ParceiroComRelacoes = Prisma.PartnerGetPayload<{ include: typeof relacoesAtivas }>;

type ParceiroDoUsuario = ParceiroComRelacoes & {
  userRole: string;
  assignedUnit: PartnerUnit | null;
};

/**
 * 🌐 Busca pública de parceiros para tutores
 */
export const listPublicPartners = asyncHandler(async (req: Request, res: Response) => {
  const { limit = 20, page = 1 } = req.query;
  const city = textoDaQuery(req.query.city);
  const state = textoDaQuery(req.query.state);
  const category = textoDaQuery(req.query.category);
  const emergency = req.query.emergency;
  const search = textoDaQuery(req.query.search);
  const tenantSlug = textoDaQuery(req.query.tenant_slug) || process.env.PUBLIC_TENANT_SLUG || 'saudepet';

  let tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) tenant = await prisma.tenant.findFirst();

  const where: Prisma.PartnerWhereInput = {
    tenantId: tenant ? tenant.id : undefined,
    status: 'ACTIVE',
    approvalStatus: 'APPROVED'
  };

  if (search) {
    where.OR = [
      { tradeName: { contains: search, mode: 'insensitive' } },
      { legalName: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } }
    ];
  }

  const unitWhere: Prisma.PartnerUnitWhereInput = {};
  if (city) unitWhere.city = { contains: city, mode: 'insensitive' };
  if (state) unitWhere.state = { equals: state, mode: 'insensitive' };
  if (emergency === 'true') unitWhere.emergencyService = true;

  if (Object.keys(unitWhere).length > 0) {
    where.units = { some: unitWhere };
  }

  if (category) {
    where.services = {
      some: {
        category: { slug: category }
      }
    };
  }

  const take = Math.min(parseInt(String(limit)), 50);
  const skip = (parseInt(String(page)) - 1) * take;

  const [partners, total] = await Promise.all([
    prisma.partner.findMany({
      where,
      select: {
        id: true,
        tradeName: true,
        partnerType: true,
        description: true,
        logoUrl: true,
        rating: true,
        totalReviews: true,
        units: {
          where: { active: true },
          select: {
            id: true,
            name: true,
            city: true,
            state: true,
            district: true,
            emergencyService: true,
            phone: true,
            whatsapp: true
          }
        },
        services: {
          where: { active: true },
          select: {
            id: true,
            name: true,
            publicPrice: true,
            category: { select: { name: true, slug: true, icon: true } }
          },
          take: 5
        }
      },
      orderBy: [{ rating: 'desc' }, { tradeName: 'asc' }],
      skip,
      take
    }),
    prisma.partner.count({ where })
  ]);

  return res.json({
    success: true,
    count: partners.length,
    total,
    page: parseInt(String(page)),
    totalPages: Math.ceil(total / take),
    partners
  });
});

/**
 * 🛡️ ADMIN: Lista todos os parceiros do tenant, em qualquer status
 * (fila de aprovação do painel administrativo).
 */
export const listAllPartners = asyncHandler(async (req: Request, res: Response) => {
  const { limit = 50, page = 1 } = req.query;
  const status = textoDaQuery(req.query.status);
  const search = textoDaQuery(req.query.search);

  const where: Prisma.PartnerWhereInput = {};
  if (req.user?.tenant_id) where.tenantId = req.user.tenant_id;
  // O status chega como texto livre da query; quem o valida é o Prisma, como
  // antes da migração.
  if (status) where.status = status as PartnerStatus;

  if (search) {
    where.OR = [
      { tradeName: { contains: search, mode: 'insensitive' } },
      { legalName: { contains: search, mode: 'insensitive' } },
      { documentNumber: { contains: search } }
    ];
  }

  const take = Math.min(parseInt(String(limit)), 100);
  const skip = (parseInt(String(page)) - 1) * take;

  const [partners, total] = await Promise.all([
    prisma.partner.findMany({
      where,
      select: {
        id: true,
        legalName: true,
        tradeName: true,
        documentNumber: true,
        partnerType: true,
        status: true,
        approvalStatus: true,
        email: true,
        phone: true,
        createdAt: true,
        units: {
          select: { id: true, name: true, city: true, state: true }
        },
        services: {
          select: { id: true, name: true },
          take: 5
        }
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take
    }),
    prisma.partner.count({ where })
  ]);

  return res.json({
    success: true,
    count: partners.length,
    total,
    page: parseInt(String(page)),
    totalPages: Math.ceil(total / take),
    partners
  });
});

/**
 * 🔍 Detalhes públicos de um parceiro específico
 */
export const getPartnerDetails = asyncHandler(async (req: Request, res: Response) => {
  const id = String(req.params.id);

  const partner = await prisma.partner.findUnique({
    where: { id },
    include: {
      units: { where: { active: true } },
      services: {
        where: { active: true },
        include: { category: true }
      },
      reviews: {
        take: 10,
        orderBy: { createdAt: 'desc' }
      }
    }
  });

  if (!partner || partner.status !== 'ACTIVE') {
    throw new NotFoundError('Estabelecimento parceiro não encontrado ou inativo');
  }

  return res.json({ success: true, partner });
});

/**
 * 🏢 ADMIN: Cadastrar novo parceiro
 */
export const createPartner = asyncHandler(async (req: Request, res: Response) => {
  const corpo: CorpoDoParceiro = req.body;
  const { legalName, tradeName, documentNumber, partnerType, description, email, phone, whatsapp, website, logoUrl } = corpo;

  if (!legalName || !tradeName || !documentNumber || !email || !phone) {
    throw new BadRequestError('Preencha os campos obrigatórios: Razão Social, Nome Fantasia, CNPJ/CPF, E-mail e Telefone');
  }

  const existing = await prisma.partner.findUnique({ where: { documentNumber } });
  if (existing) {
    throw new BadRequestError('Já existe um parceiro cadastrado com este CNPJ/CPF');
  }

  // `req.user?.tenant_id || 'saudepet'` criava o parceiro num tenant que não
  // existe quando o admin não tem organização — um registro órfão, invisível em
  // qualquer listagem, sem erro nenhum na tela.
  if (!req.user?.tenant_id) {
    throw new BadRequestError('Sua conta não está vinculada a uma organização.');
  }

  const partner = await prisma.partner.create({
    data: {
      tenantId: req.user.tenant_id,
      legalName,
      tradeName,
      documentNumber,
      partnerType: partnerType || 'CLINIC',
      description,
      email,
      phone,
      whatsapp,
      website,
      logoUrl,
      status: 'PENDING_REVIEW',
      approvalStatus: 'PENDING'
    }
  });

  return res.status(201).json({ success: true, message: 'Parceiro cadastrado com sucesso e enviado para revisão', partner });
});

/**
 * 🛡️ ADMIN: Aprovar ou rejeitar parceiro
 */
export const approvePartner = asyncHandler(async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const corpo: CorpoDaAprovacao = req.body;
  const { approve, reason } = corpo;

  // Sem o tenant no `where`, um admin aprovava parceiro de outra organização
  // só com o identificador.
  const partner = await prisma.partner.findFirst({ where: { id, tenantId: tenantDoUsuario(req) } });
  if (!partner) throw new NotFoundError('Parceiro não encontrado');

  const updated = await prisma.partner.update({
    where: { id },
    data: {
      status: approve ? 'ACTIVE' : 'REJECTED',
      approvalStatus: approve ? 'APPROVED' : 'REJECTED',
      approvedAt: approve ? new Date() : null,
      approvedBy: approve ? req.user?.id : null,
      suspensionReason: approve ? null : (reason || 'Cadastro não aprovado na análise cadastral')
    }
  });

  // Aprovar parceiro o torna visivel aos tutores e elegivel a comissao.
  await AuditService.logForensicEvent({
    req,
    entityType: 'Partner',
    entityId: updated.id,
    action: approve ? 'parceiro.aprovado' : 'parceiro.rejeitado',
    estadoPosterior: { approvalStatus: updated.approvalStatus, status: updated.status },
    motivo: approve ? 'Parceiro aprovado na analise cadastral' : (reason || 'Cadastro nao aprovado na analise cadastral'),
    detalhes: { tradeName: updated.tradeName || null }
  });

  return res.json({
    success: true,
    message: approve ? 'Parceiro aprovado e ativado com sucesso!' : 'Cadastro de parceiro rejeitado',
    partner: updated
  });
});

/**
 * 📍 Cadastrar unidade para o parceiro
 */
export const addUnit = asyncHandler(async (req: Request, res: Response) => {
  const partnerId = String(req.params.partnerId);
  const corpo: CorpoDaUnidade = req.body;
  const { name, email, phone, whatsapp, addressLine, addressNumber, complement, district, city, state, postalCode, latitude, longitude, emergencyService } = corpo;

  const partner = await prisma.partner.findFirst({ where: { id: partnerId, tenantId: tenantDoUsuario(req) } });
  if (!partner) throw new NotFoundError('Parceiro não encontrado');

  if (!name || !addressLine || !addressNumber || !district || !city || !state || !postalCode) {
    throw new BadRequestError('Preencha nome, logradouro, número, bairro, cidade, estado e CEP da unidade.');
  }

  const unit = await prisma.partnerUnit.create({
    data: {
      partnerId,
      name,
      email,
      phone,
      whatsapp,
      addressLine,
      addressNumber,
      complement,
      district,
      city,
      state,
      postalCode,
      latitude: latitude ? parseFloat(String(latitude)) : null,
      longitude: longitude ? parseFloat(String(longitude)) : null,
      emergencyService: Boolean(emergencyService)
    }
  });

  return res.status(201).json({ success: true, unit });
});

/**
 * 💉 Cadastrar serviço oferecido pelo parceiro
 */
export const addService = asyncHandler(async (req: Request, res: Response) => {
  const partnerId = String(req.params.partnerId);
  const corpo: CorpoDoServico = req.body;
  const { name, categoryId, description, publicPrice, priceType, requiresScheduling, estimatedDuration, partnerUnitId } = corpo;

  const partner = await prisma.partner.findFirst({ where: { id: partnerId, tenantId: tenantDoUsuario(req) } });
  if (!partner) throw new NotFoundError('Parceiro não encontrado');

  if (!name || !categoryId || publicPrice === undefined || publicPrice === null) {
    throw new BadRequestError('Informe nome, categoria e preço do serviço.');
  }

  const categoria = await prisma.partnerCategory.findUnique({ where: { id: categoryId } });
  if (!categoria) throw new BadRequestError('Categoria de serviço não encontrada.');

  const service = await prisma.partnerService.create({
    data: {
      partnerId,
      partnerUnitId: partnerUnitId || null,
      categoryId,
      name,
      description,
      publicPrice,
      priceType: priceType || 'FIXED',
      requiresScheduling: requiresScheduling !== undefined ? Boolean(requiresScheduling) : true,
      estimatedDuration: estimatedDuration ? parseInt(String(estimatedDuration)) : 30
    }
  });

  return res.status(201).json({ success: true, service });
});

/**
 * 🏷️ Categorias de serviço dos parceiros
 *
 * `PartnerService.categoryId` é obrigatório e não existia NENHUMA rota que
 * listasse ou criasse categoria: mesmo com a rota de cadastro de serviço
 * pronta, não havia como descobrir um `categoryId` válido pelo produto.
 */
export const listCategories = asyncHandler(async (_req: Request, res: Response) => {
  const categories = await prisma.partnerCategory.findMany({
    where: { active: true },
    orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }]
  });

  return res.json({ success: true, categories });
});

export const createCategory = asyncHandler(async (req: Request, res: Response) => {
  const corpo: CorpoDaCategoria = req.body || {};
  const { name, slug, description, icon, displayOrder } = corpo;

  if (!name || !String(name).trim()) {
    throw new BadRequestError('Informe o nome da categoria.');
  }

  const identificador = (slug || String(name))
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  const existente = await prisma.partnerCategory.findUnique({ where: { slug: identificador } });
  if (existente) {
    throw new BadRequestError('Já existe uma categoria com este nome.');
  }

  const category = await prisma.partnerCategory.create({
    data: {
      name: String(name).trim(),
      slug: identificador,
      description: description?.trim() || null,
      icon: icon?.trim() || null,
      displayOrder: Number.isFinite(Number(displayOrder)) ? Number(displayOrder) : 0
    }
  });

  return res.status(201).json({ success: true, category });
});

/**
 * 🗂️ ADMIN: Parceiro com unidades e serviços, para a tela de gestão
 */
export const getPartnerForAdmin = asyncHandler(async (req: Request, res: Response) => {
  const id = String(req.params.id);

  const partner = await prisma.partner.findFirst({
    where: { id, tenantId: tenantDoUsuario(req) },
    include: {
      units: { orderBy: { createdAt: 'asc' } },
      services: {
        orderBy: { createdAt: 'asc' },
        include: { category: { select: { id: true, name: true, slug: true } } }
      }
    }
  });

  if (!partner) throw new NotFoundError('Parceiro não encontrado');

  return res.json({
    success: true,
    partner: {
      ...partner,
      services: partner.services.map((servico) => ({ ...servico, publicPrice: Number(servico.publicPrice) }))
    }
  });
});

/**
 * 🩺 Retorna os estabelecimentos parceiros aos quais o usuário logado tem acesso
 */
export const getMyPartners = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId;
  const user = req.user;

  let partners: Array<ParceiroComRelacoes | ParceiroDoUsuario> = [];

  if (user?.tipo_usuario === 'admin' || user?.tipo_usuario === 'super_admin') {
    partners = await prisma.partner.findMany({
      where: user.tenant_id ? { tenantId: user.tenant_id } : {},
      include: relacoesAtivas,
      orderBy: { tradeName: 'asc' }
    });
  } else {
    // Busca por vínculos em PartnerUser
    const memberships = await prisma.partnerUser.findMany({
      where: { userId, active: true },
      include: {
        partner: {
          include: relacoesAtivas
        },
        unit: true
      }
    });

    const partnerList: ParceiroDoUsuario[] = memberships
      .filter((m) => m.partner)
      .map((m) => ({
        ...m.partner,
        userRole: m.role,
        assignedUnit: m.unit || null
      }));

    // Se o email do usuário bater diretamente com o email do parceiro
    if (user?.email) {
      const emailMatches = await prisma.partner.findMany({
        where: { email: user.email, status: 'ACTIVE' },
        include: relacoesAtivas
      });
      for (const p of emailMatches) {
        if (!partnerList.some((existing) => existing.id === p.id)) {
          partnerList.push({ ...p, userRole: 'OWNER', assignedUnit: null });
        }
      }
    }

    partners = partnerList;
  }

  return res.json({
    success: true,
    count: partners.length,
    partners
  });
});
