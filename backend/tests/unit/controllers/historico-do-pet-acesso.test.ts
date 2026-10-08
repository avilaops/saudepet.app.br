/**
 * Quem pode abrir o histórico clínico do pet de um atendimento.
 *
 * O painel do admin ganhou a tela da ficha (`/admin/atendimentos/:id/ficha-do-pet`)
 * em 08/10/2026. A leitura deixava passar o `admin` e barrava o `super_admin`,
 * que já podia corrigir a mesma ficha: para ele a tela abriria em branco.
 * Quem não participa do atendimento continua recebendo "não encontrada", sem
 * pista de que o atendimento existe.
 */
import type { Request, Response } from 'express';
import prisma from '../../../src/config/database';

const solicitacaoController = require('../../../src/controllers/solicitacao.controller');

const banco = prisma as unknown as Record<string, Record<string, jest.Mock>>;

function resposta() {
  const res = { status: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
}

async function abrirComo(userId: string, userType: string) {
  const res = resposta();
  const next = jest.fn();
  const req = { tenantId: 'tenant-a', userId, userType, params: { id: 'at-1' }, body: {}, query: {} };
  await solicitacaoController.historicoDoPet(req as unknown as Request, res as unknown as Response, next);
  return { res, next };
}

describe('histórico clínico do pet: quem pode ler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    banco.solicitacao.findFirst.mockResolvedValue({
      id: 'at-1',
      tenant_id: 'tenant-a',
      pet_id: 'pet-1',
      tutor_id: 'user-tutor',
      pet: { id: 'pet-1', nome: 'Rex' },
      veterinario: { usuario_id: 'user-vet' }
    });
    banco.solicitacao.findMany.mockResolvedValue([]);
    banco.solicitacao.count.mockResolvedValue(0);
    banco.petAlergia.findMany.mockResolvedValue([{ id: 'al-1', descricao: 'Dipirona' }]);
    banco.petVacina.findMany.mockResolvedValue([]);
    banco.petMedicamento.findMany.mockResolvedValue([]);
    banco.lembretePet.findMany.mockResolvedValue([]);
  });

  it.each([
    ['o veterinário do atendimento', 'user-vet', 'veterinario'],
    ['o tutor do pet', 'user-tutor', 'tutor'],
    ['o admin do tenant', 'user-admin', 'admin'],
    ['o super_admin', 'user-super', 'super_admin']
  ])('%s abre', async (_quem, userId, userType) => {
    const { res, next } = await abrirComo(userId, userType);

    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ alergias: [expect.objectContaining({ id: 'al-1' })] }));
  });

  it.each([
    ['outro veterinário', 'user-vet-2', 'veterinario'],
    ['outro tutor', 'user-tutor-2', 'tutor']
  ])('%s recebe "não encontrada" e nada é lido da ficha', async (_quem, userId, userType) => {
    const { res, next } = await abrirComo(userId, userType);

    expect(res.json).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'Solicitação não encontrada' }));
    expect(banco.petAlergia.findMany).not.toHaveBeenCalled();
  });

  it('o admin só enxerga atendimento do próprio tenant', async () => {
    await abrirComo('user-admin', 'admin');

    expect(banco.solicitacao.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'at-1', tenant_id: 'tenant-a' } }));
  });
});
