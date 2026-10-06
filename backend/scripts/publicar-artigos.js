/**
 * Publica artigos do blog a partir de um arquivo JSON.
 *
 * Ensaio por padrão, como o importador do catálogo: só grava com `--aplicar`.
 * Roda dentro do contêiner, onde o Prisma Client já está instalado.
 *
 *   node publicar-artigos.js artigos.json            # mostra o que faria
 *   node publicar-artigos.js artigos.json --aplicar  # grava
 *
 * Artigo já existente (mesmo tenant e mesmo slug) é ATUALIZADO, nunca
 * duplicado: o par tenant_id + slug é único no banco, e reexecutar o script
 * precisa ser seguro.
 */
const fs = require('fs');
const { PrismaClient } = require('/app/node_modules/@prisma/client');
const { getBlogImage } = require('../src/content/blog-images');

const prisma = new PrismaClient();
const arquivo = process.argv[2];
const aplicar = process.argv.includes('--aplicar');

if (!arquivo) {
  console.error('uso: node publicar-artigos.js <arquivo.json> [--aplicar]');
  process.exit(1);
}

(async () => {
  const artigos = JSON.parse(fs.readFileSync(arquivo, 'utf8'));

  // O blog é de um tenant só. Pega o tenant dos artigos que já existem, para
  // não depender de adivinhar o slug da organização.
  const referencia = await prisma.blogPost.findFirst({ select: { tenant_id: true, author_name: true } });
  if (!referencia) {
    console.error('nenhum artigo existente para descobrir o tenant; abortando');
    process.exit(1);
  }
  const tenantId = referencia.tenant_id;
  const autor = referencia.author_name || 'Equipe Saúde PET';

  console.log(aplicar ? '== APLICANDO ==' : '== ENSAIO (nada será gravado) ==');
  console.log('tenant:', tenantId.slice(0, 8) + '...', '| autor:', autor, '\n');

  let criados = 0;
  let atualizados = 0;

  for (const artigo of artigos) {
    const existente = await prisma.blogPost.findFirst({
      where: { tenant_id: tenantId, slug: artigo.slug },
      select: { id: true, status: true }
    });

    const dados = {
      title: artigo.title,
      excerpt: artigo.excerpt,
      content: artigo.content,
      content_format: 'markdown',
      author_name: autor,
      tags: artigo.tags || [],
      seo_title: artigo.seo_title || null,
      seo_description: artigo.seo_description || null,
      ...getBlogImage(artigo.slug),
      status: 'publicado'
    };

    if (existente) {
      console.log('ATUALIZA  ' + artigo.slug);
      if (aplicar) {
        await prisma.blogPost.update({ where: { id: existente.id }, data: dados });
      }
      atualizados += 1;
    } else {
      console.log('CRIA      ' + artigo.slug + '  (' + artigo.content.length + ' caracteres)');
      if (aplicar) {
        await prisma.blogPost.create({
          data: { ...dados, tenant_id: tenantId, slug: artigo.slug, published_at: new Date() }
        });
      }
      criados += 1;
    }
  }

  console.log('\ncriados: ' + criados + ' | atualizados: ' + atualizados);
  if (!aplicar) console.log('ensaio: rode de novo com --aplicar para gravar.');

  await prisma.$disconnect();
})().catch((erro) => {
  console.error('FALHOU:', erro && erro.message ? erro.message : erro);
  process.exit(1);
});
