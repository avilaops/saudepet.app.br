/**
 * Mídia do atendimento.
 *
 * O que estes casos travam: o tutor consegue anexar ANTES de alguém aceitar (era
 * o buraco — a foto da ferida só cabia no chat, que abre depois do aceite), o
 * veterinário de plantão consegue ver para decidir, nada entra em atendimento
 * fechado (o prontuário é imutável), ninguém de fora enxerga, e o objeto não fica
 * órfão no armazenamento quando a gravação falha.
 */

jest.mock('../../../src/config/r2', () => ({
  uploadBuffer: jest.fn(),
  deleteObject: jest.fn(),
  getSignedDownloadUrl: jest.fn()
}));

const prisma = require('../../../src/config/database');
const { uploadBuffer, deleteObject, getSignedDownloadUrl } = require('../../../src/config/r2');
const servico = require('../../../src/services/midia-atendimento.service');

const VET_USUARIO = 'usuario-do-vet';
const TENANT = 'tenant-1';

function fotoRecebida(tamanho = 1024, mimetype = 'image/jpeg') {
  return { buffer: Buffer.alloc(8), originalname: 'lesao.jpg', mimetype, size: tamanho };
}

function atendimento(status = 'atendimento_em_andamento') {
  return {
    id: 'atend-1',
    status,
    tutor_id: 'tutor-1',
    veterinario_id: 'vet-1',
    veterinario: { id: 'vet-1', usuario_id: VET_USUARIO }
  };
}

