import { pacoteDoCarrinho } from '../../../src/services/mercado/frete-transportadora.service';

const carrinho = (sobrescrever: Record<string, unknown> = {}) => ({
  id: 'carrinho',
  loja: {
    aceita_transportadora: true,
    cep: '14000000',
    embalagem_altura_cm: 10,
    embalagem_largura_cm: 20,
    embalagem_comprimento_cm: 30,
    ...((sobrescrever.loja as Record<string, unknown>) || {})
  },
  itens: sobrescrever.itens || [
    { nome: 'Ração', peso_gramas: 1500, quantidade_disponivel: 2 },
    { nome: 'Brinquedo', peso_gramas: 200, quantidade_disponivel: 1 }
  ]
}) as any;

describe('pacote da transportadora', () => {
  it('soma o peso real pela quantidade e preserva a caixa configurada', () => {
    expect(pacoteDoCarrinho(carrinho())).toEqual({
      pesoGramas: 3200,
      alturaCm: 10,
      larguraCm: 20,
      comprimentoCm: 30
    });
  });

  it('recusa cotação quando um produto está sem peso', () => {
    expect(() => pacoteDoCarrinho(carrinho({ itens: [{ nome: 'Ração', peso_gramas: null, quantidade_disponivel: 1 }] })))
      .toThrow('precisa informar o peso');
  });
});
