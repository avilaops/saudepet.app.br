import type { Request, Response } from 'express';
import type { CidadeCobertura, Prisma } from '@prisma/client';
import prisma from '../config/database';
import AuditService from '../services/audit.service';
import { ValidationError, asyncHandler } from '../middleware/error.middleware';

/** Corpo de POST /admin/cidades: nome e estado obrigatórios, o resto com padrão. */
interface CorpoDaCidade {
  id?: string;
  nome?: string;
  estado?: string;
  raio_atendimento_km?: unknown;
  preco_emergencia?: unknown;
  preco_domiciliar?: unknown;
  preco_teleorientacao?: unknown;
  preco_vacinacao?: unknown;
  preco_avaliacao?: unknown;
  preco_consulta_rotina?: unknown;
  percentual_plataforma?: unknown;
  ativo?: unknown;
}

class AdminCidadeController {
  // Listar Cidades de Cobertura
  listarCidades = asyncHandler(async (req: Request, res: Response) => {
    const where: Prisma.CidadeCoberturaWhereInput = {};
    if (req.tenantId && !req.isSuperAdmin) where.tenant_id = req.tenantId;

    const cidades = await prisma.cidadeCobertura.findMany({
      where,
      orderBy: { nome: 'asc' }
    });

    return res.json({ success: true, cidades });
  });

  // Criar ou Atualizar Cidade de Cobertura e Preços
  salvarCidade = asyncHandler(async (req: Request, res: Response) => {
    const corpo: CorpoDaCidade = req.body;
    const {
      id, nome, estado, raio_atendimento_km,
      preco_emergencia, preco_domiciliar, preco_teleorientacao,
      preco_vacinacao, preco_avaliacao, preco_consulta_rotina,
      percentual_plataforma, ativo
    } = corpo;
    const adminId = req.userId;

    if (!nome || !estado) {
      throw new ValidationError('Nome e estado da cidade são obrigatórios.');
    }

    let cidade: CidadeCobertura;
    if (id) {
      cidade = await prisma.cidadeCobertura.update({
        where: { id },
        data: {
          nome,
          estado,
          raio_atendimento_km: Number(raio_atendimento_km) || 20,
          preco_emergencia: Number(preco_emergencia) || 150.00,
          preco_domiciliar: Number(preco_domiciliar) || 150.00,
          preco_teleorientacao: Number(preco_teleorientacao) || 80.00,
          preco_vacinacao: Number(preco_vacinacao) || 120.00,
          preco_avaliacao: Number(preco_avaliacao) || 120.00,
          preco_consulta_rotina: Number(preco_consulta_rotina) || 130.00,
          // `|| 20` e não `?? 20`: comissão zero não é configuração, é engano.
          percentual_plataforma: Number(percentual_plataforma) || 20,
          ativo: ativo !== false
        }
      });
    } else {
      cidade = await prisma.cidadeCobertura.create({
        data: {
          tenant_id: String(req.tenantId),
          nome,
          estado,
          raio_atendimento_km: Number(raio_atendimento_km) || 20,
          preco_emergencia: Number(preco_emergencia) || 150.00,
          preco_domiciliar: Number(preco_domiciliar) || 150.00,
          preco_teleorientacao: Number(preco_teleorientacao) || 80.00,
          preco_vacinacao: Number(preco_vacinacao) || 120.00,
          preco_avaliacao: Number(preco_avaliacao) || 120.00,
          preco_consulta_rotina: Number(preco_consulta_rotina) || 130.00,
          // `|| 20` e não `?? 20`: comissão zero não é configuração, é engano.
          percentual_plataforma: Number(percentual_plataforma) || 20,
          ativo: ativo !== false
        }
      });
    }

    // Registrar no Log Pericial
    AuditService.logForensicEvent({
      req,
      entityType: 'configuracao_cidade',
      entityId: cidade.id,
      action: id ? 'CIDADE_COBERTURA_ATUALIZADA' : 'CIDADE_COBERTURA_CRIADA',
      motivo: `Preços e raio ajustados para ${nome}/${estado} por ${adminId}`
    });

    return res.json({
      success: true,
      message: 'Cidade e tabela de preços salvas com sucesso!',
      cidade
    });
  });
}

const adminCidadeController = new AdminCidadeController();

// As rotas fazem `require('../controllers/admin-cidade.controller')` e leem os
// métodos direto da instância — a forma exportada precisa continuar a mesma.
module.exports = adminCidadeController;

export default adminCidadeController;
