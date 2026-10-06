jest.mock('../../../src/config/r2', () => ({
  uploadBuffer: jest.fn(),
  deleteObject: jest.fn(),
  getSignedDownloadUrl: jest.fn(async (chave) => `https://assinada.exemplo/${chave}`)
}));

// O envio dispara push para quem está com o app fechado; aqui isso é ruído.
jest.mock('../../../src/services/push.service', () => ({
  enviarParaUsuario: jest.fn(async () => undefined)
}));

const prisma = require('../../../src/config/database');
const { getSignedDownloadUrl } = require('../../../src/config/r2');
const mensagemController = require('../../../src/controllers/mensagem.controller');

function responseDouble() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

describe('Mensagem Controller - Unit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Envio de Mensagem', () => {
    it('deve validar dados obrigatórios da mensagem', () => {
      const mensagem = {
        solicitacao_id: 'sol-123',
        remetente_id: 'user-123',
        conteudo: 'Olá, como está o pet?',
        tipo: 'texto'
      };

      expect(mensagem).toHaveProperty('solicitacao_id');
      expect(mensagem).toHaveProperty('remetente_id');
      expect(mensagem).toHaveProperty('conteudo');
      expect(mensagem.conteudo.length).toBeGreaterThan(0);
    });
  });

  describe('Tipos de Mensagem', () => {
    it('deve aceitar tipos válidos', () => {
      const tiposValidos = ['texto', 'imagem', 'arquivo'];
      
      expect(tiposValidos).toContain('texto');
      expect(tiposValidos).toContain('imagem');
      expect(tiposValidos.length).toBe(3);
    });
  });

  describe('Listagem de Mensagens', () => {
    it('deve filtrar mensagens por solicitação', () => {
      const filtro = {
        solicitacao_id: 'sol-123',
        limite: 50,
        ordem: 'asc'
      };

      expect(filtro).toHaveProperty('solicitacao_id');
      expect(filtro.limite).toBeGreaterThan(0);
    });
  });

  describe('Marcação de Leitura', () => {
    it('deve marcar mensagem como lida', () => {
      const leitura = {
        mensagem_id: 'msg-123',
        lida: true,
        lida_em: new Date()
      };

      expect(leitura).toHaveProperty('mensagem_id');
      expect(leitura.lida).toBe(true);
      expect(leitura.lida_em).toBeInstanceOf(Date);
    });
  });

  describe('Validação de Conteúdo', () => {
    it('deve validar tamanho do conteúdo', () => {
      const conteudoCurto = 'Oi';
      const conteudoNormal = 'Esta é uma mensagem de teste';
      
      expect(conteudoCurto.length).toBeGreaterThan(0);
      expect(conteudoNormal.length).toBeLessThan(5000);
    });
  });
  /**
   * Contrato que as telas de chat consomem quando o binário já saiu do R2 pela
   * política de retenção (`anexo-retencao.worker.js`). Sem `url: null` +
   * `arquivo_removido`, a bolha renderizaria uma imagem quebrada.
   */
  describe('Anexo removido pela política de retenção', () => {
    const anexoRemovido = {
      id: 'anexo-1',
      tipo: 'imagem',
      nome_original: 'raio-x.jpg',
      mime_type: 'image/jpeg',
      tamanho_bytes: 40960,
      storage_key: 'chat/tenant-a/user-1/raio-x.jpg',
      arquivo_removido_em: new Date('2026-05-01')
    };

    const reqBase = (extra = {}) => ({
      tenantId: 'tenant-a',
      userId: 'user-tutor',
      userType: 'tutor',
      params: { id: 'msg-1' },
      body: {},
      query: {},
      app: { get: () => null },
      ...extra
    });

    beforeEach(() => {
      prisma.mensagem.findFirst.mockResolvedValue({
        id: 'msg-1',
        tenant_id: 'tenant-a',
        destinatario_id: 'user-tutor',
        remetente_id: 'vet-1',
        lida_em: null
      });
    });

    it('devolve url nula e a bandeira em vez de assinar objeto inexistente', async () => {
      prisma.mensagem.update.mockResolvedValue({
        id: 'msg-1',
        tenant_id: 'tenant-a',
        remetente_id: 'vet-1',
        destinatario_id: 'user-tutor',
        deletada_em: null,
        anexos: [anexoRemovido]
      });

      const res = responseDouble();
      await mensagemController.marcarLida(reqBase(), res, jest.fn());

      const [anexo] = res.json.mock.calls[0][0].mensagem.anexos;
      expect(anexo.url).toBeNull();
      expect(anexo.arquivo_removido).toBe(true);
      expect(anexo.arquivo_removido_em).toEqual(new Date('2026-05-01'));
      // Metadados permanecem: a tela ainda diz de que arquivo se trata.
      expect(anexo.nome_original).toBe('raio-x.jpg');
      // E a chave do objeto nunca vaza para o cliente.
      expect(anexo.storage_key).toBeUndefined();
      expect(getSignedDownloadUrl).not.toHaveBeenCalled();
    });

    it('anexo com binário vivo continua saindo com URL assinada', async () => {
      prisma.mensagem.update.mockResolvedValue({
        id: 'msg-1',
        tenant_id: 'tenant-a',
        remetente_id: 'vet-1',
        destinatario_id: 'user-tutor',
        deletada_em: null,
        anexos: [{ ...anexoRemovido, arquivo_removido_em: null }]
      });

      const res = responseDouble();
      await mensagemController.marcarLida(reqBase(), res, jest.fn());

      const [anexo] = res.json.mock.calls[0][0].mensagem.anexos;
      expect(anexo.arquivo_removido).toBe(false);
      expect(anexo.url).toBe('https://assinada.exemplo/chat/tenant-a/user-1/raio-x.jpg');
    });
  });

  /**
   * Vídeo curto de sintoma (convulsão, claudicação, dificuldade respiratória) —
   * o caso clínico que uma foto não mostra. Do ponto de vista desta rota ele é
   * só mais um anexo: mesma tabela `mensagens_anexos`, mesma URL assinada e a
   * mesma retenção do `anexo-retencao.worker.js`. O que muda é o `tipo`, que a
   * tela usa para decidir entre <img> e <video>.
   */
  describe('Envio de vídeo', () => {
    const arquivoDeVideo = (mimetype = 'video/mp4') => ({
      originalname: 'convulsao.mp4',
      mimetype,
      size: 18 * 1024 * 1024,
      buffer: Buffer.from('clipe-falso')
    });

    const reqDeEnvio = (body, file) => ({
      tenantId: 'tenant-a',
      userId: 'user-tutor',
      userType: 'tutor',
      user: { nome: 'Tutor' },
      params: {},
      query: {},
      body,
      file,
      app: { get: () => null }
    });

    beforeEach(() => {
      prisma.solicitacao.findFirst.mockResolvedValue({
        id: '11111111-1111-4111-8111-111111111111',
        tutor_id: 'user-tutor',
        veterinario: { usuario_id: 'user-vet' }
      });
    });

    it('grava o tipo "video" na mensagem e no anexo', async () => {
      prisma.mensagem.create.mockImplementation(async ({ data }) => ({
        id: 'msg-video',
        ...data,
        anexos: data.anexos.create.map((anexo, indice) => ({
          id: `anexo-${indice}`,
          tipo: anexo.tipo,
          nome_original: anexo.nome_original,
          mime_type: anexo.mime_type,
          tamanho_bytes: anexo.tamanho_bytes,
          storage_key: anexo.storage_key,
          arquivo_removido_em: null
        }))
      }));

      const res = responseDouble();
      await mensagemController.enviar(
        reqDeEnvio({ solicitacao_id: '11111111-1111-4111-8111-111111111111', tipo: 'video' }, arquivoDeVideo()),
        res,
        jest.fn()
      );

      expect(res.status).toHaveBeenCalledWith(201);

      const { data } = prisma.mensagem.create.mock.calls[0][0];
      expect(data.tipo).toBe('video');
      expect(data.anexos.create[0].tipo).toBe('video');
      expect(data.anexos.create[0].mime_type).toBe('video/mp4');
      // Mesma pasta dos demais anexos do chat — é o prefixo que a retenção varre.
      expect(data.anexos.create[0].storage_key).toMatch(/^chat\/tenant-a\/user-tutor\//);

      const { mensagem } = res.json.mock.calls[0][0];
      expect(mensagem.tipo).toBe('video');
      expect(mensagem.anexos[0].tipo).toBe('video');
      expect(mensagem.anexos[0].url).toContain('https://assinada.exemplo/chat/');
      expect(mensagem.anexos[0].storage_key).toBeUndefined();
    });

    it('recusa vídeo declarado como imagem — a bolha erraria a renderização', async () => {
      const res = responseDouble();
      const next = jest.fn();

      await mensagemController.enviar(
        reqDeEnvio({ solicitacao_id: '11111111-1111-4111-8111-111111111111', tipo: 'imagem' }, arquivoDeVideo()),
        res,
        next
      );

      expect(prisma.mensagem.create).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
      expect(next.mock.calls[0][0].message).toMatch(/vídeo/i);
    });

    it('tipo "video" sem arquivo é recusado', async () => {
      const res = responseDouble();
      const next = jest.fn();

      await mensagemController.enviar(
        reqDeEnvio({ solicitacao_id: '11111111-1111-4111-8111-111111111111', tipo: 'video' }, null),
        res,
        next
      );

      expect(prisma.mensagem.create).not.toHaveBeenCalled();
      expect(next.mock.calls[0][0].message).toMatch(/arquivo/i);
    });
  });
});
