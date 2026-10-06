// Dois campos que a interface oferecia e o produto não coletava.
const prisma = require('../../../src/config/database');

jest.mock('../../../src/config/r2', () => ({
  uploadBuffer: jest.fn().mockResolvedValue('https://cdn.saudepet/arquivo.pdf')
}));
jest.mock('../../../src/services/audit.service', () => ({
  logForensicEvent: jest.fn().mockResolvedValue(undefined)
}));
jest.mock('../../../src/services/indexnow.service', () => ({ notificar: jest.fn() }), { virtual: true });

const { uploadBuffer } = require('../../../src/config/r2');
const formulario = require('../../../src/controllers/formulario.controller');
const conteudo = require('../../../src/controllers/content-admin.controller');

const res = () => {
  const r = {};
  r.json = jest.fn().mockReturnValue(r);
  r.status = jest.fn().mockReturnValue(r);
  return r;
};
const next = (erro) => { throw erro; };

const arquivo = (nome = 'exame.pdf', mimetype = 'application/pdf') => ({
  originalname: nome,
  mimetype,
  size: 1024,
  buffer: Buffer.from('conteudo')
});

const req = (extra = {}) => ({
  params: { id: 'form-1' },
  body: {},
  query: {},
  headers: {},
  ip: '1.1.1.1',
  tenantId: 'tenant-1',
  user: { id: 'user-1', tenant_id: 'tenant-1' },
  ...extra
});

beforeEach(() => jest.clearAllMocks());

describe('Campo "Arquivo" do formulário', () => {
  // O construtor do admin oferecia o tipo e a tela de resposta não renderizava
  // nada: quem pedisse a foto de um exame recebia respostas sem o exame.
  it('sobe o arquivo e devolve a URL com o nome original', async () => {
    prisma.formulario.findFirst.mockResolvedValue({ id: 'form-1' });

    const r = res();
    await formulario.anexar(req({ file: arquivo() }), r, next);

    expect(uploadBuffer).toHaveBeenCalled();
    const resposta = r.json.mock.calls[0][0];
    expect(resposta.url).toBe('https://cdn.saudepet/arquivo.pdf');
    expect(resposta.nome).toBe('exame.pdf');
  });

  it('guarda o arquivo sob o tenant e o formulário', async () => {
    prisma.formulario.findFirst.mockResolvedValue({ id: 'form-1' });

    await formulario.anexar(req({ file: arquivo() }), res(), next);

    expect(uploadBuffer.mock.calls[0][1]).toMatch(/^formularios\/tenant-1\/form-1\//);
  });

  it('recusa anexo a formulário inativo — a rota não é depósito de arquivo', async () => {
    prisma.formulario.findFirst.mockResolvedValue(null);

    await expect(formulario.anexar(req({ file: arquivo() }), res(), next))
      .rejects.toThrow(/não encontrado ou inativo/i);
    expect(uploadBuffer).not.toHaveBeenCalled();
  });

  it('exige o arquivo', async () => {
    await expect(formulario.anexar(req(), res(), next)).rejects.toThrow(/nenhum arquivo/i);
  });
});

describe('Capa do artigo do blog', () => {
  // O editor pedia a capa como URL de texto: ou o artigo saía sem capa, ou a
  // imagem vivia num serviço de terceiros que ninguém controla.
  it('sobe a imagem e devolve a URL', async () => {
    const r = res();
    await conteudo.uploadBlogImage(req({ file: arquivo('capa.jpg', 'image/jpeg') }), r, next);

    expect(uploadBuffer.mock.calls[0][1]).toMatch(/^blog\/tenant-1\//);
    expect(r.json.mock.calls[0][0].url).toBe('https://cdn.saudepet/arquivo.pdf');
  });

  it('exige a imagem', async () => {
    await expect(conteudo.uploadBlogImage(req(), res(), next)).rejects.toThrow(/nenhuma imagem/i);
  });
});
