import path from 'path';
import sharp from 'sharp';
import { uploadBuffer } from '../config/r2';

type Variante = 'desktop' | 'mobile';

const VARIANTS: Record<Variante, { width: number; quality: number }> = {
  desktop: { width: 1600, quality: 78 },
  mobile: { width: 960, quality: 78 }
};

interface ImagemOtimizada {
  buffer: Buffer;
  contentType: 'image/webp';
  width: number;
  height: number;
  bytes: number;
}

function safeBaseName(originalName = 'banner'): string {
  return path.basename(originalName, path.extname(originalName))
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'banner';
}

async function optimizeBannerBuffer(buffer: Buffer, variant: Variante | string): Promise<ImagemOtimizada> {
  const settings = VARIANTS[variant as Variante];
  if (!settings) throw new Error('Variação de banner inválida');

  const image = sharp(buffer, { limitInputPixels: 40_000_000 }).rotate();
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height) throw new Error('Não foi possível identificar as dimensões da imagem');

  const { data, info } = await image
    .resize({ width: settings.width, withoutEnlargement: true })
    .webp({ quality: settings.quality, effort: 5, smartSubsample: true })
    .toBuffer({ resolveWithObject: true });

  return {
    buffer: data,
    contentType: 'image/webp',
    width: info.width,
    height: info.height,
    bytes: info.size
  };
}

async function uploadBannerImage(
  file: { buffer: Buffer; originalname?: string },
  tenantId: string,
  variant: Variante | string
): Promise<ImagemOtimizada & { key: string; url: string }> {
  const optimized = await optimizeBannerBuffer(file.buffer, variant);
  const key = `banners/${tenantId}/${variant}_${Date.now()}_${safeBaseName(file.originalname)}.webp`;
  const url = await uploadBuffer(optimized.buffer, key, optimized.contentType, {
    cacheControl: 'public, max-age=31536000, immutable'
  });
  return { ...optimized, key, url };
}

export { optimizeBannerBuffer, safeBaseName, uploadBannerImage };
