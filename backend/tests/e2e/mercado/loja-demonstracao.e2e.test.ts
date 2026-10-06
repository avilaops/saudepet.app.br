/**
 * Loja de demonstração nunca é pública, contra o Postgres real.
 *
 * O caso que este teste impede de voltar: em 01/09/2026 a loja do
 * `seed-demo-mercado.js` (BioVet) foi aprovada no painel e apareceu na
 * vitrine, no sitemap e no feed do Google. O portão é o campo `demonstracao`
 * lido por `LOJA_PUBLICA` (services/mercado/comum.ts), e aqui ele é provado
 * pelos mesmos endpoints que as telas usam:
 *
 *   1. o painel recusa aprovar loja de demonstração;
 *   2. mesmo gravada como `aprovada` direto no banco (o acidente), ela fica
 *      fora da vitrine logada, da vitrine pública, do catálogo, do feed e do
 *      sitemap;
 *   3. uma loja legítima aprovada no mesmo tenant continua aparecendo em todos.
 */
const request = require('supertest');
const express = require('express');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

jest.unmock('../../../src/config/database');
jest.unmock('../../../src/services/token.service');
jest.mock('../../../src/services/email.service', () =>
  require('../../mocks/email-service.mock').criarMockDoEmailService());
jest.mock('../../../src/services/push.service', () => ({
  estaConfigurado: () => false,
  enviarParaUsuario: jest.fn().mockResolvedValue(undefined)
}));
jest.mock('../../../src/services/geocoding.service', () => ({
  geocodificar: jest.fn().mockResolvedValue({ latitude: -25.4284, longitude: -49.2733 }),
  buscar: jest.fn().mockResolvedValue([{ latitude: -25.4284, longitude: -49.2733 }])
}));

process.env.DATABASE_URL = process.env.DATABASE_URL
  // Com os mesmos tempos do tests/setup.js: o padrão de 5 s para conectar cai
  // em máquina carregada, e o Prisma reporta como se o banco estivesse fora.
  || 'postgresql://postgres:postgres@localhost:5445/saudepet_test?connection_limit=5&pool_timeout=30&connect_timeout=30';
// A vitrine sem sessão lê o tenant público; aqui ele é o da rodada.
process.env.PUBLIC_TENANT_SLUG = 'clinica-demo';

const prisma = new PrismaClient();

// Cada caso faz várias chamadas reais (bcrypt, Postgres, geocodificação mockada) e
// o padrão de 15 s do setup não aguenta máquina carregada.
jest.setTimeout(90000);

