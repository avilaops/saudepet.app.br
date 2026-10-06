import { normalizarImagem, STATUS_DE_IMAGEM, TAMANHO_MAXIMO_DO_ALT } from '../../../src/services/mercado/comum';

/**
 * A foto de capa tem três estados e uma marca, e o produto sem foto não tem
 * nenhum deles. Veio do primeiro lote tratado (fornecedor 01, 29/08/2026):
 * 92 fotos aprovadas, 40 para revisar, e etiqueta de preço visível em 121 —
 * publicável, mas é uma fila de troca, não um detalhe.
 */

describe('Foto de capa: status, alt e etiqueta', () => {
  it('sem capa não há status nem etiqueta, mesmo que venham no payload', () => {
    expect(normalizarImagem({ imagem_url: '', imagem_status: 'revisar', imagem_tem_etiqueta: true })).toEqual({
      imagem_url: null,
      imagem_alt: null,
      imagem_status: null,
      imagem_tem_etiqueta: false
    });
  });

  it('capa escolhida pelo lojista nasce aprovada', () => {
    expect(normalizarImagem({ imagem_url: 'https://cdn/x.webp' }).imagem_status).toBe('aprovada');
  });

  it('status inventado vira aprovada; os três conhecidos passam', () => {
    expect(normalizarImagem({ imagem_url: 'u', imagem_status: 'publicada' }).imagem_status).toBe('aprovada');
    for (const status of STATUS_DE_IMAGEM) {
      expect(normalizarImagem({ imagem_url: 'u', imagem_status: status }).imagem_status).toBe(status);
    }
  });

  it('etiqueta só é verdadeira quando dita como verdadeira', () => {
    expect(normalizarImagem({ imagem_url: 'u', imagem_tem_etiqueta: 'true' }).imagem_tem_etiqueta).toBe(true);
    expect(normalizarImagem({ imagem_url: 'u', imagem_tem_etiqueta: 1 }).imagem_tem_etiqueta).toBe(false);
    expect(normalizarImagem({ imagem_url: 'u' }).imagem_tem_etiqueta).toBe(false);
  });

  it('alt é aparado, cortado no limite e some quando vazio', () => {
    expect(normalizarImagem({ imagem_url: 'u', imagem_alt: '   ' }).imagem_alt).toBeNull();
    expect(normalizarImagem({ imagem_url: 'u', imagem_alt: `  ${'a'.repeat(400)}` }).imagem_alt).toHaveLength(TAMANHO_MAXIMO_DO_ALT);
  });
});
