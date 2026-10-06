// Cadastro de parceiro pelo painel. As rotas existiam e nenhuma tela as usava:
// o admin só sabia aprovar o que não conseguia criar.
const prisma = require('../../../src/config/database');

jest.mock('../../../src/services/audit.service', () => ({
  logForensicEvent: jest.fn().mockResolvedValue(undefined)
}));

const parceiro = require('../../../src/controllers/partner.controller');

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
  headers: {},
  ip: '1.1.1.1',
  user: { id: 'admin-1', tenant_id: 'tenant-1' },
  ...extra
});

const dadosDoParceiro = {
  legalName: 'Vida Animal LTDA',
  tradeName: 'Clínica Vida Animal',
  documentNumber: '00.000.000/0001-00',
  email: 'contato@vidaanimal.com',
  phone: '1130000000'
};

beforeEach(() => {
  jest.clearAllMocks();
  prisma.partner.findUnique.mockResolvedValue(null);
  prisma.partner.create.mockImplementation(({ data }) => Promise.resolve({ id: 'p1', ...data }));
});

describe('Cadastrar parceiro', () => {
  it('cria no tenant de quem cadastrou, aguardando análise', async () => {
    const r = res();
    await parceiro.createPartner(req({ body: dadosDoParceiro }), r, next);

    const dados = prisma.partner.create.mock.calls[0][0].data;
    expect(dados.tenantId).toBe('tenant-1');
    expect(dados.approvalStatus).toBe('PENDING');
    expect(dados.status).toBe('PENDING_REVIEW');
  });

  it('recusa admin sem organização em vez de criar um registro órfão', async () => {
    // `req.user?.tenant_id || 'saudepet'` criava o parceiro num tenant que não
    // existe: registro invisível em qualquer listagem, sem erro na tela.
    await expect(parceiro.createPartner(
      req({ body: dadosDoParceiro, user: { id: 'admin-1' } }), res(), next
    )).rejects.toThrow(/organização/i);

    expect(prisma.partner.create).not.toHaveBeenCalled();
  });

  it('recusa CNPJ já cadastrado', async () => {
    prisma.partner.findUnique.mockResolvedValue({ id: 'existente' });

    await expect(parceiro.createPartner(req({ body: dadosDoParceiro }), res(), next))
      .rejects.toThrow(/já existe/i);
  });

  it('cobra os campos obrigatórios com 400, não com 500', async () => {
    // `BadRequestError` era importado e não existia no módulo de erros: todo
    // caminho de validação daqui estourava "is not a constructor".
    const erro = await parceiro.createPartner(req({ body: { tradeName: 'Só o nome' } }), res(), next)
      .catch((e) => e);

    expect(erro.statusCode).toBe(400);
    expect(erro.message).toMatch(/obrigatórios/i);
  });
});

describe('Unidades e serviços', () => {
  it('não deixa pendurar unidade em parceiro de outro tenant', async () => {
    prisma.partner.findFirst.mockResolvedValue(null);

    await expect(parceiro.addUnit(
      req({ params: { partnerId: 'p-de-outro' }, body: { name: 'Matriz' } }), res(), next
    )).rejects.toThrow(/não encontrado/i);

    expect(prisma.partner.findFirst.mock.calls[0][0].where.tenantId).toBe('tenant-1');
  });

  it('exige endereço completo — sem ele a unidade some das buscas por cidade', async () => {
    prisma.partner.findFirst.mockResolvedValue({ id: 'p1' });

    await expect(parceiro.addUnit(
      req({ params: { partnerId: 'p1' }, body: { name: 'Matriz' } }), res(), next
    )).rejects.toThrow(/logradouro/i);
  });

  it('recusa serviço com categoria inexistente', async () => {
    prisma.partner.findFirst.mockResolvedValue({ id: 'p1' });
    prisma.partnerCategory.findUnique.mockResolvedValue(null);

    await expect(parceiro.addService(
      req({ params: { partnerId: 'p1' }, body: { name: 'Consulta', categoryId: 'nao-existe', publicPrice: 120 } }),
      res(), next
    )).rejects.toThrow(/categoria/i);
  });

  it('cadastra o serviço quando a categoria existe', async () => {
    prisma.partner.findFirst.mockResolvedValue({ id: 'p1' });
    prisma.partnerCategory.findUnique.mockResolvedValue({ id: 'cat_consulta' });
    prisma.partnerService.create.mockResolvedValue({ id: 's1' });

    await parceiro.addService(
      req({ params: { partnerId: 'p1' }, body: { name: 'Consulta', categoryId: 'cat_consulta', publicPrice: 120 } }),
      res(), next
    );

    expect(prisma.partnerService.create.mock.calls[0][0].data.name).toBe('Consulta');
  });
});

describe('Categorias de serviço', () => {
  it('lista as ativas — sem elas não há como cadastrar serviço nenhum', async () => {
    prisma.partnerCategory.findMany.mockResolvedValue([{ id: 'cat_consulta', name: 'Consulta veterinária' }]);

    const r = res();
    await parceiro.listCategories(req(), r, next);

    expect(prisma.partnerCategory.findMany.mock.calls[0][0].where).toEqual({ active: true });
    expect(r.json.mock.calls[0][0].categories).toHaveLength(1);
  });

  it('gera slug sem acento a partir do nome', async () => {
    prisma.partnerCategory.findUnique.mockResolvedValue(null);
    prisma.partnerCategory.create.mockImplementation(({ data }) => Promise.resolve(data));

    await parceiro.createCategory(req({ body: { name: 'Nutrição e Dietética' } }), res(), next);

    expect(prisma.partnerCategory.create.mock.calls[0][0].data.slug).toBe('nutricao-e-dietetica');
  });
});
