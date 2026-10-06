const prisma = require('../../../src/config/database');
const catalogo = require('../../../src/services/catalogo-veterinario.service');

describe('catálogo do veterinário', () => {
  beforeEach(() => {
    prisma.catalogoItemVeterinario.findMany.mockResolvedValue([]);
    prisma.catalogoItemVeterinario.deleteMany.mockResolvedValue({ count: 0 });
    prisma.catalogoItemVeterinario.createMany.mockResolvedValue({ count: 25 });
  });

  it('devolve o catálogo completo sem inventar preços quando ainda não foi configurado', async () => {
    const itens = await catalogo.catalogoDoVeterinario('vet-1', 'tenant-1');
    expect(itens.length).toBeGreaterThan(20);
    expect(itens.every((item: any) => item.preco === null && item.ativo === false)).toBe(true);
    expect(prisma.catalogoItemVeterinario.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { veterinario_id: 'vet-1', tenant_id: 'tenant-1' } })
    );
  });

  it('mescla preços persistidos com as definições comerciais', () => {
    const itens = catalogo.montarCatalogo([{
      codigo: 'consulta_domiciliar', preco: 200, ativo: true, atualizado_em: new Date('2026-09-01')
    }]);
    const consulta = itens.find((item: any) => item.codigo === 'consulta_domiciliar');
    expect(consulta).toEqual(expect.objectContaining({ nome: 'Consulta domiciliar', preco: 200, ativo: true }));
  });

  it('substitui somente o catálogo do veterinário autenticado e do tenant atual', async () => {
    await catalogo.salvarCatalogoDoVeterinario({
      veterinarioId: 'vet-1',
      tenantId: 'tenant-1',
      entrada: { itens: [{ codigo: 'consulta_domiciliar', ativo: true, preco: 190 }] }
    });

    expect(prisma.catalogoItemVeterinario.deleteMany).toHaveBeenCalledWith({
      where: { veterinario_id: 'vet-1', tenant_id: 'tenant-1' }
    });
    expect(prisma.catalogoItemVeterinario.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          tenant_id: 'tenant-1', veterinario_id: 'vet-1', codigo: 'consulta_domiciliar', preco: 190, ativo: true
        })
      ])
    });
  });
});
