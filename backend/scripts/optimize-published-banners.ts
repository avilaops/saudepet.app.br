require('dotenv').config();

const prisma = require('../src/config/database');
const { uploadBannerImage, optimizeBannerBuffer } = require('../src/services/banner-image.service');

const COPY_BY_POSITION = {
  1: {
    title: 'Cuidado do pet no conforto de casa',
    altText: 'Gato ao lado da mensagem: seu pet sendo cuidado no conforto da sua casa.'
  },
  2: {
    title: 'Cadastro de veterinários',
    altText: 'Cachorro ao lado do convite para veterinários se cadastrarem e iniciarem atendimentos a domicílio.'
  }
};

async function downloadImage(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Falha ao baixar imagem do banner: HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > 10 * 1024 * 1024) throw new Error('Imagem do banner excede o limite de migração');
  return buffer;
}

async function optimizeOne(url, tenantId, variant, dryRun) {
  if (/\.webp(?:\?|$)/i.test(url)) return { url, before: 0, after: 0, skipped: true };
  const buffer = await downloadImage(url);
  if (dryRun) {
    const result = await optimizeBannerBuffer(buffer, variant);
    return { url, before: buffer.length, after: result.bytes, skipped: false };
  }
  const originalname = new URL(url).pathname.split('/').pop() || `${variant}.png`;
  const result = await uploadBannerImage({ buffer, originalname }, tenantId, variant);
  return { url: result.url, before: buffer.length, after: result.bytes, skipped: false };
}

async function main() {
  const dryRun = process.env.DRY_RUN === 'true';
  const tenantSlug = process.env.PUBLIC_TENANT_SLUG || 'saudepet';
  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug }, select: { id: true } });
  if (!tenant) throw new Error(`Tenant público não encontrado: ${tenantSlug}`);

  const banners = await prisma.landingBanner.findMany({
    where: { tenantId: tenant.id },
    orderBy: { position: 'asc' }
  });

  let originalBytes = 0;
  let optimizedBytes = 0;
  let updated = 0;

  for (const banner of banners) {
    const desktop = await optimizeOne(banner.desktopImageUrl, tenant.id, 'desktop', dryRun);
    const mobile = await optimizeOne(banner.mobileImageUrl || banner.desktopImageUrl, tenant.id, 'mobile', dryRun);
    originalBytes += desktop.before + mobile.before;
    optimizedBytes += desktop.after + mobile.after;

    const copy = COPY_BY_POSITION[banner.position];
    const data = {
      desktopImageUrl: desktop.url,
      mobileImageUrl: mobile.url,
      ...(copy && (!banner.title || banner.title === '.') ? { title: copy.title } : {}),
      ...(copy && (!banner.altText || banner.altText === '.') ? { altText: copy.altText } : {})
    };
    const changed = data.desktopImageUrl !== banner.desktopImageUrl
      || data.mobileImageUrl !== banner.mobileImageUrl
      || data.title !== undefined
      || data.altText !== undefined;
    if (!changed || dryRun) continue;

    const updatedBanner = await prisma.landingBanner.update({ where: { id: banner.id }, data });
    const actorId = banner.publishedById || banner.createdById;
    const actor = await prisma.usuario.findUnique({ where: { id: actorId }, select: { nome: true } });
    await prisma.bannerAuditLog.create({
      data: {
        tenantId: tenant.id,
        bannerId: banner.id,
        action: 'LANDING_BANNER_IMAGES_OPTIMIZED',
        bannerTitle: updatedBanner.title,
        performedById: actorId,
        performedByName: actor?.nome || 'Otimização automática',
        previousVersion: JSON.stringify(banner),
        newVersion: JSON.stringify(updatedBanner)
      }
    });
    updated += 1;
  }

  console.log(JSON.stringify({ dryRun, banners: banners.length, updated, originalBytes, optimizedBytes }));
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

export {};
