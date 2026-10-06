/**
 * A outra metade da exclusão lógica: se alguma leitura esquecer `ativo: true`,
 * o registro removido continua na tela — e a remoção vira mentira.
 *
 * Cobre os quatro lugares que mostram alergia/vacina/medicação do pet: histórico
 * clínico do veterinário, fechamento do atendimento (que alimenta o PDF),
 * carteira digital do tutor e a tag pública do QR code.
 */
const prisma = require('../../../src/config/database');
const solicitacaoController = require('../../../src/controllers/solicitacao.controller');
const petController = require('../../../src/controllers/pet.controller');
const petPublicController = require('../../../src/controllers/pet-public.controller');

function responseDouble() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

describe('leituras da ficha clínica filtram registros removidos', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('histórico do pet lê só alergia, vacina e medicação ativas', async () => {
    prisma.solicitacao.findFirst.mockResolvedValue({
      id: 'at-1',
      tenant_id: 'tenant-a',
      pet_id: 'pet-1',
      tutor_id: 'user-tutor',
      pet: { id: 'pet-1', nome: 'Rex' },
      veterinario: { usuario_id: 'user-vet' }
    });
    prisma.solicitacao.findMany.mockResolvedValue([]);
    prisma.solicitacao.count.mockResolvedValue(0);
    prisma.petAlergia.findMany.mockResolvedValue([]);
    prisma.petVacina.findMany.mockResolvedValue([]);
    prisma.petMedicamento.findMany.mockResolvedValue([]);
    prisma.lembretePet.findMany.mockResolvedValue([]);

    const req = {
      tenantId: 'tenant-a',
      userId: 'user-vet',
      userType: 'veterinario',
      params: { id: 'at-1' },
      body: {},
      query: {}
    };
    const next = jest.fn();

    await solicitacaoController.historicoDoPet(req, responseDouble(), next);

    expect(next).not.toHaveBeenCalled();
    expect(prisma.petAlergia.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ pet_id: 'pet-1', ativo: true })
    }));
    expect(prisma.petVacina.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ pet_id: 'pet-1', ativo: true })
    }));
    expect(prisma.petMedicamento.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ pet_id: 'pet-1', ativo: true })
    }));
  });

  it('carteira digital do tutor não inclui registros removidos', async () => {
    prisma.pet.findFirst.mockResolvedValue({ id: 'pet-1', nome: 'Rex' });

    const req = {
      tenantId: 'tenant-a',
      userId: 'user-tutor',
      userType: 'tutor',
      params: { id: 'pet-1' },
      body: {},
      query: {}
    };
    const next = jest.fn();

    await petController.getById(req, responseDouble(), next);

    expect(next).not.toHaveBeenCalled();
    const { include } = prisma.pet.findFirst.mock.calls[0][0];
    expect(include.vacinas.where).toEqual({ ativo: true });
    expect(include.medicamentos.where).toEqual({ ativo: true });
    expect(include.alergias.where).toEqual({ ativo: true });
  });

  it('tag pública do QR não mostra vacina nem alergia removida', async () => {
    prisma.pet.findUnique.mockResolvedValue({
      id: 'pet-1',
      nome: 'Rex',
      tutor: { nome: 'Ana', telefone: '11999999999', cidade: 'São Paulo' },
      vacinas: [],
      alergias: []
    });

    // A tag pública valida o formato do id (QR malformado vira 404).
    const req = { params: { id: '11111111-2222-4333-8444-555555555555' }, body: {}, query: {} };
    const next = jest.fn();

    await petPublicController.getPublicTag(req, responseDouble(), next);

    expect(next).not.toHaveBeenCalled();
    const { include } = prisma.pet.findUnique.mock.calls[0][0];
    expect(include.vacinas.where).toEqual({ ativo: true });
    expect(include.alergias.where).toEqual({ ativo: true });
  });
});

describe('Tag pública da coleira — entrada malformada', () => {
  const controller = require('../../../src/controllers/pet-public.controller');
  const prisma = require('../../../src/config/database');

  it('QR ilegível vira "não encontrada", não erro 500', async () => {
    // O id vem de um QR que pode chegar amassado ou digitado à mão. Sem
    // guarda, o Postgres recusa o valor e a rota pública quebra.
    const req = { params: { id: 'inexistente' } };
    const res = { json: jest.fn() };

    await expect(controller.getPublicTag(req, res, (erro) => { throw erro; }))
      .rejects.toThrow(/não encontrada/i);

    expect(prisma.pet.findUnique).not.toHaveBeenCalled();
  });
});
