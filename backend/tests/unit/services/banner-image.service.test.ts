jest.mock('../../../src/config/r2', () => ({ uploadBuffer: jest.fn() }));

const sharp = require('sharp');
const { optimizeBannerBuffer, safeBaseName } = require('../../../src/services/banner-image.service');

describe('banner-image.service', () => {
  test('converte banner móvel para WebP responsivo e muito menor', async () => {
    const source = await sharp({
      create: { width: 1800, height: 770, channels: 3, background: '#ff7d18' }
    }).png().toBuffer();
    const result = await optimizeBannerBuffer(source, 'mobile');
    const metadata = await sharp(result.buffer).metadata();

    expect(metadata.format).toBe('webp');
    expect(metadata.width).toBe(960);
    expect(metadata.height).toBeGreaterThan(0);
    expect(result.contentType).toBe('image/webp');
    expect(result.bytes).toBeLessThan(source.length);
  });

  test('normaliza o nome sem preservar extensão ou caracteres inseguros', () => {
    expect(safeBaseName('Campanha verão 2026.PNG')).toBe('Campanha_verao_2026');
  });
});

export {};
