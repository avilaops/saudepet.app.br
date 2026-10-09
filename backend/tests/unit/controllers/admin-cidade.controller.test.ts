/**
 * Cidades de cobertura e tabela de preços (`POST /api/v1/admin/cidades`).
 *
 * Até 09/10/2026 a gravação aceitava o id de qualquer organização, gravava
 * preço negativo e trocava em silêncio por R$ 150 o que não fosse número.
 * É a tabela que define quanto o tutor paga e quanto a plataforma retém.
 */
import type { Request, Response } from 'express';
import prisma from '../../../src/config/database';

const controller = require('../../../src/controllers/admin-cidade.controller');
const { errorHandler } = require('../../../src/middleware/error.middleware');

jest.mock('../../../src/services/audit.service', () => ({
  __esModule: true,
  default: { logForensicEvent: jest.fn() }
}));
const AuditService = require('../../../src/services/audit.service').default;

const banco = prisma as unknown as Record<string, Record<string, jest.Mock>>;

const CURITIBA = {
  id: 'cid-1',
  tenant_id: 'tenant-a',
  nome: 'Curitiba',
  estado: 'PR',
  raio_atendimento_km: 25,
  preco_emergencia: 200,
  preco_domiciliar: 180,
  preco_teleorientacao: 90,
  preco_vacinacao: 110,
  preco_avaliacao: 115,
  preco_consulta_rotina: 140,
  percentual_plataforma: 18,
  ativo: true
};

async function salvar(body: Record<string, unknown>, quem: Partial<Request> = {}) {
  const res = { status: jest.fn(), json: jest.fn() } as unknown as Response & { status: jest.Mock; json: jest.Mock };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  const req = { tenantId: 'tenant-a', userId: 'admin-1', isSuperAdmin: false, body, headers: {}, ...quem } as unknown as Request;
  await new Promise<void>((resolve) => {
    res.json.mockImplementation(() => { resolve(); return res; });
    controller.salvarCidade(req, res, (erro: unknown) => { errorHandler(erro, req, res, jest.fn()); resolve(); });
  });
  return res;
}

describe('cidades de cobertura: gravação', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    banco.cidadeCobertura.findFirst.mockResolvedValue(CURITIBA);
    banco.cidadeCobertura.update.mockImplementation(async ({ data }) => ({ ...CURITIBA, ...data }));
    banco.cidadeCobertura.create.mockImplementation(async ({ data }) => ({ id: 'cid-nova', ...data }));
  });

  it('cria com os padrões do schema o que não foi informado', async () => {
    const res = await salvar({ nome: ' Londrina ', estado: 'pr', preco_emergencia: 210 });

    expect(banco.cidadeCobertura.create).toHaveBeenCalledWith({
      data: {
        tenant_id: 'tenant-a',
        nome: 'Londrina',
        estado: 'PR',
        raio_atendimento_km: 20,
        preco_emergencia: 210,
        preco_domiciliar: 150,
        preco_teleorientacao: 80,
        preco_vacinacao: 120,
        preco_avaliacao: 120,
        preco_consulta_rotina: 130,
        percentual_plataforma: 20,
        ativo: true
      }
    });
    expect(res.json.mock.calls[0][0].success).toBe(true);
  });

  it('a cidade de outra organização responde não encontrada e nada é gravado', async () => {
    banco.cidadeCobertura.findFirst.mockResolvedValue(null);
    const res = await salvar({ id: 'cid-de-outro', nome: 'Curitiba', estado: 'PR', preco_emergencia: 1 });

    expect(banco.cidadeCobertura.findFirst).toHaveBeenCalledWith({ where: { id: 'cid-de-outro', tenant_id: 'tenant-a' } });
    expect(res.status).toHaveBeenCalledWith(404);
    expect(banco.cidadeCobertura.update).not.toHaveBeenCalled();
  });

  it('o super admin alcança a cidade de qualquer organização', async () => {
    await salvar({ id: 'cid-1', nome: 'Curitiba', estado: 'PR' }, { isSuperAdmin: true, tenantId: 'tenant-raiz' } as Partial<Request>);

    expect(banco.cidadeCobertura.findFirst).toHaveBeenCalledWith({ where: { id: 'cid-1' } });
    expect(banco.cidadeCobertura.update).toHaveBeenCalled();
  });

  it('atualização parcial mantém os preços gravados e o estado de ativa', async () => {
    banco.cidadeCobertura.findFirst.mockResolvedValue({ ...CURITIBA, ativo: false });
    await salvar({ id: 'cid-1', nome: 'Curitiba', estado: 'PR', preco_vacinacao: '125.50' });

    const { data } = banco.cidadeCobertura.update.mock.calls[0][0];
    expect(data).toMatchObject({
      preco_emergencia: 200,
      preco_vacinacao: 125.5,
      percentual_plataforma: 18,
      raio_atendimento_km: 25,
      ativo: false
    });
  });

  it.each([
    ['preço negativo', { preco_emergencia: -50 }],
    ['preço que não é número', { preco_domiciliar: 'cento e cinquenta' }],
    ['comissão zero', { percentual_plataforma: 0 }],
    ['comissão acima de 100%', { percentual_plataforma: 120 }],
    ['raio zero', { raio_atendimento_km: 0 }]
  ])('recusa %s em vez de gravar outro valor', async (_caso, campo) => {
    const res = await salvar({ id: 'cid-1', nome: 'Curitiba', estado: 'PR', ...campo });

    expect(res.status).toHaveBeenCalledWith(400);
    expect(banco.cidadeCobertura.update).not.toHaveBeenCalled();
  });

  it('estado fora da sigla de duas letras é recusado', async () => {
    const res = await salvar({ nome: 'Curitiba', estado: 'Paraná' });

    expect(res.status).toHaveBeenCalledWith(400);
    expect(banco.cidadeCobertura.create).not.toHaveBeenCalled();
  });

  it('cidade repetida responde conflito, não erro interno', async () => {
    banco.cidadeCobertura.create.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));
    const res = await salvar({ nome: 'Curitiba', estado: 'PR' });

    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('a trilha guarda a tabela de antes e a de depois', async () => {
    await salvar({ id: 'cid-1', nome: 'Curitiba', estado: 'PR', preco_emergencia: 220 });

    expect(AuditService.logForensicEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: 'CIDADE_COBERTURA_ATUALIZADA',
      estadoAnterior: expect.objectContaining({ preco_emergencia: 200 }),
      estadoPosterior: expect.objectContaining({ preco_emergencia: 220 })
    }));
  });
});
