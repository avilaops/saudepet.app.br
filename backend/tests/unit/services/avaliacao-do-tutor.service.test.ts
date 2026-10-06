/**
 * O veterinário avalia o tutor.
 *
 * O que estes casos travam: a nota só entra depois de encerrar, só de quem
 * atendeu, uma por lado — e a média do tutor não pode ser escrita fora da
 * transação que grava a nota, senão a reputação diverge do que está escrito.
 */

const prisma = require('../../../src/config/database');
const servico = require('../../../src/services/avaliacao-do-tutor.service');

const VET_USUARIO = 'usuario-do-vet';
const TENANT = 'tenant-1';

function atendimento(status = 'finalizado') {
  return {
    id: 'atend-1',
    status,
    tutor_id: 'tutor-1',
    veterinario_id: 'vet-1',
    veterinario: { usuario_id: VET_USUARIO }
  };
}

describe('Avaliação do tutor pelo veterinário', () => {
  const pedido = {
    atendimentoId: 'atend-1',
    tenantId: TENANT,
    usuarioId: VET_USUARIO,
    nota: 5,
    comentario: 'Endereço certo e pet contido.'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.solicitacao.findFirst.mockResolvedValue(atendimento());
    prisma.avaliacao.findUnique.mockResolvedValue(null);
    prisma.avaliacao.create.mockResolvedValue({ id: 'av-1', nota: 5 });
    prisma.avaliacao.aggregate.mockResolvedValue({ _avg: { nota: 4.5 }, _count: { _all: 2 } });
    prisma.usuario.update.mockResolvedValue({});
    prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(prisma));
  });

  it('grava a nota como do veterinário, sem tocar na direção do tutor', async () => {
    await servico.avaliarTutor(pedido);

    expect(prisma.avaliacao.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ autor_papel: 'veterinario', tutor_id: 'tutor-1', nota: 5 })
      })
    );
  });

  it('a média do tutor conta só o que veterinários escreveram sobre ele', async () => {
    await servico.avaliarTutor(pedido);

    expect(prisma.avaliacao.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tutor_id: 'tutor-1', autor_papel: 'veterinario' })
      })
    );
    expect(prisma.usuario.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { avaliacao_media: 4.5, total_avaliacoes: 2 } })
    );
  });

  it('nota e média entram na mesma transação', async () => {
    await servico.avaliarTutor(pedido);
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('recusa nota fora de 1 a 5, e nem consulta o atendimento', async () => {
    await expect(servico.avaliarTutor({ ...pedido, nota: 0 })).rejects.toThrow(/1 a 5/);
    await expect(servico.avaliarTutor({ ...pedido, nota: 6 })).rejects.toThrow(/1 a 5/);
    await expect(servico.avaliarTutor({ ...pedido, nota: 4.5 })).rejects.toThrow(/1 a 5/);
    expect(prisma.avaliacao.create).not.toHaveBeenCalled();
  });

  it('não avalia atendimento que ainda está em andamento', async () => {
    prisma.solicitacao.findFirst.mockResolvedValue(atendimento('atendimento_em_andamento'));

    await expect(servico.avaliarTutor(pedido)).rejects.toThrow(/depois de encerrar/i);
    expect(prisma.avaliacao.create).not.toHaveBeenCalled();
  });

  it('encaminhamento também pode ser avaliado — houve deslocamento e visita', async () => {
    prisma.solicitacao.findFirst.mockResolvedValue(atendimento('encaminhado'));

    await expect(servico.avaliarTutor(pedido)).resolves.toBeDefined();
  });

  it('só quem atendeu avalia', async () => {
    await expect(
      servico.avaliarTutor({ ...pedido, usuarioId: 'outro-vet' })
    ).rejects.toThrow(/não atendeu/i);
    expect(prisma.avaliacao.create).not.toHaveBeenCalled();
  });

  it('uma por lado: a segunda tentativa do veterinário é recusada', async () => {
    prisma.avaliacao.findUnique.mockResolvedValue({ id: 'av-anterior' });

    await expect(servico.avaliarTutor(pedido)).rejects.toThrow(/já avaliou/i);
    expect(prisma.avaliacao.create).not.toHaveBeenCalled();
  });

  it('a avaliação do tutor não bloqueia a do veterinário', async () => {
    // A busca é pela chave composta, não pelo atendimento: é isso que permite
    // as duas conviverem.
    await servico.avaliarTutor(pedido);

    expect(prisma.avaliacao.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          atendimento_id_autor_papel: { atendimento_id: 'atend-1', autor_papel: 'veterinario' }
        }
      })
    );
  });

  it('separa as duas direções na leitura do atendimento', async () => {
    prisma.avaliacao.findMany.mockResolvedValue([
      { id: 'a', autor_papel: 'tutor', nota: 5, comentario: null, criado_em: new Date() },
      { id: 'b', autor_papel: 'veterinario', nota: 4, comentario: null, criado_em: new Date() }
    ]);

    const resultado = await servico.avaliacoesDoAtendimento('atend-1', TENANT);

    expect(resultado.do_tutor?.id).toBe('a');
    expect(resultado.do_veterinario?.id).toBe('b');
  });
});
