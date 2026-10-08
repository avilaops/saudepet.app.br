/**
 * Só o dono da agenda mexe na consulta.
 *
 * Até 08/10/2026 as rotas do veterinário para mudar status e remarcar
 * conferiam apenas o tenant: quem conhecesse o id confirmava, cancelava ou
 * mudava o horário da consulta de um colega da mesma operação.
 */
import prisma from '../../../src/config/database';
import { alterarStatus, remarcar } from '../../../src/services/agendamento.service';

const banco = prisma as unknown as {
  $transaction: jest.Mock;
  agendamento: { findFirst: jest.Mock; update: jest.Mock };
  agendaDisponivel: { findMany: jest.Mock };
};

const TENANT = 'tenant-1';
const MEU = 'vet-1';
const DE_OUTRO = 'vet-2';

function amanhaAs(hora: number): Date {
  const data = new Date();
  data.setDate(data.getDate() + 1);
  data.setHours(hora, 0, 0, 0);
  return data;
}

const consulta = { id: 'ag-1', tenant_id: TENANT, veterinario_id: MEU, status: 'confirmado', inicio: amanhaAs(10), fim: amanhaAs(11) };

describe('agendamento: só o dono da agenda altera', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    banco.$transaction.mockImplementation((callback: (tx: unknown) => unknown) => callback(prisma));
    banco.agendaDisponivel.findMany.mockResolvedValue([]);
    banco.agendamento.update.mockImplementation(({ data }: { data: object }) => Promise.resolve({ ...consulta, ...data }));
    // O banco só devolve a consulta para o filtro que bate com o dono dela.
    banco.agendamento.findFirst.mockImplementation(({ where }: { where: { id?: string | { not: string }; veterinario_id?: string } }) => {
      if (where.id !== consulta.id) return Promise.resolve(null); // busca de conflito
      if (where.veterinario_id && where.veterinario_id !== consulta.veterinario_id) return Promise.resolve(null);
      return Promise.resolve(consulta);
    });
  });

  it('remarca a própria consulta, mantendo a duração', async () => {
    const remarcada = await remarcar({ tenantId: TENANT, agendamentoId: 'ag-1', veterinarioId: MEU, inicio: amanhaAs(15) });

    expect(banco.agendamento.findFirst).toHaveBeenCalledWith({ where: { id: 'ag-1', tenant_id: TENANT, veterinario_id: MEU } });
    expect(remarcada.inicio).toEqual(amanhaAs(15));
    expect(remarcada.fim).toEqual(amanhaAs(16));
    // Horário novo, lembrete novo.
    expect(banco.agendamento.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ lembrete_enviado: false }) }));
  });

  it('não remarca a consulta de outro veterinário', async () => {
    await expect(
      remarcar({ tenantId: TENANT, agendamentoId: 'ag-1', veterinarioId: DE_OUTRO, inicio: amanhaAs(15) })
    ).rejects.toThrow(/não encontrado/i);
    expect(banco.agendamento.update).not.toHaveBeenCalled();
  });

  it('não cancela nem dá falta na consulta de outro veterinário', async () => {
    for (const novoStatus of ['cancelado', 'nao_compareceu'] as const) {
      await expect(
        alterarStatus({ tenantId: TENANT, agendamentoId: 'ag-1', veterinarioId: DE_OUTRO, novoStatus, usuarioId: 'user-2' })
      ).rejects.toThrow(/não encontrado/i);
    }
    expect(banco.agendamento.update).not.toHaveBeenCalled();
  });

  it('o dono continua mudando o status da própria consulta', async () => {
    const atualizada = await alterarStatus({ tenantId: TENANT, agendamentoId: 'ag-1', veterinarioId: MEU, novoStatus: 'cancelado', usuarioId: 'user-1', motivo: 'imprevisto' });

    expect(atualizada.status).toBe('cancelado');
  });

  it('sem veterinário informado (caminho do tutor, que confere a posse antes) segue pelo tenant', async () => {
    await alterarStatus({ tenantId: TENANT, agendamentoId: 'ag-1', novoStatus: 'cancelado', usuarioId: 'tutor-1' });

    expect(banco.agendamento.findFirst).toHaveBeenCalledWith({ where: { id: 'ag-1', tenant_id: TENANT } });
  });
});
