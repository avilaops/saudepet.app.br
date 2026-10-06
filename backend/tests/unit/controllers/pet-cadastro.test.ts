/**
 * Cadastro do pet.
 *
 * O controller gravava cinco campos — nome, tipo, raça, idade e peso — e o
 * banco tem quinze. Sexo, porte, castração, data de nascimento e microchip
 * eram descartados em silêncio: o porte chegava vazio até na tag da coleira,
 * que é o que ajuda a devolver um animal perdido.
 */

const prisma = require('../../../src/config/database');
const controller = require('../../../src/controllers/pet.controller');

const resposta = () => {
  const res: Record<string, unknown> = {};
  res.json = jest.fn(() => res);
  res.status = jest.fn(() => res);
  return res;
};

function requisicao(corpo: Record<string, unknown>, params: Record<string, string> = {}) {
  return { body: corpo, params, userId: 'tutor-1', tenantId: 'tenant-1' };
}

describe('Cadastro do pet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.pet.create.mockResolvedValue({ id: 'pet-1' });
    prisma.pet.update.mockResolvedValue({ id: 'pet-1' });
    prisma.pet.findFirst.mockResolvedValue({ id: 'pet-1', tutor_id: 'tutor-1' });
  });

  it('grava tudo que o formulário oferece, não só os cinco campos antigos', async () => {
    await controller.create(
      requisicao({
        nome: 'Rex', tipo: 'cachorro', raca: 'SRD', idade: 3, peso: 12.5,
        sexo: 'macho', porte: 'medio', cor: 'caramelo', pedigree: 'CBKC-123',
        castrado: true, microchip: '981000', condicoes_preexistentes: 'Cardiopatia leve',
        data_nascimento: new Date('2023-01-10')
      }),
      resposta(),
      jest.fn()
    );

    expect(prisma.pet.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sexo: 'macho',
          porte: 'medio',
          cor: 'caramelo',
          pedigree: 'CBKC-123',
          castrado: true,
          microchip: '981000',
          condicoes_preexistentes: 'Cardiopatia leve'
        })
      })
    );
  });

  it('sem espécie informada, o tipo serve — é o que o veterinário lê na ficha', async () => {
    await controller.create(requisicao({ nome: 'Mia', tipo: 'gato' }), resposta(), jest.fn());

    expect(prisma.pet.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ especie: 'gato' }) })
    );
  });

  it('castrado ausente vira falso, e não indefinido', async () => {
    await controller.create(requisicao({ nome: 'Bob', tipo: 'cachorro' }), resposta(), jest.fn());

    expect(prisma.pet.create.mock.calls[0][0].data.castrado).toBe(false);
  });

  it('peso zero não é o mesmo que peso ausente', async () => {
    await controller.create(
      requisicao({ nome: 'Filhote', tipo: 'cachorro', peso: 0.4, idade: 0 }),
      resposta(),
      jest.fn()
    );

    const dados = prisma.pet.create.mock.calls[0][0].data;
    expect(dados.peso).toBe(0.4);
    expect(dados.idade).toBe(0);
  });

  it('na edição, apagar um campo é uma edição legítima', async () => {
    await controller.update(
      requisicao({ microchip: null, cor: null }, { id: 'pet-1' }),
      resposta(),
      jest.fn()
    );

    const dados = prisma.pet.update.mock.calls[0][0].data;
    expect(dados).toHaveProperty('microchip', null);
    expect(dados).toHaveProperty('cor', null);
  });

  it('na edição, campo não enviado não é tocado', async () => {
    await controller.update(requisicao({ nome: 'Rex II' }, { id: 'pet-1' }), resposta(), jest.fn());

    const dados = prisma.pet.update.mock.calls[0][0].data;
    expect(dados).toEqual({ nome: 'Rex II' });
  });
});
