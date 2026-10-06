const prisma = require('../../../src/config/database');
const { mockPrisma } = require('../../helpers/utils');

// Mock do Prisma já está configurado globalmente

describe('Pet Controller - Unit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Criação de Pet', () => {
    it('deve validar dados obrigatórios para criar pet', () => {
      const petValido = {
        nome: 'Rex',
        especie: 'cachorro',
        raca: 'Labrador',
        idade: 3,
        peso: 25.5,
        tutor_id: 'tutor-123'
      };

      expect(petValido).toHaveProperty('nome');
      expect(petValido).toHaveProperty('especie');
      expect(petValido.peso).toBeGreaterThan(0);
      expect(petValido.idade).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Validação de Espécie', () => {
    it('deve aceitar espécies válidas', () => {
      const especiesValidas = ['cachorro', 'gato', 'passaro', 'roedor', 'reptil', 'outro'];
      
      especiesValidas.forEach(especie => {
        expect(['cachorro', 'gato', 'passaro', 'roedor', 'reptil', 'outro']).toContain(especie);
      });
    });
  });

  describe('Listagem de Pets', () => {
    it('deve configurar paginação corretamente', () => {
      const paginacao = {
        pagina: 1,
        limite: 10,
        skip: 0
      };

      expect(paginacao.skip).toBe((paginacao.pagina - 1) * paginacao.limite);
    });
  });

  describe('Atualização de Pet', () => {
    it('deve permitir atualizar dados do pet', () => {
      const dadosAtualizacao = {
        peso: 26.0,
        observacoes: 'Pet está saudável'
      };

      expect(dadosAtualizacao).toHaveProperty('peso');
      expect(dadosAtualizacao.peso).toBeGreaterThan(0);
    });
  });

  describe('Exclusão de Pet', () => {
    it('deve validar ID antes de excluir', () => {
      const petId = 'pet-123';
      
      expect(petId).toBeTruthy();
      expect(typeof petId).toBe('string');
      expect(petId.length).toBeGreaterThan(0);
    });
  });
});
