/**
 * Quando o tutor escolhe o profissional.
 *
 * O que estes casos travam: escolha só existe onde não há pressa, quem aparece
 * na vitrine é quem pode de fato atender, e escolher alguém indisponível falha
 * na hora — não vira um chamado que ninguém recebe.
 */

const prisma = require('../../../src/config/database');
const servico = require('../../../src/services/escolha-de-veterinario.service');

const TENANT = 'tenant-1';

function veterinario(extra: Record<string, unknown> = {}) {
  return {
    id: 'vet-1',
    crmv: 'SP-12345',
    especialidade: 'Clínica geral',
    sobre: null,
    area_atuacao: 'Zona sul',
    avaliacao_media: 4.8,
    total_atendimentos: 32,
    latitude: -20.81,
    longitude: -49.37,
    online: false,
    dados_bancarios: 'cifrado',
    catalogo_itens: [],
    aprovado_admin: true,
    usuario: { nome: 'Dra. Helena', foto_perfil: null },
    ...extra
  };
}

describe('Escolha de veterinário', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.veterinario.findMany.mockResolvedValue([veterinario()]);
    prisma.veterinario.findFirst.mockResolvedValue(veterinario());
    prisma.avaliacao.groupBy.mockResolvedValue([{ veterinario_id: 'vet-1', _count: { _all: 12 } }]);
  });

  describe('onde a escolha existe', () => {
    it('vale nos tipos sem pressa', () => {
      expect(servico.permiteEscolha('vacinacao')).toBe(true);
      expect(servico.permiteEscolha('avaliacao')).toBe(true);
      expect(servico.permiteEscolha('consulta_rotina')).toBe(true);
    });

    it('não vale em emergência nem em consulta domiciliar', () => {
      // Quem tem o animal passando mal quer alguém a caminho, não um catálogo.
      expect(servico.permiteEscolha('emergencia')).toBe(false);
      expect(servico.permiteEscolha('consulta_domiciliar')).toBe(false);
      expect(servico.permiteEscolha('teleorientacao')).toBe(false);
    });

    it('a vitrine devolve lista vazia para tipo sem escolha', async () => {
      const lista = await servico.profissionaisPara({ tenantId: TENANT, tipo: 'emergencia' });
      expect(lista).toEqual([]);
      expect(prisma.veterinario.findMany).not.toHaveBeenCalled();
    });
  });

  describe('a vitrine', () => {
    it('só mostra quem pode receber repasse — sem conta, aceitar criaria repasse sem destino', async () => {
      await servico.profissionaisPara({ tenantId: TENANT, tipo: 'vacinacao' });

      expect(prisma.veterinario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            aprovado_admin: true,
            dados_bancarios: { not: null }
          })
        })
      );
    });

    it('não exige plantão: pedido marcado não pode ter vitrine vazia às três da tarde', async () => {
      await servico.profissionaisPara({ tenantId: TENANT, tipo: 'consulta_rotina' });

      const where = prisma.veterinario.findMany.mock.calls[0][0].where;
      expect(where.online).toBeUndefined();
    });

    it('conta só as avaliações que os tutores deram', async () => {
      await servico.profissionaisPara({ tenantId: TENANT, tipo: 'vacinacao' });

      expect(prisma.avaliacao.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ autor_papel: 'tutor' }) })
      );
    });

    it('calcula a distância e ordena por ela', async () => {
      prisma.veterinario.findMany.mockResolvedValue([
        veterinario({ id: 'longe', latitude: -21.5, longitude: -49.37 }),
        veterinario({ id: 'perto', latitude: -20.82, longitude: -49.37 })
      ]);

      const lista = await servico.profissionaisPara({
        tenantId: TENANT, tipo: 'vacinacao', latitude: -20.81, longitude: -49.37
      });

      expect(lista[0].id).toBe('perto');
      expect(lista[0].distancia_km).toBeLessThan(lista[1].distancia_km);
    });

    it('sem coordenada do tutor, quem tem melhor avaliação vem primeiro', async () => {
      prisma.veterinario.findMany.mockResolvedValue([
        veterinario({ id: 'tres-estrelas', avaliacao_media: 3.2, latitude: null, longitude: null }),
        veterinario({ id: 'cinco-estrelas', avaliacao_media: 4.9, latitude: null, longitude: null })
      ]);

      const lista = await servico.profissionaisPara({ tenantId: TENANT, tipo: 'vacinacao' });
      expect(lista[0].id).toBe('cinco-estrelas');
    });

    it('mostra o preço próprio publicado para o tipo escolhido', async () => {
      prisma.veterinario.findMany.mockResolvedValue([
        veterinario({ catalogo_itens: [{ preco: 175 }] })
      ]);

      const [profissional] = await servico.profissionaisPara({ tenantId: TENANT, tipo: 'vacinacao' });
      expect(profissional.preco).toBe(175);
    });
  });

  describe('validação da escolha', () => {
    it('devolve o id quando o profissional pode atender', async () => {
      const id = await servico.validarEscolha({
        tenantId: TENANT, tipo: 'vacinacao', veterinarioId: 'vet-1'
      });
      expect(id).toBe('vet-1');
    });

    it('recusa escolha em tipo que vai para a fila aberta', async () => {
      await expect(
        servico.validarEscolha({ tenantId: TENANT, tipo: 'emergencia', veterinarioId: 'vet-1' })
      ).rejects.toThrow(/primeiro profissional/i);
    });

    it('recusa profissional sem conta bancária', async () => {
      prisma.veterinario.findFirst.mockResolvedValue(veterinario({ dados_bancarios: null }));

      await expect(
        servico.validarEscolha({ tenantId: TENANT, tipo: 'vacinacao', veterinarioId: 'vet-1' })
      ).rejects.toThrow(/não está disponível/i);
    });

    it('recusa profissional não aprovado', async () => {
      prisma.veterinario.findFirst.mockResolvedValue(veterinario({ aprovado_admin: false }));

      await expect(
        servico.validarEscolha({ tenantId: TENANT, tipo: 'vacinacao', veterinarioId: 'vet-1' })
      ).rejects.toThrow(/não está disponível/i);
    });

    it('recusa profissional de outro tenant', async () => {
      prisma.veterinario.findFirst.mockResolvedValue(null);

      await expect(
        servico.validarEscolha({ tenantId: TENANT, tipo: 'vacinacao', veterinarioId: 'de-outra-casa' })
      ).rejects.toThrow(/não encontrado/i);
    });
  });
});