function cnpjValidoUnico(semente: number): string {
  const base = (String(semente).slice(-8) + '0001').split('').map(Number);
  const digito = (numeros: number[]): number => {
    const pesos = numeros.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = numeros.reduce((total, n, i) => total + n * pesos[i], 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const d1 = digito(base);
  const d2 = digito([...base, d1]);
  return [...base, d1, d2].join('');
}

describe('🔒 Loja de demonstração nunca é pública', () => {
  const carimbo = Date.now();
  const senha = 'Senha@123';
  let app: any;
  let tenantId = '';
  let tokenTutor = '';
  let tokenAdmin = '';
  let lojaDemoId = '';
  let lojaDemoSlug = '';
  let lojaRealId = '';
  let lojaRealSlug = '';
  let produtoDemoSlug = '';

  async function registrarELogar(nome: string, email: string) {
    const cadastro = await request(app).post('/api/v1/auth/register').send({
      nome, email, senha, tipo_usuario: 'tutor', tenant_slug: 'clinica-demo'
    });
    expect(cadastro.status).toBe(201);
    const login = await request(app).post('/api/v1/auth/login').send({ email, senha, tenant_slug: 'clinica-demo' });
    expect(login.status).toBe(200);
    return login.body.access_token as string;
  }

  async function cadastrarLoja(token: string, nome: string, cnpj: string) {
    const resposta = await request(app)
      .post('/api/v1/mercado/loja')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nome_fantasia: nome, email: `loja.${cnpj}@example.com`, telefone: '(41) 99999-0000', cnpj,
        endereco: 'Rua XV de Novembro, 100', bairro: 'Centro', cidade: 'Curitiba', estado: 'PR',
        aceita_retirada: true, aceita_combinar: true, aceita_entrega: false
      });
    expect(resposta.status).toBe(201);
    return resposta.body.loja as { id: string; slug: string };
  }

  async function produtoNaLoja(lojaId: string, nome: string) {
    const categoria = await prisma.categoriaMercado.upsert({
      where: { tenant_id_slug: { tenant_id: tenantId, slug: `racoes-${carimbo}` } },
      update: {},
      create: { tenant_id: tenantId, nome: `Rações ${carimbo}`, slug: `racoes-${carimbo}`, ativo: true }
    });
    return prisma.produtoMercado.create({
      data: {
        tenant_id: tenantId, loja_id: lojaId, categoria_id: categoria.id,
        nome, slug: `${nome.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${carimbo}`,
        preco: 99.9, controla_estoque: false, ativo: true,
        // O feed do Google descarta produto sem foto, por desenho.
        imagem_url: 'https://saudepet.app.br/images/teste/racao.jpg'
      },
      select: { id: true, slug: true }
    });
  }

  beforeAll(async () => {
    process.env.REQUIRE_EMAIL_VERIFICATION = 'false';
    app = express();
    app.use(express.json());
    app.use('/api/v1/auth', require('../../../src/routes/auth.routes'));
    app.use('/api/v1/mercado/loja', require('../../../src/routes/mercado-loja.routes'));
    app.use('/api/v1/mercado', require('../../../src/routes/mercado.routes'));
    app.use('/api/v1/admin/mercado', require('../../../src/routes/mercado-admin.routes'));
    app.use('/api/v1/public', require('../../../src/routes/public-content.routes'));
    app.use(require('../../../src/middleware/error.middleware').errorHandler);

    const tenant = await prisma.tenant.upsert({
      where: { slug: 'clinica-demo' },
      update: {},
      create: {
        slug: 'clinica-demo', nome: 'Clínica Veterinária Demo', email: 'contato@clinica-demo.teste',
        telefone: '11999990000', cidade: 'São Paulo', estado: 'SP', plano: 'premium', status: 'ativo',
        limite_usuarios: 1000, limite_pets: 5000
      }
    });
    tenantId = tenant.id;

    tokenTutor = await registrarELogar(`Tutor ${carimbo}`, `tutor.demo.${carimbo}@example.com`);
    const tokenLojistaDemo = await registrarELogar(`Lojista Demo ${carimbo}`, `lojista.demo.${carimbo}@example.com`);
    const tokenLojistaReal = await registrarELogar(`Lojista Real ${carimbo}`, `lojista.real.${carimbo}@example.com`);

    const admin = await prisma.usuario.create({
      data: {
        tenant_id: tenantId, nome: `Admin ${carimbo}`, email: `admin.demo.${carimbo}@example.com`,
        senha: await bcrypt.hash(senha, 10), tipo_usuario: 'admin', email_verificado: true
      }
    });
    const loginAdmin = await request(app).post('/api/v1/auth/login').send({ email: admin.email, senha, tenant_slug: 'clinica-demo' });
    tokenAdmin = loginAdmin.body.access_token;

    // As duas lojas nascem pelo mesmo cadastro que o lojista usa. A marca de
    // demonstração é gravada direto no banco, como o seed faz: o cadastro não
    // aceita esse campo, por desenho.
    const demo = await cadastrarLoja(tokenLojistaDemo, `Demo ${carimbo}`, cnpjValidoUnico(carimbo));
    lojaDemoId = demo.id;
    lojaDemoSlug = demo.slug;
    await prisma.lojaMercado.update({ where: { id: lojaDemoId }, data: { demonstracao: true } });
    const produtoDemo = await produtoNaLoja(lojaDemoId, `Racao Demo ${carimbo}`);
    produtoDemoSlug = produtoDemo.slug;

    const real = await cadastrarLoja(tokenLojistaReal, `Real ${carimbo}`, cnpjValidoUnico(carimbo + 7));
    lojaRealId = real.id;
    lojaRealSlug = real.slug;
    await produtoNaLoja(lojaRealId, `Racao Real ${carimbo}`);
    await prisma.lojaMercado.update({ where: { id: lojaRealId }, data: { status: 'pendente' } });
  }, 120000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('1. o cadastro do lojista não aceita marcar a própria loja como demonstração (nem desmarcar)', async () => {
    const tokenOutro = await registrarELogar(`Lojista Esperto ${carimbo}`, `lojista.esperto.${carimbo}@example.com`);
    const resposta = await request(app)
      .post('/api/v1/mercado/loja')
      .set('Authorization', `Bearer ${tokenOutro}`)
      .send({
        nome_fantasia: `Esperta ${carimbo}`, email: `esperta.${carimbo}@example.com`, telefone: '(41) 99999-0001',
        cnpj: cnpjValidoUnico(carimbo + 13),
        endereco: 'Rua XV de Novembro, 200', bairro: 'Centro', cidade: 'Curitiba', estado: 'PR',
        aceita_retirada: true, demonstracao: true
      });
    expect(resposta.status).toBe(201);
    const gravada = await prisma.lojaMercado.findUnique({ where: { id: resposta.body.loja.id }, select: { demonstracao: true } });
    expect(gravada?.demonstracao).toBe(false);
  });

  it('2. o painel recusa aprovar loja de demonstração e diz por quê', async () => {
    await prisma.lojaMercado.update({ where: { id: lojaDemoId }, data: { status: 'pendente' } });
    const decisao = await request(app)
      .post(`/api/v1/admin/mercado/lojas/${lojaDemoId}/decisao`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ decisao: 'aprovada' });
    expect(decisao.status).toBe(400);
    expect(String(decisao.body.error || decisao.body.message || JSON.stringify(decisao.body))).toMatch(/demonstra/i);

    const noBanco = await prisma.lojaMercado.findUnique({ where: { id: lojaDemoId }, select: { status: true, aprovada_em: true } });
    expect(noBanco?.status).toBe('pendente');
    expect(noBanco?.aprovada_em).toBeNull();
  });

  it('3. o painel aprova a loja legítima normalmente', async () => {
    const decisao = await request(app)
      .post(`/api/v1/admin/mercado/lojas/${lojaRealId}/decisao`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ decisao: 'aprovada' });
    expect(decisao.status).toBe(200);
    expect(decisao.body.loja.status).toBe('aprovada');
    expect(decisao.body.loja.demonstracao).toBe(false);
  });

  it('4. o painel lista a loja de demonstração com a marca, para ninguém procurá-la na vitrine', async () => {
    const lista = await request(app)
      .get('/api/v1/admin/mercado/lojas')
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect({ status: lista.status, corpo: lista.status === 200 ? 'ok' : lista.body }).toEqual({ status: 200, corpo: 'ok' });
    const demo = lista.body.lojas.find((loja: { id: string }) => loja.id === lojaDemoId);
    expect(demo).toBeDefined();
    expect(demo.demonstracao).toBe(true);
  });

  describe('mesmo gravada como aprovada direto no banco (o acidente de 01/09)', () => {
    beforeAll(async () => {
      await prisma.lojaMercado.update({
        where: { id: lojaDemoId },
        data: { status: 'aprovada', aprovada_em: new Date() }
      });
    });

    it('5. a vitrine logada do tutor lista a legítima e não a de demonstração', async () => {
      const lojas = await request(app)
        .get('/api/v1/mercado/lojas')
        .set('Authorization', `Bearer ${tokenTutor}`);
      expect(lojas.status).toBe(200);
      const ids = lojas.body.lojas.map((loja: { id: string }) => loja.id);
      expect(ids).toContain(lojaRealId);
      expect(ids).not.toContain(lojaDemoId);

      const direta = await request(app)
        .get(`/api/v1/mercado/lojas/${lojaDemoSlug}`)
        .set('Authorization', `Bearer ${tokenTutor}`);
      expect(direta.status).toBe(404);
    });

    it('6. o catálogo do tutor não traz produto da loja de demonstração', async () => {
      const busca = await request(app)
        .get('/api/v1/mercado/produtos')
        .query({ busca: `Racao` })
        .set('Authorization', `Bearer ${tokenTutor}`);
      expect(busca.status).toBe(200);
      const lojasDosProdutos = busca.body.produtos.map((produto: { loja: { id: string } }) => produto.loja.id);
      expect(lojasDosProdutos).toContain(lojaRealId);
      expect(lojasDosProdutos).not.toContain(lojaDemoId);
    });

    it('7. a vitrine pública (sem sessão) esconde a loja e o produto de demonstração', async () => {
      const lojas = await request(app).get('/api/v1/public/mercado/lojas');
      expect(lojas.status).toBe(200);
      const slugs = lojas.body.lojas.map((loja: { slug: string }) => loja.slug);
      expect(slugs).toContain(lojaRealSlug);
      expect(slugs).not.toContain(lojaDemoSlug);

      expect((await request(app).get(`/api/v1/public/mercado/lojas/${lojaDemoSlug}`)).status).toBe(404);
      expect((await request(app).get(`/api/v1/public/mercado/lojas/${lojaDemoSlug}/produtos`)).status).toBe(404);
      expect((await request(app).get(`/api/v1/public/mercado/lojas/${lojaDemoSlug}/produtos/${produtoDemoSlug}`)).status).toBe(404);
      expect((await request(app).get(`/api/v1/public/mercado/lojas/${lojaRealSlug}`)).status).toBe(200);
    });

    it('8. o feed do Google/WhatsApp e o sitemap não citam a loja de demonstração', async () => {
      const feed = await request(app).get('/api/v1/public/mercado/feed.xml');
      expect(feed.status).toBe(200);
      expect(feed.text).toContain(lojaRealSlug);
      expect(feed.text).not.toContain(lojaDemoSlug);

      const { urlsDoMercadoParaSitemap } = require('../../../src/services/mercado/feed.service');
      const urls: string[] = await urlsDoMercadoParaSitemap(tenantId, 'https://saudepet.app.br');
      expect(urls.some((url) => url.includes(`/mercado/${lojaRealSlug}`))).toBe(true);
      expect(urls.some((url) => url.includes(`/mercado/${lojaDemoSlug}`))).toBe(false);
    });

    it('9. o carrinho recusa produto da loja de demonstração', async () => {
      const produtoDemo = await prisma.produtoMercado.findFirst({ where: { loja_id: lojaDemoId }, select: { id: true } });
      const resposta = await request(app)
        .post('/api/v1/mercado/carrinhos/itens')
        .set('Authorization', `Bearer ${tokenTutor}`)
        .send({ produto_id: produtoDemo?.id, quantidade: 1 });
      expect(resposta.status).toBeGreaterThanOrEqual(400);
      expect(resposta.status).toBeLessThan(500);
    });
  });
});
