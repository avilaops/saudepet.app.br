require('dotenv').config()

const { PrismaClient } = require('@prisma/client')
const { BLOG_IMAGES, getBlogImage } = require('../src/content/blog-images')

const prisma = new PrismaClient()

async function main() {
  const slugs = Object.keys(BLOG_IMAGES)
  const tenantSlug = process.env.PUBLIC_TENANT_SLUG || 'saudepet'
  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true, slug: true }
  })
  if (!tenant) throw new Error(`Atualização interrompida: tenant '${tenantSlug}' não encontrado.`)

  const posts = await prisma.blogPost.findMany({
    where: { tenant_id: tenant.id, slug: { in: slugs } },
    select: { id: true, slug: true, status: true }
  })
  const found = new Set(posts.map((post) => post.slug))
  const missing = slugs.filter((slug) => !found.has(slug))

  if (posts.length !== slugs.length || missing.length) {
    throw new Error(`Atualização interrompida: ${missing.length} artigo(s) ausente(s): ${missing.join(', ')}`)
  }

  await prisma.$transaction(posts.map((post) => prisma.blogPost.update({
    where: { id: post.id },
    data: getBlogImage(post.slug)
  })))

  const published = posts.filter((post) => post.status === 'publicado').length
  const scheduled = posts.filter((post) => post.status === 'agendado').length
  console.log(`Imagens associadas a ${posts.length} artigos do tenant '${tenant.slug}' (${published} publicados e ${scheduled} agendados).`)
}

main()
  .catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())

export {};
