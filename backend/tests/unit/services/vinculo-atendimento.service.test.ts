/**
 * O vínculo responde duas coisas, não uma.
 *
 * "Estas duas pessoas podem conversar?" já respondia. "Qual é o papel de cada
 * uma?" não — e quem precisava disso (o aviso de mensagem nova) acabava
 * chutando pelo `tipo_usuario`, justamente o critério que este serviço existe
 * para substituir. Um veterinário pode ser o tutor do atendimento; o tipo da
 * conta dele continua dizendo "veterinario" de qualquer forma.
 */

const prisma = require('../../../src/config/database');
const { buscarVinculoProfissional } = require('../../../src/services/vinculo-atendimento.service');

const TUTOR = 'usuario-tutor';
const VET = 'usuario-vet';

describe('buscarVinculoProfissional', () => {
  beforeEach(() => jest.clearAllMocks());

  it('diz quem é o tutor e quem é o veterinário daquele atendimento', async () => {
    prisma.solicitacao.findFirst.mockResolvedValue({
      id: 'atend-1',
      status: 'finalizado',
      tutor_id: TUTOR,
      veterinario: { usuario_id: VET }
    });

    const vinculo = await buscarVinculoProfissional('tenant-1', VET, TUTOR);

    expect(vinculo).toEqual({
      id: 'atend-1',
      status: 'finalizado',
      tutorId: TUTOR,
      veterinarioUsuarioId: VET
    });
  });

  it('atendimento ainda sem veterinário devolve o vínculo com o campo vazio', async () => {
    prisma.solicitacao.findFirst.mockResolvedValue({
      id: 'atend-2',
      status: 'procurando',
      tutor_id: TUTOR,
      veterinario: null
    });

    const vinculo = await buscarVinculoProfissional('tenant-1', VET, TUTOR);

    // `null`, não `undefined`: quem consome compara com um id e precisa de uma
    // resposta, não da ausência dela.
    expect(vinculo?.veterinarioUsuarioId).toBeNull();
    expect(vinculo?.tutorId).toBe(TUTOR);
  });

  it('sem atendimento entre os dois, não há vínculo', async () => {
    prisma.solicitacao.findFirst.mockResolvedValue(null);

    expect(await buscarVinculoProfissional('tenant-1', VET, TUTOR)).toBeNull();
  });

  it('ninguém tem vínculo consigo mesmo, e nem chega a consultar o banco', async () => {
    expect(await buscarVinculoProfissional('tenant-1', VET, VET)).toBeNull();
    expect(await buscarVinculoProfissional('tenant-1', VET, null)).toBeNull();
    expect(await buscarVinculoProfissional('', VET, TUTOR)).toBeNull();

    expect(prisma.solicitacao.findFirst).not.toHaveBeenCalled();
  });
});