describe('Mídia do atendimento', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.solicitacao.findFirst.mockResolvedValue(atendimento());
    prisma.midiaAtendimento.count.mockResolvedValue(0);
    prisma.midiaAtendimento.create.mockResolvedValue({ id: 'foto-1' });
    prisma.midiaAtendimento.findMany.mockResolvedValue([]);
    uploadBuffer.mockResolvedValue('https://cdn/x');
    deleteObject.mockResolvedValue(undefined);
    getSignedDownloadUrl.mockResolvedValue('https://assinada/x');
  });

  const pedido = {
    atendimentoId: 'atend-1',
    tenantId: TENANT,
    usuarioId: VET_USUARIO,
    papel: 'veterinario' as const,
    arquivo: fotoRecebida(),
    legenda: 'Lesão no membro anterior direito'
  };

  describe('anexar', () => {
    it('guarda sob o prefixo clínico, fora do alcance da retenção do chat', async () => {
      await servico.anexarMidia(pedido);

      const chave = uploadBuffer.mock.calls[0][1];
      expect(chave).toMatch(/^clinico\/atend-1\//);
      expect(chave).not.toMatch(/^chat\//);
    });

    it('recusa formato que não é foto, vídeo nem áudio', async () => {
      await expect(
        servico.anexarMidia({ ...pedido, arquivo: fotoRecebida(1024, 'application/zip') })
      ).rejects.toThrow(/formato não aceito/i);
      expect(uploadBuffer).not.toHaveBeenCalled();
    });

    it('recusa arquivo acima do teto', async () => {
      await expect(
        servico.anexarMidia({ ...pedido, arquivo: fotoRecebida(servico.LIMITE_IMAGEM + 1) })
      ).rejects.toThrow(/passa de/i);
      expect(uploadBuffer).not.toHaveBeenCalled();
    });

    it('não deixa outro veterinário anexar no atendimento alheio', async () => {
      await expect(
        servico.anexarMidia({ ...pedido, usuarioId: 'outro-vet' })
      ).rejects.toThrow(/não está atribuído/i);
      expect(uploadBuffer).not.toHaveBeenCalled();
    });

    it('atendimento finalizado não recebe foto — o prontuário é imutável', async () => {
      prisma.solicitacao.findFirst.mockResolvedValue(atendimento('finalizado'));

      await expect(servico.anexarMidia(pedido)).rejects.toThrow(/finalizado|não muda/i);
      expect(uploadBuffer).not.toHaveBeenCalled();
    });

    it('respeita o teto de fotos por atendimento', async () => {
      prisma.midiaAtendimento.count.mockResolvedValue(servico.MAXIMO_POR_ATENDIMENTO);

      await expect(servico.anexarMidia(pedido)).rejects.toThrow(/limite de/i);
      expect(uploadBuffer).not.toHaveBeenCalled();
    });

    it('falha ao gravar no banco apaga o objeto — sem lixo invisível no bucket', async () => {
      prisma.midiaAtendimento.create.mockRejectedValue(new Error('banco fora'));

      await expect(servico.anexarMidia(pedido)).rejects.toThrow('banco fora');
      expect(deleteObject).toHaveBeenCalledWith(uploadBuffer.mock.calls[0][1]);
    });
  });

  describe('ler', () => {
    it('devolve URL assinada e nunca a chave do armazenamento', async () => {
      prisma.midiaAtendimento.findMany.mockResolvedValue([
        {
          id: 'foto-1',
          legenda: 'Antes',
          nome_original: 'a.jpg',
          mime_type: 'image/jpeg',
          tamanho_bytes: 10,
          criado_em: new Date(),
          storage_key: 'clinico/atend-1/a.jpg'
        }
      ]);

      const fotos = await servico.listarMidias('atend-1', TENANT);

      expect(fotos[0].url).toBe('https://assinada/x');
      expect(fotos[0]).not.toHaveProperty('storage_key');
    });

    it('falha ao assinar devolve url nula em vez de derrubar a leitura', async () => {
      prisma.midiaAtendimento.findMany.mockResolvedValue([
        {
          id: 'foto-1', legenda: null, nome_original: 'a.jpg', mime_type: 'image/jpeg',
          tamanho_bytes: 10, criado_em: new Date(), storage_key: 'clinico/a.jpg'
        }
      ]);
      getSignedDownloadUrl.mockRejectedValue(new Error('R2 fora'));

      const fotos = await servico.listarMidias('atend-1', TENANT);
      expect(fotos[0].url).toBeNull();
    });

    it('quem não participa do atendimento não sabe que ele existe', async () => {
      prisma.solicitacao.findFirst.mockResolvedValue({
        id: 'atend-1', tutor_id: 'tutor-1', veterinario: { usuario_id: VET_USUARIO }
      });

      await expect(
        servico.conferirAcesso({
          atendimentoId: 'atend-1', tenantId: TENANT, usuarioId: 'estranho'
        })
      ).rejects.toThrow(/não encontrado/i);
    });

    it('admin do tenant enxerga, porque responde pelo prontuário', async () => {
      prisma.solicitacao.findFirst.mockResolvedValue({
        id: 'atend-1', tutor_id: 'tutor-1', veterinario: { usuario_id: VET_USUARIO }
      });

      await expect(
        servico.conferirAcesso({
          atendimentoId: 'atend-1', tenantId: TENANT, usuarioId: 'admin-1', tipoDeUsuario: 'admin'
        })
      ).resolves.toBeDefined();
    });
  });

  describe('o tutor anexa ao pedir socorro', () => {
    const doTutor = {
      atendimentoId: 'atend-1',
      tenantId: TENANT,
      usuarioId: 'tutor-1',
      papel: 'tutor' as const,
      arquivo: fotoRecebida(),
      legenda: 'Ferida na pata desde ontem'
    };

    it('consegue anexar com o chamado ainda na fila, antes de qualquer aceite', async () => {
      prisma.solicitacao.findFirst.mockResolvedValue({
        id: 'atend-1', status: 'procurando_veterinario', tutor_id: 'tutor-1', veterinario_id: null, veterinario: null
      });

      await servico.anexarMidia(doTutor);

      expect(uploadBuffer).toHaveBeenCalled();
      expect(prisma.midiaAtendimento.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ autor_papel: 'tutor', veterinario_id: null })
        })
      );
    });

    it('manda vídeo do sintoma, que é o que uma foto não mostra', async () => {
      prisma.solicitacao.findFirst.mockResolvedValue({
        id: 'atend-1', status: 'criado', tutor_id: 'tutor-1', veterinario_id: null, veterinario: null
      });

      await servico.anexarMidia({ ...doTutor, arquivo: fotoRecebida(1024, 'video/mp4') });

      expect(prisma.midiaAtendimento.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ tipo: 'video' }) })
      );
    });

    it('não anexa no chamado de outra pessoa', async () => {
      prisma.solicitacao.findFirst.mockResolvedValue({
        id: 'atend-1', status: 'criado', tutor_id: 'outro-tutor', veterinario_id: null, veterinario: null
      });

      await expect(servico.anexarMidia(doTutor)).rejects.toThrow(/não é seu/i);
      expect(uploadBuffer).not.toHaveBeenCalled();
    });

    it('veterinário de plantão enxerga o chamado na fila — é para isso que ele olha', async () => {
      prisma.solicitacao.findFirst.mockResolvedValue({
        id: 'atend-1', status: 'procurando_veterinario', tutor_id: 'tutor-1', veterinario_id: null, veterinario: null
      });
      prisma.veterinario.findFirst.mockResolvedValue({ id: 'vet-9' });

      await expect(
        servico.conferirAcesso({
          atendimentoId: 'atend-1', tenantId: TENANT, usuarioId: 'vet-de-plantao', tipoDeUsuario: 'veterinario'
        })
      ).resolves.toBeDefined();
    });

    it('depois que alguém aceitou, os outros deixam de enxergar', async () => {
      prisma.solicitacao.findFirst.mockResolvedValue({
        id: 'atend-1', status: 'aceito', tutor_id: 'tutor-1',
        veterinario_id: 'vet-1', veterinario: { usuario_id: VET_USUARIO }
      });

      await expect(
        servico.conferirAcesso({
          atendimentoId: 'atend-1', tenantId: TENANT, usuarioId: 'vet-de-plantao', tipoDeUsuario: 'veterinario'
        })
      ).rejects.toThrow(/não encontrado/i);
    });
  });

  describe('remover', () => {
    it('apaga a linha e o binário enquanto o atendimento está aberto', async () => {
      prisma.midiaAtendimento.findFirst.mockResolvedValue({
        id: 'foto-1',
        storage_key: 'clinico/atend-1/a.jpg',
        atendimento_id: 'atend-1',
        autor_usuario_id: VET_USUARIO,
        atendimento: { status: 'atendimento_em_andamento' }
      });
      prisma.midiaAtendimento.delete.mockResolvedValue({});

      await servico.removerMidia({ midiaId: 'foto-1', tenantId: TENANT, usuarioId: VET_USUARIO });

      expect(prisma.midiaAtendimento.delete).toHaveBeenCalledWith({ where: { id: 'foto-1' } });
      expect(deleteObject).toHaveBeenCalledWith('clinico/atend-1/a.jpg');
    });

    it('depois do fechamento nada sai — nem a foto inconveniente', async () => {
      prisma.midiaAtendimento.findFirst.mockResolvedValue({
        id: 'foto-1',
        storage_key: 'clinico/atend-1/a.jpg',
        atendimento_id: 'atend-1',
        autor_usuario_id: VET_USUARIO,
        atendimento: { status: 'finalizado' }
      });

      await expect(
        servico.removerMidia({ midiaId: 'foto-1', tenantId: TENANT, usuarioId: VET_USUARIO })
      ).rejects.toThrow(/encerrado|não muda/i);
      expect(prisma.midiaAtendimento.delete).not.toHaveBeenCalled();
    });

    it('só quem enviou pode remover', async () => {
      prisma.midiaAtendimento.findFirst.mockResolvedValue({
        id: 'foto-1',
        storage_key: 'clinico/atend-1/a.jpg',
        atendimento_id: 'atend-1',
        autor_usuario_id: 'outro-vet',
        atendimento: { status: 'atendimento_em_andamento' }
      });

      await expect(
        servico.removerMidia({ midiaId: 'foto-1', tenantId: TENANT, usuarioId: VET_USUARIO })
      ).rejects.toThrow(/só quem enviou/i);
      expect(prisma.midiaAtendimento.delete).not.toHaveBeenCalled();
    });
  });
});
