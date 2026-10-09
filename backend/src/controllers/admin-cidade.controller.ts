import type { Request, Response } from 'express';
import type { CidadeCobertura, Prisma } from '@prisma/client';
import prisma from '../config/database';
import AuditService from '../services/audit.service';
import { ConflictError, NotFoundError, ValidationError, asyncHandler } from '../middleware/error.middleware';

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

type CampoNumerico =
  | 'raio_atendimento_km'
  | 'preco_emergencia'
  | 'preco_domiciliar'
  | 'preco_teleorientacao'
  | 'preco_vacinacao'
  | 'preco_avaliacao'
  | 'preco_consulta_rotina'
  | 'percentual_plataforma';

const PRECO_MAXIMO = 10000;

/** Padrão de cada campo (o mesmo do schema) e a faixa que faz sentido cobrar. */
const REGRAS: Record<CampoNumerico, { rotulo: string; padrao: number; minimo: number; maximo: number }> = {
  raio_atendimento_km: { rotulo: 'O raio de atendimento', padrao: 20, minimo: 1, maximo: 500 },
  preco_emergencia: { rotulo: 'O preço da emergência', padrao: 150, minimo: 1, maximo: PRECO_MAXIMO },
  preco_domiciliar: { rotulo: 'O preço do atendimento domiciliar', padrao: 150, minimo: 1, maximo: PRECO_MAXIMO },
  preco_teleorientacao: { rotulo: 'O preço da teleorientação', padrao: 80, minimo: 1, maximo: PRECO_MAXIMO },
  preco_vacinacao: { rotulo: 'O preço da vacinação', padrao: 120, minimo: 1, maximo: PRECO_MAXIMO },
  preco_avaliacao: { rotulo: 'O preço da avaliação', padrao: 120, minimo: 1, maximo: PRECO_MAXIMO },
  preco_consulta_rotina: { rotulo: 'O preço da consulta de rotina', padrao: 130, minimo: 1, maximo: PRECO_MAXIMO },
  // Comissão zero não é configuração, é engano: por isso o mínimo é 1.
  percentual_plataforma: { rotulo: 'O percentual da plataforma', padrao: 20, minimo: 1, maximo: 100 }
};

/**
 * Valor de um campo numérico da cidade. Campo ausente mantém o que já estava
 * gravado (ou o padrão, na criação); campo enviado fora da faixa é recusado.
 * Antes, `Number(x) || padrao` gravava preço negativo e trocava em silêncio
 * por R$ 150 qualquer coisa que não fosse número.
 */
function valorDoCampo(corpo: CorpoDaCidade, atual: CidadeCobertura | null, campo: CampoNumerico): number {
  const regra = REGRAS[campo];
  const enviado = corpo[campo];
  if (enviado === undefined || enviado === null || enviado === '') {
    return atual ? Number(atual[campo]) : regra.padrao;
  }
  const numero = Number(enviado);
  if (!Number.isFinite(numero) || numero < regra.minimo || numero > regra.maximo) {
    throw new ValidationError(`${regra.rotulo} deve ficar entre ${regra.minimo} e ${regra.maximo}.`);
  }
  return numero;
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
    const corpo: CorpoDaCidade = req.body || {};
    const nome = String(corpo.nome ?? '').trim();
    const estado = String(corpo.estado ?? '').trim().toUpperCase();

    if (!nome || !estado) {
      throw new ValidationError('Nome e estado da cidade são obrigatórios.');
    }
    if (!/^[A-Z]{2}$/.test(estado)) {
      throw new ValidationError('Informe o estado pela sigla de duas letras, como PR.');
    }

    // A cidade de outra organização responde "não encontrada": o id sozinho
    // não pode ser a chave para mexer no preço de quem não é seu.
    let atual: CidadeCobertura | null = null;
    if (corpo.id) {
      atual = await prisma.cidadeCobertura.findFirst({
        where: { id: corpo.id, ...(req.isSuperAdmin ? {} : { tenant_id: String(req.tenantId) }) }
      });
      if (!atual) throw new NotFoundError('Cidade não encontrada.');
    } else if (!req.tenantId) {
      throw new ValidationError('Sua conta não está ligada a uma organização para cadastrar a cidade.');
    }

    const dados = {
      nome,
      estado,
      raio_atendimento_km: Math.round(valorDoCampo(corpo, atual, 'raio_atendimento_km')),
      preco_emergencia: valorDoCampo(corpo, atual, 'preco_emergencia'),
      preco_domiciliar: valorDoCampo(corpo, atual, 'preco_domiciliar'),
      preco_teleorientacao: valorDoCampo(corpo, atual, 'preco_teleorientacao'),
      preco_vacinacao: valorDoCampo(corpo, atual, 'preco_vacinacao'),
      preco_avaliacao: valorDoCampo(corpo, atual, 'preco_avaliacao'),
      preco_consulta_rotina: valorDoCampo(corpo, atual, 'preco_consulta_rotina'),
      percentual_plataforma: Math.round(valorDoCampo(corpo, atual, 'percentual_plataforma')),
      ativo: corpo.ativo === undefined && atual ? atual.ativo : corpo.ativo !== false
    };

    let cidade: CidadeCobertura;
    try {
      cidade = atual
        ? await prisma.cidadeCobertura.update({ where: { id: atual.id }, data: dados })
        : await prisma.cidadeCobertura.create({ data: { tenant_id: String(req.tenantId), ...dados } });
    } catch (erro) {
      if ((erro as { code?: string }).code === 'P2002') {
        throw new ConflictError(`${nome}/${estado} já está cadastrada.`);
      }
      throw erro;
    }

    // Registrar no Log Pericial
    AuditService.logForensicEvent({
      req,
      entityType: 'configuracao_cidade',
      entityId: cidade.id,
      action: atual ? 'CIDADE_COBERTURA_ATUALIZADA' : 'CIDADE_COBERTURA_CRIADA',
      estadoAnterior: atual,
      estadoPosterior: cidade,
      motivo: `Preços e raio ajustados para ${nome}/${estado} por ${req.userId}`
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
