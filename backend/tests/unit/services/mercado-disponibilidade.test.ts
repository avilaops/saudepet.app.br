import {
  cnpjValido,
  estaDisponivel,
  gerarSlug,
  limiteDoItem,
  precoSugerido,
  precoVigente
} from '../../../src/services/mercado/comum';

/**
 * As regras que decidem se um produto do mercado pode ser vendido.
 *
 * O caso que motivou metade destes testes é real e veio do primeiro
 * levantamento de campo (Casa de Rações Filhos de 4 Patas, 26/08/2026): 175
 * itens fotografados na prateleira e NENHUMA contagem de estoque. Uma leitura
 * ingênua de `estoque > 0` teria marcado a loja inteira como esgotada — 175
 * produtos existentes, visíveis na foto, indisponíveis no aplicativo.
 */

describe('O que está disponível para venda', () => {
  const base = { ativo: true, controla_estoque: true, sob_encomenda: false, estoque: 0 };

  it('quem controla estoque e tem peça, vende', () => {
    expect(estaDisponivel({ ...base, estoque: 3 })).toBe(true);
  });

  it('quem controla estoque e zerou, não vende', () => {
    expect(estaDisponivel({ ...base, estoque: 0 })).toBe(false);
  });

  it('quem NÃO controla estoque vende mesmo com a coluna zerada', () => {
    // O caso do petshop de bairro: vende enquanto tem e confere na separação.
    // É a maioria dos itens do primeiro fornecedor.
    expect(estaDisponivel({ ...base, controla_estoque: false, estoque: 0 })).toBe(true);
  });

  it('item sob encomenda vende sem ter nada na loja', () => {
    expect(estaDisponivel({ ...base, sob_encomenda: true, estoque: 0 })).toBe(true);
  });

  it('produto desativado não vende de jeito nenhum', () => {
    // Inclusive quando as outras três portas estariam abertas — é o desempate.
    expect(estaDisponivel({ ativo: false, controla_estoque: false, sob_encomenda: true, estoque: 99 })).toBe(false);
  });
});

describe('Quanto dá para levar', () => {
  it('com contagem, o teto é o estoque', () => {
    expect(limiteDoItem({ controla_estoque: true, sob_encomenda: false, estoque: 4 }, 99)).toBe(4);
  });

  it('sem contagem, o teto é o do carrinho — não zero', () => {
    // Zero aqui seria o bug que o levantamento revelaria em produção: o botão
    // de adicionar existiria e nunca colocaria nada no carrinho.
    expect(limiteDoItem({ controla_estoque: false, sob_encomenda: false, estoque: 0 }, 99)).toBe(99);
  });

  it('sob encomenda também não é limitado pela coluna', () => {
    expect(limiteDoItem({ controla_estoque: true, sob_encomenda: true, estoque: 0 }, 99)).toBe(99);
  });

  it('o teto do carrinho vence o estoque maior', () => {
    expect(limiteDoItem({ controla_estoque: true, sob_encomenda: false, estoque: 500 }, 99)).toBe(99);
  });
});

describe('Preço vigente', () => {
  it('sem promoção, vale o preço de tabela', () => {
    expect(precoVigente({ preco: 196.5, preco_promocional: null })).toBe(196.5);
  });

  it('com promoção menor, vale a promoção', () => {
    expect(precoVigente({ preco: 196.5, preco_promocional: 175.9 })).toBe(175.9);
  });

  it('promoção maior que o preço é ignorada', () => {
    // Erro de digitação no painel não pode virar cobrança maior do que a
    // etiqueta. Na dúvida, o cliente paga o menor.
    expect(precoVigente({ preco: 140, preco_promocional: 190 })).toBe(140);
  });

  it('promoção zerada não zera a venda', () => {
    expect(precoVigente({ preco: 140, preco_promocional: 0 })).toBe(140);
  });
});

describe('Preço sugerido pelo custo e pela margem', () => {
  it('faz a mesma conta da planilha de levantamento: custo x (1 + margem)', () => {
    // A planilha tem margem padrão 0,4 e uma linha de exemplo com custo 150 →
    // preço 210. Se esta conta divergir, o painel e a planilha discordam.
    expect(precoSugerido(150, 0.4)).toBe(210);
  });

  it('sem custo não há sugestão', () => {
    // O primeiro levantamento voltou com 0 custos informados. Inventar margem
    // sobre um número que ninguém passou seria fabricar contabilidade.
    expect(precoSugerido(null, 0.4)).toBeNull();
    expect(precoSugerido(0, 0.4)).toBeNull();
  });

  it('arredonda para centavos', () => {
    expect(precoSugerido(19.99, 0.4)).toBe(27.99);
  });
});

describe('CNPJ', () => {
  it('aceita um CNPJ válido, com e sem máscara', () => {
    expect(cnpjValido('11.222.333/0001-81')).toBe(true);
    expect(cnpjValido('11222333000181')).toBe(true);
  });

  it('recusa dígito verificador errado', () => {
    expect(cnpjValido('11222333000182')).toBe(false);
  });

  it('recusa a sequência repetida que todo formulário aceita por engano', () => {
    expect(cnpjValido('00000000000000')).toBe(false);
    expect(cnpjValido('11111111111111')).toBe(false);
  });

  it('recusa tamanho errado', () => {
    expect(cnpjValido('1122233300018')).toBe(false);
    expect(cnpjValido('')).toBe(false);
  });
});

describe('Slug', () => {
  it('tira acento e caixa', () => {
    expect(gerarSlug('Casa de Rações Filhos de 4 Patas')).toBe('casa-de-racoes-filhos-de-4-patas');
  });

  it('não deixa hífen sobrando nas pontas', () => {
    expect(gerarSlug('  Ração — 15 kg!  ')).toBe('racao-15-kg');
  });

  it('nunca devolve string vazia sem motivo', () => {
    expect(gerarSlug('!!!')).toBe('');
  });
});
