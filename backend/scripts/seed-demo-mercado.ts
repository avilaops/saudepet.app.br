/**
 * Loja de demonstração do Mercado, para testar vitrine, feed e catálogo.
 *
 * Ela nasce e permanece marcada como `demonstracao: true` e em `rascunho`:
 * toda leitura pública do Mercado exclui loja de demonstração e o painel
 * recusa aprová-la (ver `LOJA_PUBLICA` em services/mercado/comum.ts). A
 * versão antiga deste seed, que vivia solta no servidor, criava a loja já
 * `aprovada` — e foi assim que a BioVet apareceu na vitrine e no sitemap do
 * Google em 01/09/2026.
 *
 * Depende do usuário criado por `seed-demo-parceiro.ts`. Idempotente: roda de
 * novo sem duplicar nada, e garante a marca de demonstração numa loja antiga.
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🛒 Criando loja de demonstração do Mercado (nunca pública)...');

  let tenant = await prisma.tenant.findFirst();
  let user = await prisma.usuario.findFirst({ where: { email: 'parceiro@biovet.com.br' } });
  if (!tenant || !user) {
    throw new Error('Rode antes o seed-demo-parceiro.ts: a loja precisa do usuário parceiro@biovet.com.br.');
  }

  // 1. Criar Categoria no Mercado
  let categoria = await prisma.categoriaMercado.findFirst({
    where: { slug: 'farmacia-e-cuidados' },
  });
  if (!categoria) {
    categoria = await prisma.categoriaMercado.create({
      data: {
        tenant_id: tenant.id,
        nome: 'Farmácia & Cuidados',
        slug: 'farmacia-e-cuidados',
        icone: 'Pill',
        ordem: 1,
        ativo: true,
      },
    });
  }

  // 2. Criar Loja no Mercado
  let loja = await prisma.lojaMercado.findFirst({
    where: { slug: 'petshop-biovet-rp' },
  });

  if (!loja) {
    loja = await prisma.lojaMercado.create({
      data: {
        tenant_id: tenant.id,
        responsavel_id: user.id,
        nome_fantasia: 'PetShop & Farmácia BioVet',
        razao_social: 'BioVet Artigos Veterinários Ltda',
        cnpj: '44555666000199',
        slug: 'petshop-biovet-rp',
        descricao: 'A melhor farmácia e petshop de São José do Rio Preto com entrega rápida.',
        email: 'loja@biovet.com.br',
        telefone: '1732345678',
        whatsapp: '17998877665',
        endereco: 'Av. Alberto Andaló, 3200',
        bairro: 'Centro',
        cidade: 'São José do Rio Preto',
        estado: 'SP',
        cep: '15015000',
        status: 'rascunho',
        demonstracao: true,
        aceita_retirada: true,
        aceita_combinar: true,
        aceita_entrega: true,
        entrega_raio_km: 15.0,
        frete_base: 12.0,
        prazo_preparo_min: 30,
      },
    });
  } else if (!loja.demonstracao || loja.status === 'aprovada') {
    // Loja criada pela versão antiga do seed: garante a marca e tira do ar.
    loja = await prisma.lojaMercado.update({
      where: { id: loja.id },
      data: { demonstracao: true, status: 'rascunho', aprovada_em: null, aprovada_por: null },
    });
  }

  // 3. Criar Produtos com fotos e preços
  const produtosData = [
    {
      nome: 'NexGard Spectra para Cães 15 a 30kg (3 Comprimidos)',
      slug: 'nexgard-spectra-15-30kg-3-comp',
      descricao: 'Proteção completa contra pulgas, carrapatos e vermes com sabor de carne.',
      marca: 'Boehringer Ingelheim',
      preco: 229.90,
      preco_promocional: 199.90,
      ean: '7891234567890',
      peso_gramas: 150,
      estoque: 25,
      imagem_url: 'https://saudepet.app.br/images/demo/nexgard-spectra.jpg',
      imagens: ['https://saudepet.app.br/images/demo/nexgard-spectra.jpg'],
    },
    {
      nome: 'Ração Premier Formula Cães Adultos Frango 15kg',
      slug: 'racao-premier-formula-caes-adultos-15kg',
      descricao: 'Alimento Super Premium formulado para atender todas as necessidades nutricionais.',
      marca: 'Premier Pet',
      preco: 289.90,
      preco_promocional: null,
      ean: '7899876543210',
      peso_gramas: 15000,
      estoque: 12,
      imagem_url: 'https://saudepet.app.br/images/demo/premier-formula.jpg',
      imagens: ['https://saudepet.app.br/images/demo/premier-formula.jpg'],
    },
    {
      nome: 'Shampoo Hipoalergênico Clorexiderm 500ml',
      slug: 'shampoo-clorexiderm-500ml',
      descricao: 'Shampoo antisséptico e antibacteriano para higiene profunda e pele sensível.',
      marca: 'Vetnil',
      preco: 78.50,
      preco_promocional: 69.90,
      ean: '7891122334455',
      peso_gramas: 600,
      estoque: 40,
      imagem_url: 'https://saudepet.app.br/images/demo/clorexiderm.jpg',
      imagens: ['https://saudepet.app.br/images/demo/clorexiderm.jpg'],
    },
  ];

  for (const prod of produtosData) {
    const existing = await prisma.produtoMercado.findFirst({
      where: { loja_id: loja.id, slug: prod.slug },
    });
    if (!existing) {
      await prisma.produtoMercado.create({
        data: {
          tenant_id: tenant.id,
          loja_id: loja.id,
          categoria_id: categoria.id,
          nome: prod.nome,
          slug: prod.slug,
          descricao: prod.descricao,
          marca: prod.marca,
          preco: prod.preco,
          preco_promocional: prod.preco_promocional,
          ean: prod.ean,
          peso_gramas: prod.peso_gramas,
          estoque: prod.estoque,
          controla_estoque: true,
          ativo: true,
          imagem_url: prod.imagem_url,
          imagens: prod.imagens,
        },
      });
    }
  }

  console.log('✅ Loja de demonstração e produtos prontos (fora da vitrine, por desenho).');
  console.log('----------------------------------------------------');
  console.log(`🏪 Loja: ${loja.nome_fantasia} (slug: ${loja.slug})`);
  console.log('🔒 Não aparece em /mercado nem no feed: é demonstração. Use pelo painel do lojista.');
  console.log('----------------------------------------------------');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

export {};
