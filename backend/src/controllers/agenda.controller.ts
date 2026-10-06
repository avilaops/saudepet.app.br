import type { Request } from 'express';
import type { Agendamento, StatusAgendamento } from '@prisma/client';
import prisma from '../config/database';
import { NotFoundError, ValidationError, asyncHandler } from '../middleware/error.middleware';
import { notificarMudancaDeStatus } from '../services/agendamento-notificacao.service';
import * as agendamentoService from '../services/agendamento.service';


// "08:00" — a grade guarda hora como texto, então o formato precisa ser
// validado na entrada; um "8h" gravado aqui quebraria o cálculo de slots.
const HORA_VALIDA = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Uma faixa da grade como chega do formulário, antes de ser validada. */
type ItemDaGrade = { dia_semana?: unknown; hora_inicio?: unknown; hora_fim?: unknown; ativo?: unknown };

class AgendaController {
  // ── Tutor ─────────────────────────────────────────────────────────────────

  // As consultas marcadas para o tutor logado. Fecha a lacuna do ROADMAP:
  // `listarDoTutor` existia no service sem nenhuma rota — o vet marcava e o
  // tutor só ficava sabendo por fora.
  meusAgendamentos = asyncHandler(async (req, res) => {
    const agendamentos = await agendamentoService.listarDoTutor({
      tenantId: req.tenantId as string,
      tutorId: req.userId as string,
      incluirPassados: req.query.passados === '1'
    });

    return res.json({ agendamentos });
  });

  // Confirmar ou cancelar é a única caneta do tutor sobre o agendamento — e só
  // sobre agendamento DELE. A checagem de posse vem antes da máquina de status.
  #alterarStatusComoTutor = async (req: Request, novoStatus: StatusAgendamento): Promise<Agendamento> => {
    const agendamento = await prisma.agendamento.findFirst({
      where: { id: req.params.id, tenant_id: req.tenantId as string },
      select: { id: true, tutor_id: true }
    });

    if (!agendamento || agendamento.tutor_id !== req.userId) {
      throw new NotFoundError('Agendamento não encontrado.');
    }

    const atualizado = await agendamentoService.alterarStatus({
      tenantId: req.tenantId as string,
      agendamentoId: req.params.id,
      novoStatus,
      usuarioId: req.userId,
      motivo: req.body?.motivo
    });

    // Aviso à outra parte é best-effort: o status já mudou.
    notificarMudancaDeStatus(atualizado.id, {
      novoStatus,
      atorId: req.userId,
      motivo: req.body?.motivo
    })
      .catch(() => {});

    return atualizado;
  };

  confirmarAgendamento = asyncHandler(async (req, res) => {
    const agendamento = await this.#alterarStatusComoTutor(req, 'confirmado');
    return res.json({ success: true, agendamento });
  });

  cancelarAgendamento = asyncHandler(async (req, res) => {
    const agendamento = await this.#alterarStatusComoTutor(req, 'cancelado');
    return res.json({ success: true, agendamento });
  });

  // ── Veterinário ───────────────────────────────────────────────────────────

  // Obter grade semanal do veterinário logado
  getMinhaGrade = asyncHandler(async (req, res) => {
    const usuarioId = req.userId;

    const vet = await prisma.veterinario.findFirst({
      where: { usuario_id: usuarioId }
    });

    if (!vet) {
      throw new NotFoundError('Perfil de veterinário não encontrado');
    }

    const agendas = await prisma.agendaDisponivel.findMany({
      where: { veterinario_id: vet.id },
      orderBy: { dia_semana: 'asc' }
    });

    return res.json({ success: true, agendas });
  });

  // Salvar/Atualizar grade semanal do veterinário
  salvarGrade = asyncHandler(async (req, res) => {
    const usuarioId = req.userId;
    const { grade } = req.body; // Array de { dia_semana, hora_inicio, hora_fim }

    const vet = await prisma.veterinario.findFirst({
      where: { usuario_id: usuarioId }
    });

    if (!vet) {
      throw new NotFoundError('Perfil de veterinário não encontrado');
    }

    if (!Array.isArray(grade)) {
      throw new ValidationError('Formato de grade inválido');
    }

    const itens: ItemDaGrade[] = grade;

    // Sem isto, "18:00–08:00" (fim antes do início) ou "8h" entravam direto no
    // banco e a faixa sumia silenciosamente do cálculo de horários livres.
    // `RegExp.test` converte o valor para texto; a conversão explícita aqui é a
    // mesma que ele faria.
    for (const item of itens) {
      const dia = Number(item.dia_semana);
      if (!Number.isInteger(dia) || dia < 0 || dia > 6) {
        throw new ValidationError('Dia da semana inválido na grade (use 0 a 6).');
      }
      if (!HORA_VALIDA.test(String(item.hora_inicio)) || !HORA_VALIDA.test(String(item.hora_fim))) {
        throw new ValidationError('Horário inválido na grade (use o formato HH:MM).');
      }
      if (String(item.hora_inicio) >= String(item.hora_fim)) {
        throw new ValidationError('Na grade, o horário de início precisa vir antes do fim.');
      }
    }

    // Substituir a grade existente na transação
    await prisma.$transaction(async (tx) => {
      await tx.agendaDisponivel.deleteMany({
        where: { veterinario_id: vet.id }
      });

      if (itens.length > 0) {
        await tx.agendaDisponivel.createMany({
          data: itens.map(item => ({
            tenant_id: req.tenantId as string,
            veterinario_id: vet.id,
            dia_semana: Number(item.dia_semana),
            hora_inicio: String(item.hora_inicio),
            hora_fim: String(item.hora_fim),
            ativo: item.ativo !== false
          }))
        });
      }
    });

    return res.json({
      success: true,
      message: 'Grade de horários atualizada com sucesso!'
    });
  });

  // Buscar Horários e Vets Disponíveis para o Tutor Agendar
  getHorariosDisponiveis = asyncHandler(async (req, res) => {
    const dataConsulta = req.query.dataConsulta as string | undefined;

    const dataObj = dataConsulta ? new Date(dataConsulta) : new Date();
    const diaSemana = dataObj.getDay();

    const agendas = await prisma.agendaDisponivel.findMany({
      where: {
        dia_semana: diaSemana,
        ativo: true,
        veterinario: {
          aprovado_admin: true,
          status_credenciamento: 'APPROVED'
        }
      },
      include: {
        veterinario: {
          include: { usuario: { select: { nome: true, foto_perfil: true, cidade: true } } }
        }
      }
    });

    return res.json({
      success: true,
      diaSemana,
      agendas
    });
  });
}

const controller = new AgendaController();

module.exports = controller;
export default controller;
