const prisma = require('../../../src/config/database');

jest.mock('../../../src/config/r2', () => ({
  getSignedDownloadUrl: jest.fn().mockResolvedValue('https://r2/assinada.jpg'),
  uploadBuffer: jest.fn(),
  deleteObject: jest.fn(),
  keyFromUrl: jest.fn(),
  listObjects: jest.fn()
}));

const controller = require('../../../src/controllers/solicitacao.controller');
const { getSignedDownloadUrl } = require('../../../src/config/r2');

const ATENDIMENTO = 'atend-1';

function req(extra = {}) {
  return { params: { id: ATENDIMENTO }, tenantId: 'tenant-1', userId: 'tutor-1', userType: 'tutor', ...extra };
}
const res = () => ({ json: jest.fn() });
const next = (erro) => { throw erro; };

describe('Acervo de arquivos do atendimento', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.solicitacao.findFirst.mockResolvedValue({
      id: ATENDIMENTO,
      tutor_id: 'tutor-1',
      veterinario: { usuario_id: 'vet-usuario-1' }
    });
    prisma.mensagemAnexo.findMany.mockResolvedValue([]);
  });

  it('busca os anexos das mensagens DESTE atendimento, do mais recente ao mais antigo', async () => {
    const resposta = res();
    await controller.anexos(req(), resposta, next);

    const chamada = prisma.mensagemAnexo.findMany.mock.calls[0][0];
    expect(chamada.where).toEqual({ tenant_id: 'tenant-1', mensagem: { atendimento_id: ATENDIMENTO } });
    expect(chamada.orderBy).toEqual({ criado_em: 'desc' });
    expect(resposta.json).toHaveBeenCalledWith({ anexos: [], total: 0 });
  });

  it('assina a URL de cada arquivo vivo e nunca devolve a chave do R2', async () => {
    prisma.mensagemAnexo.findMany.mockResolvedValue([{
      id: 'anexo-1',
      mensagem_id: 'msg-1',
      storage_key: 'chat/secreto.jpg',
      nome_original: 'raio-x.jpg',
      mime_type: 'image/jpeg',
      tamanho_bytes: 1024,
      tipo: 'imagem',
      criado_em: new Date(),
      arquivo_removido_em: null,
      mensagem: { id: 'msg-1', remetente_id: 'tutor-1' }
    }]);

    const resposta = res();
    await controller.anexos(req(), resposta, next);

    const [{ anexos }] = resposta.json.mock.calls[0];
    expect(anexos[0].url).toBe('https://r2/assinada.jpg');
    expect(anexos[0].arquivo_removido).toBe(false);
    expect(anexos[0].storage_key).toBeUndefined();
  });

  it('arquivo já recolhido pela retenção não gera link morto', async () => {
    prisma.mensagemAnexo.findMany.mockResolvedValue([{
      id: 'anexo-2',
      mensagem_id: 'msg-2',
      storage_key: 'chat/apagado.jpg',
      nome_original: 'antigo.jpg',
      mime_type: 'image/jpeg',
      tamanho_bytes: 2048,
      tipo: 'imagem',
      criado_em: new Date(),
      arquivo_removido_em: new Date(),
      mensagem: { id: 'msg-2', remetente_id: 'vet-usuario-1' }
    }]);

    const resposta = res();
    await controller.anexos(req(), resposta, next);

    const [{ anexos }] = resposta.json.mock.calls[0];
    expect(anexos[0].url).toBeNull();
    expect(anexos[0].arquivo_removido).toBe(true);
    // Assinar objeto inexistente seria gasto inútil e link quebrado.
    expect(getSignedDownloadUrl).not.toHaveBeenCalled();
  });

  it('o veterinário do atendimento também acessa', async () => {
    const resposta = res();
    await controller.anexos(req({ userId: 'vet-usuario-1', userType: 'veterinario' }), resposta, next);
    expect(resposta.json).toHaveBeenCalled();
  });

  it('estranho ao atendimento não lê o acervo', async () => {
    await expect(
      controller.anexos(req({ userId: 'intruso', userType: 'tutor' }), res(), next)
    ).rejects.toThrow(/não encontrada/i);

    expect(prisma.mensagemAnexo.findMany).not.toHaveBeenCalled();
  });

  it('atendimento de outro tenant não existe para quem pergunta', async () => {
    prisma.solicitacao.findFirst.mockResolvedValue(null);

    await expect(controller.anexos(req(), res(), next)).rejects.toThrow(/não encontrada/i);
  });
});
