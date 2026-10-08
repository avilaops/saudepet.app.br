import type { Request, Response } from 'express';
import { permiteEscolha } from '../services/escolha-de-veterinario.service';

import * as agendamentoService from '../services/agendamento.service';
import prisma from '../config/database';
const { ForbiddenError, NotFoundError, ValidationError } = require('../middleware/error.middleware');

/**
 * O tutor marcando consulta futura.
 *
 * A agenda existia inteira do lado do profissional — grade semanal, criação com
 * checagem de conflito, remarcação, máquina de status — e o tutor só podia
 * confirmar ou cancelar o que o veterinário criasse. Ou seja: para marcar um
 * check-up, ele precisava ligar.
 *
 * Aqui ele marca sozinho, escolhendo profissional, dia e horário livre. Vale
 * apenas para os tipos sem pressa (os mesmos da vitrine de escolha): agendar
 * uma emergência para quinta-feira não é um recurso, é um mal-entendido.
 */

type RequestAutenticada = Request & { userId?: string; tenantId?: string };

/** Horários livres de um profissional num dia. */
export async function horarios(req: RequestAutenticada, res: Response) {
  const { veterinario_id: veterinarioId, data } = req.query;

  if (!veterinarioId || !data) {
    throw new ValidationError('Informe o profissional e o dia.');
  }

  const livres = await agendamentoService.horariosLivres({
    tenantId: String(req.tenantId),
    veterinarioId: String(veterinarioId),
    data: String(data)
  });

  return res.json({ horarios: livres });
}

export async function marcar(req: RequestAutenticada, res: Response) {
  const {
    veterinario_id: veterinarioId,
    pet_id: petId,
    inicio,
    tipo_atendimento: tipoAtendimento,
    observacoes
  } = req.body || {};

  if (!veterinarioId || !petId || !inicio) {
    throw new ValidationError('Escolha o profissional, o pet e o horário.');
  }

  // Emergência não se agenda. Os tipos que aceitam marcação são os mesmos que
  // aceitam escolha de profissional — e pela mesma razão: não há pressa.
  if (!permiteEscolha(tipoAtendimento)) {
    throw new ValidationError(
      'Este tipo de atendimento é imediato — peça pelo botão de chamar veterinário.'
    );
  }

  // O pet precisa ser de quem está marcando. Sem esta conferência, um id
  // adivinhado marcaria consulta para o animal de outra pessoa.
  const pet = await prisma.pet.findFirst({
    where: { id: String(petId), tutor_id: String(req.userId), tenant_id: String(req.tenantId) },
    select: { id: true }
  });
  if (!pet) throw new NotFoundError('Pet não encontrado');

  const veterinario = await prisma.veterinario.findFirst({
    where: {
      id: String(veterinarioId),
      tenant_id: String(req.tenantId),
      aprovado_admin: true,
      dados_bancarios: { not: null }
    },
    // O preço de catálogo é do PROFISSIONAL. Este `select` estava na consulta
    // do pet, que não tem `catalogo_itens`: o Prisma recusava a consulta e
    // marcar consulta respondia erro 500 para todo tutor (achado em 08/10/2026
    // ao exercitar a agenda em produção; o teste unitário simulava o banco).
    select: {
      id: true,
      catalogo_itens: {
        where: { tipo_atendimento: tipoAtendimento, ativo: true },
        select: { codigo: true, preco: true },
        take: 1
      }
    }
  });
  if (!veterinario) {
    throw new ForbiddenError('Este profissional não está disponível para novos atendimentos.');
  }

  const agendamento = await agendamentoService.criar({
    tenantId: String(req.tenantId),
    veterinarioId: String(veterinarioId),
    tutorId: String(req.userId),
    petId: String(petId),
    inicio,
    tipoAtendimento,
    observacoes: observacoes || null,
    valorEstimado: veterinario.catalogo_itens[0]?.preco == null ? null : Number(veterinario.catalogo_itens[0].preco),
    precoCatalogoCodigo: veterinario.catalogo_itens[0]?.codigo || null,
    criadoPorId: String(req.userId),
    // Marcado pelo tutor nasce pendente: quem escolhe o horário é ele, mas quem
    // confirma que vai é o profissional. O contrário criaria compromisso na
    // agenda de alguém que nem viu o pedido.
    confirmadoDeCara: false
  });

  return res.status(201).json({ agendamento });
}
