/**
 * Logo do veterinário na receita e no prontuário.
 *
 * Duas coisas não podem falhar: o que o veterinário envia vira um PNG que o
 * `pdfkit` sabe desenhar, e nada no caminho do logo impede a emissão de um
 * documento clínico — sem logo, a receita sai mesmo assim.
 */
import sharp from 'sharp';
import prisma from '../../../src/config/database';

jest.mock('../../../src/config/r2', () => ({
  uploadBuffer: jest.fn(async (_buffer: Buffer, chave: string) => `https://cdn.teste/${chave}`),
  deleteObject: jest.fn(async () => undefined),
  keyFromUrl: (url: string) => (url.startsWith('https://cdn.teste/') ? url.slice('https://cdn.teste/'.length) : url)
}));
jest.mock('../../../src/middleware/plano-vet.middleware', () => ({
  RECURSOS: { LOGO_DOCUMENTOS: 'documentos_logo' },
  recursosDoVeterinario: jest.fn(async () => ({ plano: { id: 'livre', nome: 'Livre' }, recursos: ['documentos_logo'] }))
}));

import { deleteObject, uploadBuffer } from '../../../src/config/r2';
import { recursosDoVeterinario } from '../../../src/middleware/plano-vet.middleware';
import { logoParaDocumento, prepararLogo, removerLogo, salvarLogo } from '../../../src/services/logo-veterinario.service';

const banco = prisma as unknown as { veterinario: { update: jest.Mock } };
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const imagem = (largura: number, altura: number, formato: 'png' | 'jpeg' | 'webp' = 'png') =>
  sharp({ create: { width: largura, height: altura, channels: 4, background: { r: 21, g: 159, b: 163, alpha: 1 } } })[formato]().toBuffer();

const VET = { id: 'vet-1', tenant_id: 'tenant-1', usuario_id: 'user-1' };
const URL_DO_LOGO = 'https://cdn.teste/veterinarios/vet-1/logo-documentos-1.png';

describe('prepararLogo', () => {
  it.each(['png', 'jpeg', 'webp'] as const)('converte %s em PNG do tamanho do cabeçalho', async (formato) => {
    const saida = await prepararLogo(await imagem(2400, 1200, formato));
    const medidas = await sharp(saida).metadata();

    expect(saida.subarray(0, 8).equals(PNG)).toBe(true);
    expect(medidas.width).toBeLessThanOrEqual(600);
    expect(medidas.height).toBeLessThanOrEqual(200);
    // Proporção preservada: 2:1 não vira quadrado.
    expect(Math.round((medidas.width || 0) / (medidas.height || 1))).toBe(2);
  });

  it('não amplia logo que já cabe', async () => {
    const medidas = await sharp(await prepararLogo(await imagem(300, 100))).metadata();

    expect([medidas.width, medidas.height]).toEqual([300, 100]);
  });

  it('recusa arquivo que não é imagem', async () => {
    await expect(prepararLogo(Buffer.from('<script>alert(1)</script>'))).rejects.toThrow(/Não foi possível ler a imagem/);
  });

  it('recusa imagem pequena demais para imprimir', async () => {
    await expect(prepararLogo(await imagem(40, 40))).rejects.toThrow(/pequena demais/);
  });
});

describe('salvarLogo e removerLogo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    banco.veterinario.update.mockResolvedValue({});
  });

  it('grava o PNG na pasta do veterinário e apaga o logo anterior', async () => {
    const url = await salvarLogo({ ...VET, logo_documentos_url: URL_DO_LOGO }, await imagem(800, 400, 'jpeg'));

    expect(url).toMatch(/^https:\/\/cdn\.teste\/veterinarios\/vet-1\/logo-documentos-\d+\.png$/);
    expect(uploadBuffer).toHaveBeenCalledWith(expect.any(Buffer), expect.stringContaining('veterinarios/vet-1/'), 'image/png');
    expect(banco.veterinario.update).toHaveBeenCalledWith({ where: { id: 'vet-1' }, data: { logo_documentos_url: url } });
    expect(deleteObject).toHaveBeenCalledWith('veterinarios/vet-1/logo-documentos-1.png');
  });

  it('imagem recusada não grava nada', async () => {
    await expect(salvarLogo(VET, Buffer.from('nada'))).rejects.toThrow();

    expect(uploadBuffer).not.toHaveBeenCalled();
    expect(banco.veterinario.update).not.toHaveBeenCalled();
  });

  it('remover limpa a coluna e o arquivo', async () => {
    await removerLogo({ ...VET, logo_documentos_url: URL_DO_LOGO });

    expect(banco.veterinario.update).toHaveBeenCalledWith({ where: { id: 'vet-1' }, data: { logo_documentos_url: null } });
    expect(deleteObject).toHaveBeenCalledWith('veterinarios/vet-1/logo-documentos-1.png');
  });
});

describe('logoParaDocumento', () => {
  let busca: jest.SpyInstance;

  beforeEach(async () => {
    jest.clearAllMocks();
    (recursosDoVeterinario as jest.Mock).mockResolvedValue({ plano: { id: 'livre', nome: 'Livre' }, recursos: ['documentos_logo'] });
    const png = await imagem(300, 100);
    busca = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(png, { status: 200 }));
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => jest.restoreAllMocks());

  it('devolve o PNG do veterinário que tem logo e recurso', async () => {
    const logo = await logoParaDocumento({ ...VET, logo_documentos_url: URL_DO_LOGO });

    expect(logo?.subarray(0, 8).equals(PNG)).toBe(true);
    expect(busca).toHaveBeenCalledWith(URL_DO_LOGO, expect.anything());
  });

  it('sem logo, nem consulta o plano', async () => {
    expect(await logoParaDocumento({ ...VET, logo_documentos_url: null })).toBeNull();
    expect(await logoParaDocumento(null)).toBeNull();
    expect(recursosDoVeterinario).not.toHaveBeenCalled();
  });

  it('plano sem o recurso: o logo fica guardado e não é impresso', async () => {
    (recursosDoVeterinario as jest.Mock).mockResolvedValue({ plano: { id: 'p', nome: 'Básico' }, recursos: [] });

    expect(await logoParaDocumento({ ...VET, logo_documentos_url: URL_DO_LOGO })).toBeNull();
    expect(busca).not.toHaveBeenCalled();
  });

  it.each([
    ['endereço de fora do armazenamento', 'https://exemplo.com/logo.png'],
    ['logo de outro veterinário', 'https://cdn.teste/veterinarios/vet-2/logo-documentos-1.png'],
    ['outro arquivo do próprio veterinário', 'https://cdn.teste/veterinarios/vet-1/documento-abc.pdf']
  ])('não busca %s', async (_caso, url) => {
    expect(await logoParaDocumento({ ...VET, logo_documentos_url: url })).toBeNull();
    expect(busca).not.toHaveBeenCalled();
  });

  it.each([
    ['armazenamento fora do ar', () => Promise.reject(new Error('ECONNREFUSED'))],
    ['arquivo apagado', async () => new Response('', { status: 404 })],
    ['conteúdo que não é PNG', async () => new Response('<html>erro</html>', { status: 200 })]
  ])('%s: devolve null em vez de derrubar a emissão', async (_caso, resposta) => {
    busca.mockImplementation(resposta as () => Promise<Response>);

    await expect(logoParaDocumento({ ...VET, logo_documentos_url: URL_DO_LOGO })).resolves.toBeNull();
  });
});
