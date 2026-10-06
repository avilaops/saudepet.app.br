import type { Request, Response } from 'express';
import prisma from '../config/database';
import AuditService from '../services/audit.service';
import { asyncHandler, NotFoundError } from '../middleware/error.middleware';
import { catalogoDoVeterinario, salvarCatalogoDoVeterinario } from '../services/catalogo-veterinario.service';
import type { SalvarCatalogoVeterinarioInput } from '../schemas/catalogo-veterinario.schema';

async function veterinarioDaSessao(usuarioId: string, tenantId: string) {
  const veterinario = await prisma.veterinario.findFirst({
    where: { usuario_id: usuarioId, tenant_id: tenantId },
    select: { id: true }
  });
  if (!veterinario) throw new NotFoundError('Perfil de veterinário não encontrado');
  return veterinario;
}

export const obterMeuCatalogo = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = String(req.tenantId);
  const veterinario = await veterinarioDaSessao(String(req.userId), tenantId);
  const itens = await catalogoDoVeterinario(veterinario.id, tenantId);

  return res.json({
    success: true,
    publicado: itens.some((item) => item.ativo),
    itens
  });
});

export const salvarMeuCatalogo = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = String(req.tenantId);
  const veterinario = await veterinarioDaSessao(String(req.userId), tenantId);
  const entrada = req.body as SalvarCatalogoVeterinarioInput;
  const itens = await salvarCatalogoDoVeterinario({ veterinarioId: veterinario.id, tenantId, entrada });

  await AuditService.logForensicEvent({
    req,
    entityType: 'catalogo_veterinario',
    entityId: veterinario.id,
    action: 'catalogo_atualizado',
    detalhes: {
      itens_ativos: itens.filter((item) => item.ativo).length,
      categorias_ativas: [...new Set(itens.filter((item) => item.ativo).map((item) => item.categoria))]
    }
  });

  return res.json({
    success: true,
    message: 'Horários e valores publicados com sucesso.',
    publicado: itens.some((item) => item.ativo),
    itens
  });
});
