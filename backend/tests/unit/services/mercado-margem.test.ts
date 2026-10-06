/**
 * Margem por categoria em vez de 40% fixo.
 *
 * A ordem é: a margem que a loja digitou no produto; senão a da prateleira;
 * senão o padrão da casa. E `0` é margem válida — vender a preço de custo é
 * decisão da loja, não ausência de número.
 */

const { margemEfetiva, MARGEM_PADRAO, SLUGS_RESERVADOS, precoSugerido } = require('../../../src/services/mercado/comum');

describe('margemEfetiva', () => {
  it('a do produto vence a da categoria', () => {
    expect(margemEfetiva(0.35, 0.25)).toBe(0.35);
  });

  it('sem margem no produto, herda a da categoria', () => {
    expect(margemEfetiva(null, 0.25)).toBe(0.25);
    expect(margemEfetiva('', '0.25')).toBe(0.25);
    expect(margemEfetiva(undefined, 0.25)).toBe(0.25);
  });

  it('sem nenhuma das duas, cai no padrão da casa', () => {
    expect(margemEfetiva(null, null)).toBe(MARGEM_PADRAO);
    expect(margemEfetiva(undefined, undefined)).toBe(0.4);
  });

  it('zero é margem, não ausência', () => {
    expect(margemEfetiva(0, 0.25)).toBe(0);
    expect(margemEfetiva(null, 0)).toBe(0);
  });

  it('lixo é ignorado em vez de virar NaN no preço', () => {
    expect(margemEfetiva('abc', -1)).toBe(MARGEM_PADRAO);
    expect(precoSugerido(100, margemEfetiva('abc', 0.25))).toBe(125);
  });
});

describe('slugs reservados', () => {
  it('"loja" nunca vira slug de loja — é o painel do lojista', () => {
    expect(SLUGS_RESERVADOS.has('loja')).toBe(true);
  });
});
