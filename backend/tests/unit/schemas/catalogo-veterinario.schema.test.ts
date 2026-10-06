import { salvarCatalogoVeterinarioSchema } from '../../../src/schemas/catalogo-veterinario.schema';

describe('salvarCatalogoVeterinarioSchema', () => {
  it('aceita item ativo com preço e normaliza número enviado pelo formulário', () => {
    const resultado = salvarCatalogoVeterinarioSchema.parse({
      itens: [{ codigo: 'consulta_domiciliar', ativo: true, preco: '180.50' }]
    });
    expect(resultado.itens[0].preco).toBe(180.5);
  });

  it('permite manter item desativado e sem preço', () => {
    expect(salvarCatalogoVeterinarioSchema.safeParse({
      itens: [{ codigo: 'vacina_v10', ativo: false, preco: null }]
    }).success).toBe(true);
  });

  it('recusa item ativo sem preço, código desconhecido e código repetido', () => {
    expect(salvarCatalogoVeterinarioSchema.safeParse({
      itens: [{ codigo: 'vacina_v10', ativo: true, preco: null }]
    }).success).toBe(false);
    expect(salvarCatalogoVeterinarioSchema.safeParse({
      itens: [{ codigo: 'servico_inventado', ativo: true, preco: 100 }]
    }).success).toBe(false);
    expect(salvarCatalogoVeterinarioSchema.safeParse({
      itens: [
        { codigo: 'vacina_v10', ativo: true, preco: 100 },
        { codigo: 'vacina_v10', ativo: true, preco: 120 }
      ]
    }).success).toBe(false);
  });

  it('recusa preço zero, negativo ou acima do teto', () => {
    for (const preco of [0, -1, 50001]) {
      expect(salvarCatalogoVeterinarioSchema.safeParse({
        itens: [{ codigo: 'consulta_rotina', ativo: true, preco }]
      }).success).toBe(false);
    }
  });
});
