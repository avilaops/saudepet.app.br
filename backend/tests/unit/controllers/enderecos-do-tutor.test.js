// Endereços salvos do tutor.
//
// Mesmo com o mapa no passo do endereço, escolher o local do zero a cada chamado
// é atrito no pior momento possível: o pet passando mal e a pessoa procurando a
// própria casa no mapa.
const prisma = require('../../../src/config/database');
const enderecos = require('../../../src/controllers/endereco.controller');

const res = () => {
  const r = {};
  r.json = jest.fn().mockReturnValue(r);
  r.status = jest.fn().mockReturnValue(r);
  return r;
};
const next = (erro) => { throw erro; };

const req = (extra = {}) => ({
  body: {},
  params: {},
  query: {},
  userId: 'tutor-1',
  tenantId: 'tenant-1',
  ...extra
});

const novo = {
  rotulo: 'Casa',
  endereco: 'Rua Vergueiro, 1000 - São Paulo',
  latitude: -23.5613,
  longitude: -46.6565
};

beforeEach(() => {
  jest.clearAllMocks();
  prisma.$transaction.mockImplementation((arg) =>
    typeof arg === 'function' ? arg(prisma) : Promise.all(arg));
  prisma.enderecoTutor.count.mockResolvedValue(0);
  prisma.enderecoTutor.updateMany.mockResolvedValue({ count: 0 });
  prisma.enderecoTutor.create.mockImplementation(({ data }) => Promise.resolve({ id: 'end-1', ...data }));
});

describe('Salvar endereço', () => {
  it('o primeiro endereço vira o principal sozinho', async () => {
    // Sem isto a pessoa salvaria um endereço e ele não seria sugerido em lugar
    // nenhum.
    await enderecos.criar(req({ body: novo }), res(), next);

    expect(prisma.enderecoTutor.create.mock.calls[0][0].data.principal).toBe(true);
  });

  it('marcar um novo como principal desmarca o anterior', async () => {
    prisma.enderecoTutor.count.mockResolvedValue(2);

    await enderecos.criar(req({ body: { ...novo, principal: true } }), res(), next);

    expect(prisma.enderecoTutor.updateMany).toHaveBeenCalledWith({
      where: { tutor_id: 'tutor-1', tenant_id: 'tenant-1' },
      data: { principal: false }
    });
  });

  it('endereço adicional não rouba o principal sem pedir', async () => {
    prisma.enderecoTutor.count.mockResolvedValue(1);

    await enderecos.criar(req({ body: novo }), res(), next);

    expect(prisma.enderecoTutor.create.mock.calls[0][0].data.principal).toBe(false);
  });

  it('recusa salvar sem coordenada', async () => {
    await expect(enderecos.criar(req({ body: { ...novo, latitude: null } }), res(), next))
      .rejects.toThrow(/mapa/i);
  });

  it('recusa endereço vazio', async () => {
    await expect(enderecos.criar(req({ body: { ...novo, endereco: '' } }), res(), next))
      .rejects.toThrow(/endereço/i);
  });
});

describe('Listar endereços', () => {
  it('ordena pelo principal e pelo que a pessoa realmente usa', async () => {
    // Ordenar por data de cadastro deixaria o endereço de uma viagem antiga no
    // topo da lista.
    prisma.enderecoTutor.findMany.mockResolvedValue([]);

    await enderecos.listar(req(), res(), next);

    const consulta = prisma.enderecoTutor.findMany.mock.calls[0][0];
    expect(consulta.where).toEqual({ tutor_id: 'tutor-1', tenant_id: 'tenant-1' });
    expect(consulta.orderBy[0]).toEqual({ principal: 'desc' });
    expect(consulta.orderBy[1]).toEqual({ usado_em: 'desc' });
  });
});

describe('Remover endereço', () => {
  it('apagar o principal promove o próximo', async () => {
    // Senão a lista fica sem principal e o passo do endereço volta a começar do
    // zero a cada chamado.
    prisma.enderecoTutor.findFirst
      .mockResolvedValueOnce({ id: 'end-1', principal: true })
      .mockResolvedValueOnce({ id: 'end-2' });
    prisma.enderecoTutor.delete.mockResolvedValue({});
    prisma.enderecoTutor.update.mockResolvedValue({});

    await enderecos.remover(req({ params: { id: 'end-1' } }), res(), next);

    expect(prisma.enderecoTutor.update).toHaveBeenCalledWith({
      where: { id: 'end-2' }, data: { principal: true }
    });
  });

  it('não mexe no endereço de outra pessoa', async () => {
    prisma.enderecoTutor.findFirst.mockResolvedValue(null);

    await expect(enderecos.remover(req({ params: { id: 'end-de-outro' } }), res(), next))
      .rejects.toThrow(/não encontrado/i);
    expect(prisma.enderecoTutor.delete).not.toHaveBeenCalled();
  });
});
