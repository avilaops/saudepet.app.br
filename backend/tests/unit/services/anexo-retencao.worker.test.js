jest.mock('../../../src/config/r2', () => ({
  deleteObject: jest.fn(),
  listObjects: jest.fn()
}));

const prisma = require('../../../src/config/database');
const { deleteObject, listObjects } = require('../../../src/config/r2');
const worker = require('../../../src/services/anexo-retencao.worker');

const DIA = 86400000;

function objetoNoBucket(key, idadeHoras) {
  return { Key: key, LastModified: new Date(Date.now() - idadeHoras * 3600000) };
}

describe('Worker de retenção dos anexos do chat', () => {
  const envOriginal = process.env.ANEXO_RETENCAO_DIAS;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.ANEXO_RETENCAO_DIAS;
    prisma.mensagemAnexo.findMany.mockResolvedValue([]);
    prisma.mensagemAnexo.update.mockResolvedValue({});
    deleteObject.mockResolvedValue(undefined);
    listObjects.mockResolvedValue({ Contents: [], IsTruncated: false });
  });

  afterAll(() => {
    if (envOriginal === undefined) delete process.env.ANEXO_RETENCAO_DIAS;
    else process.env.ANEXO_RETENCAO_DIAS = envOriginal;
  });

  describe('prazo de retenção', () => {
    it('usa 90 dias por padrão e respeita ANEXO_RETENCAO_DIAS', () => {
      expect(worker.diasDeRetencao()).toBe(worker.DIAS_PADRAO);

      process.env.ANEXO_RETENCAO_DIAS = '30';
      expect(worker.diasDeRetencao()).toBe(30);
    });

    it('limita valor absurdo aos extremos em vez de aceitar', () => {
      process.env.ANEXO_RETENCAO_DIAS = '0';
      expect(worker.diasDeRetencao()).toBe(7);

      process.env.ANEXO_RETENCAO_DIAS = '999999';
      expect(worker.diasDeRetencao()).toBe(3650);

      process.env.ANEXO_RETENCAO_DIAS = 'nao-e-numero';
      expect(worker.diasDeRetencao()).toBe(worker.DIAS_PADRAO);
    });
  });

  describe('anexos de mensagem excluída', () => {
    it('só busca anexo com binário vivo e mensagem excluída antes do corte', async () => {
      process.env.ANEXO_RETENCAO_DIAS = '90';

      await worker.removerAnexosExpirados();

      const { where } = prisma.mensagemAnexo.findMany.mock.calls[0][0];
      expect(where.arquivo_removido_em).toBeNull();
      expect(where.mensagem.deletada_em.not).toBeNull();

      // O corte é o "agora" menos o prazo: mensagem apagada há menos que isso
      // não entra na consulta — é assim que "não apaga antes do prazo" é imposto.
      const diasDeCorte = (Date.now() - where.mensagem.deletada_em.lt.getTime()) / DIA;
      expect(diasDeCorte).toBeCloseTo(90, 1);
    });

    it('mensagem apagada há menos que o prazo não é devolvida pelo filtro', async () => {
      process.env.ANEXO_RETENCAO_DIAS = '90';
      // O filtro é do banco; aqui o que se verifica é que uma exclusão de 10 dias
      // atrás fica DEPOIS do corte e portanto fora do `lt`.
      await worker.removerAnexosExpirados();

      const { where } = prisma.mensagemAnexo.findMany.mock.calls[0][0];
      const apagadaHa10Dias = new Date(Date.now() - 10 * DIA);
      expect(apagadaHa10Dias < where.mensagem.deletada_em.lt).toBe(false);

      const apagadaHa200Dias = new Date(Date.now() - 200 * DIA);
      expect(apagadaHa200Dias < where.mensagem.deletada_em.lt).toBe(true);
    });

    it('apaga o binário no R2 e marca arquivo_removido_em — sem apagar a linha', async () => {
      prisma.mensagemAnexo.findMany.mockResolvedValue([
        { id: 'anexo-1', storage_key: 'chat/tenant-a/user-1/123-abc.jpg' }
      ]);

      const { encontrados, removidos } = await worker.removerAnexosExpirados();

      expect(encontrados).toBe(1);
      expect(removidos).toBe(1);
      expect(deleteObject).toHaveBeenCalledWith('chat/tenant-a/user-1/123-abc.jpg');
      expect(prisma.mensagemAnexo.update).toHaveBeenCalledWith({
        where: { id: 'anexo-1' },
        data: { arquivo_removido_em: expect.any(Date) }
      });
      // A auditoria do conteúdo é intencional: some o arquivo, não o registro.
      expect(prisma.mensagemAnexo.delete).not.toHaveBeenCalled();
    });

    it('falha no R2 NÃO marca a coluna: o próximo ciclo tenta de novo', async () => {
      prisma.mensagemAnexo.findMany.mockResolvedValue([
        { id: 'anexo-1', storage_key: 'chat/tenant-a/user-1/123-abc.jpg' }
      ]);
      deleteObject.mockRejectedValue(new Error('R2 fora'));

      const { removidos } = await worker.removerAnexosExpirados();

      expect(removidos).toBe(0);
      expect(prisma.mensagemAnexo.update).not.toHaveBeenCalled();
    });

    it('um anexo com erro não derruba os demais do lote', async () => {
      prisma.mensagemAnexo.findMany.mockResolvedValue([
        { id: 'anexo-quebrado', storage_key: 'chat/a/1.jpg' },
        { id: 'anexo-2', storage_key: 'chat/a/2.jpg' }
      ]);
      deleteObject
        .mockRejectedValueOnce(new Error('R2 fora'))
        .mockResolvedValueOnce(undefined);

      const { encontrados, removidos } = await worker.removerAnexosExpirados();

      expect(encontrados).toBe(2);
      expect(removidos).toBe(1);
      expect(prisma.mensagemAnexo.update).toHaveBeenCalledTimes(1);
      expect(prisma.mensagemAnexo.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'anexo-2' } })
      );
    });
  });

  describe('varredura de órfãos', () => {
    it('lista apenas o prefixo dos anexos de chat', async () => {
      await worker.varrerOrfaosDoChat();

      expect(listObjects).toHaveBeenCalledWith(
        expect.objectContaining({ prefix: 'chat/' })
      );
      expect(worker.PREFIXO_CHAT).toBe('chat/');
    });

    it('apaga o objeto sem linha no banco', async () => {
      listObjects.mockResolvedValue({
        Contents: [objetoNoBucket('chat/tenant-a/user-1/orfao.jpg', 48)],
        IsTruncated: false
      });
      prisma.mensagemAnexo.findMany.mockResolvedValue([]);

      const { examinados, removidos } = await worker.varrerOrfaosDoChat();

      expect(examinados).toBe(1);
      expect(removidos).toBe(1);
      expect(deleteObject).toHaveBeenCalledWith('chat/tenant-a/user-1/orfao.jpg');
    });

    it('não toca em objeto que TEM linha no banco', async () => {
      listObjects.mockResolvedValue({
        Contents: [objetoNoBucket('chat/tenant-a/user-1/vivo.jpg', 48)],
        IsTruncated: false
      });
      prisma.mensagemAnexo.findMany.mockResolvedValue([
        { storage_key: 'chat/tenant-a/user-1/vivo.jpg' }
      ]);

      const { removidos } = await worker.varrerOrfaosDoChat();

      expect(removidos).toBe(0);
      expect(deleteObject).not.toHaveBeenCalled();
    });

    it('ignora objeto com menos de 24h — pode ser upload em curso', async () => {
      listObjects.mockResolvedValue({
        Contents: [objetoNoBucket('chat/tenant-a/user-1/recem-subido.jpg', 2)],
        IsTruncated: false
      });

      const { examinados, removidos } = await worker.varrerOrfaosDoChat();

      expect(examinados).toBe(0);
      expect(removidos).toBe(0);
      expect(deleteObject).not.toHaveBeenCalled();
      // Sem candidato não há sequer consulta ao banco.
      expect(prisma.mensagemAnexo.findMany).not.toHaveBeenCalled();
    });

    it('nunca apaga objeto de prefixo alheio, mesmo que o R2 devolva um', async () => {
      // Cinto e suspensório: a listagem já vai com `Prefix`, mas a varredura é
      // cega ao conteúdo — banner, foto de pet e PDF de receita não têm linha em
      // `mensagens_anexos` e seriam apagados se escapassem do filtro.
      listObjects.mockResolvedValue({
        Contents: [
          objetoNoBucket('banners/tenant-a/hero.webp', 480),
          objetoNoBucket('pets/pet-1/foto.jpg', 480),
          objetoNoBucket('receitas/receita_123.pdf', 480),
          objetoNoBucket('chat/tenant-a/user-1/orfao.jpg', 480)
        ],
        IsTruncated: false
      });
      prisma.mensagemAnexo.findMany.mockResolvedValue([]);

      const { removidos } = await worker.varrerOrfaosDoChat();

      expect(removidos).toBe(1);
      expect(deleteObject).toHaveBeenCalledTimes(1);
      expect(deleteObject).toHaveBeenCalledWith('chat/tenant-a/user-1/orfao.jpg');
    });

    it('segue a paginação do ListObjectsV2', async () => {
      listObjects
        .mockResolvedValueOnce({
          Contents: [objetoNoBucket('chat/a/1.jpg', 48)],
          IsTruncated: true,
          NextContinuationToken: 'token-2'
        })
        .mockResolvedValueOnce({
          Contents: [objetoNoBucket('chat/a/2.jpg', 48)],
          IsTruncated: false
        });
      prisma.mensagemAnexo.findMany.mockResolvedValue([]);

      const { paginas, removidos } = await worker.varrerOrfaosDoChat();

      expect(paginas).toBe(2);
      expect(removidos).toBe(2);
      expect(listObjects).toHaveBeenNthCalledWith(2, expect.objectContaining({ continuationToken: 'token-2' }));
    });
  });

  describe('ciclo completo', () => {
    it('falha na varredura de órfãos não anula a remoção já feita', async () => {
      prisma.mensagemAnexo.findMany.mockResolvedValue([
        { id: 'anexo-1', storage_key: 'chat/a/1.jpg' }
      ]);
      listObjects.mockRejectedValue(new Error('R2 fora'));

      const { expirados, orfaos } = await worker.processarRetencaoDeAnexos();

      expect(expirados.removidos).toBe(1);
      expect(orfaos.removidos).toBe(0);
    });
  });
});
