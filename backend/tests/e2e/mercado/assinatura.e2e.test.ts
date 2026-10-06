/**
 * Assinatura de ração de ponta a ponta, contra o Postgres real.
 *
 * O caminho inteiro, pelos mesmos endpoints que as telas usam:
 * lojista cadastra a loja com assinatura → admin aprova → produto no catálogo
 * → tutor assina → nasce o primeiro pedido com desconto e 24 h para pagar →
 * pagamento conta o ciclo → vencimento conta perdido e o terceiro pausa →
 * tutor retoma → worker gera o ciclo seguinte → lojista vê o assinante.
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
  geocodificar: jest.fn().mockResolvedValue({ latitude: -21.1775, longitude: -47.8103 })
}));

process.env.DATABASE_URL = process.env.DATABASE_URL
  || 'postgresql://postgres:postgres@localhost:5445/saudepet_test';

const prisma = new PrismaClient();

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

describe('🛒 Assinatura de ração — ponta a ponta', () => {
  const carimbo = Date.now();
  let app: any;
  let tenantId: string;
  let tokenTutor = '';
  let tokenLojista = '';
  let tokenAdmin = '';
  let lojaId = '';
  let produtoId = '';
  let assinaturaId = '';
  let primeiroPedidoId = '';

  const senha = 'Senha@123';
  // CNPJ válido e único por rodada: a base de teste guarda as lojas das rodadas
  // anteriores, e o cadastro recusa CNPJ repetido — que é o comportamento certo.
  const cnpj = cnpjValidoUnico(carimbo);

  async function registrarELogar(nome: string, email: string) {
    const cadastro = await request(app).post('/api/v1/auth/register').send({
      nome, email, senha, tipo_usuario: 'tutor', tenant_slug: 'clinica-demo'
    });
    expect(cadastro.status).toBe(201);
    const login = await request(app).post('/api/v1/auth/login').send({ email, senha, tenant_slug: 'clinica-demo' });
    expect(login.status).toBe(200);
    return login.body.access_token as string;
  }

  beforeAll(async () => {
    process.env.REQUIRE_EMAIL_VERIFICATION = 'false';
    app = express();
    app.use(express.json());
    app.use('/api/v1/auth', require('../../../src/routes/auth.routes'));
    app.use('/api/v1/mercado/loja', require('../../../src/routes/mercado-loja.routes'));
    app.use('/api/v1/mercado', require('../../../src/routes/mercado.routes'));
    app.use('/api/v1/admin/mercado', require('../../../src/routes/mercado-admin.routes'));
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

    tokenTutor = await registrarELogar(`Tutor Assinante ${carimbo}`, `assinante.${carimbo}@example.com`);
    tokenLojista = await registrarELogar(`Lojista ${carimbo}`, `lojista.${carimbo}@example.com`);

    // Admin direto no banco: promoção é ato de outro admin, fora deste fluxo.
    const admin = await prisma.usuario.create({
      data: {
        tenant_id: tenantId, nome: `Admin ${carimbo}`, email: `admin.${carimbo}@example.com`,
        senha: await bcrypt.hash(senha, 10), tipo_usuario: 'admin', email_verificado: true
      }
    });
    const loginAdmin = await request(app).post('/api/v1/auth/login').send({ email: admin.email, senha, tenant_slug: 'clinica-demo' });
    tokenAdmin = loginAdmin.body.access_token;
  }, 120000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('1. lojista cadastra a loja vendendo por assinatura, com 10% e frete grátis', async () => {
    const resposta = await request(app)
      .post('/api/v1/mercado/loja')
      .set('Authorization', `Bearer ${tokenLojista}`)
      .send({
        nome_fantasia: `Rações ${carimbo}`, email: `loja.${carimbo}@example.com`, telefone: '(16) 99999-0000',
        cnpj,
        endereco: 'Rua das Rações, 100', bairro: 'Centro', cidade: 'Ribeirão Preto', estado: 'SP',
        aceita_retirada: true, aceita_combinar: true,
        aceita_entrega: true, entrega_raio_km: 10, frete_base: 8, frete_por_km: 1.5,
        latitude: -21.1775, longitude: -47.8103,
        aceita_assinatura: true, assinatura_desconto_pct: 10, assinatura_frete_gratis: true
      });
    expect(resposta.status).toBe(201);
    lojaId = resposta.body.loja.id;
    expect(resposta.body.loja).toMatchObject({ aceita_assinatura: true, assinatura_frete_gratis: true });
    expect(Number(resposta.body.loja.assinatura_desconto_pct)).toBe(10);
  });

  it('2. desconto acima de 50% é recusado', async () => {
    const resposta = await request(app)
      .put('/api/v1/mercado/loja')
      .set('Authorization', `Bearer ${tokenLojista}`)
      .send({
        nome_fantasia: `Rações ${carimbo}`, email: `loja.${carimbo}@example.com`, telefone: '(16) 99999-0000',
        cnpj,
        endereco: 'Rua das Rações, 100', cidade: 'Ribeirão Preto', estado: 'SP',
        aceita_assinatura: true, assinatura_desconto_pct: 80
      });
    expect(resposta.status).toBe(400);
    expect(resposta.body.error).toMatch(/entre 0% e 50%/);
  });

  it('3. produto no catálogo e loja aprovada pelo admin', async () => {
    const produto = await request(app)
      .post('/api/v1/mercado/loja/produtos')
      .set('Authorization', `Bearer ${tokenLojista}`)
      .send({ nome: 'Ração Premium Cães Adultos 15 kg', preco: 200, peso_gramas: 15000, estoque: 5, unidade: 'saco', especie_alvo: 'cao' });
    expect(produto.status).toBe(201);
    produtoId = produto.body.produto.id;

    const enviar = await request(app).post('/api/v1/mercado/loja/enviar').set('Authorization', `Bearer ${tokenLojista}`);
    expect([200, 201]).toContain(enviar.status);

    const decisao = await request(app)
      .post(`/api/v1/admin/mercado/lojas/${lojaId}/decisao`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ decisao: 'aprovada', comissao_pct: 15 });
    expect(decisao.status).toBe(200);
  });

  it('4. o tutor vê a política de assinatura na página do produto', async () => {
    const resposta = await request(app).get(`/api/v1/mercado/produtos/${produtoId}`).set('Authorization', `Bearer ${tokenTutor}`);
    expect(resposta.status).toBe(200);
    expect(resposta.body.produto.loja).toMatchObject({ aceita_assinatura: true, assinatura_frete_gratis: true });
  });

  it('5. contrato: corpo mal formado é recusado antes do serviço', async () => {
    const semItens = await request(app).post('/api/v1/mercado/assinaturas').set('Authorization', `Bearer ${tokenTutor}`).send({ itens: [] });
    expect(semItens.status).toBe(400);
    expect(semItens.body.details[0].field).toBe('itens');

    const lojaSemPonto = await request(app)
      .post('/api/v1/mercado/assinaturas')
      .set('Authorization', `Bearer ${tokenTutor}`)
      .send({ itens: [{ produto_id: produtoId }], entrega_tipo: 'loja', endereco: { endereco: 'Rua A, 1' } });
    expect(lojaSemPonto.status).toBe(400);
    expect(lojaSemPonto.body.details.map((d: any) => d.field)).toContain('endereco');

    const frequenciaCurta = await request(app)
      .post('/api/v1/mercado/assinaturas')
      .set('Authorization', `Bearer ${tokenTutor}`)
      .send({ itens: [{ produto_id: produtoId }], frequencia_dias: 2 });
    expect(frequenciaCurta.status).toBe(400);
    expect(frequenciaCurta.body.details[0].field).toBe('frequencia_dias');
  });

  it('6. sugestão de frequência: 15 kg para porte grande dura 33 dias', async () => {
    const resposta = await request(app)
      .get('/api/v1/mercado/assinaturas/sugestao')
      .query({ produto_id: produtoId, quantidade: 1 })
      .set('Authorization', `Bearer ${tokenTutor}`);
    expect(resposta.status).toBe(200);
    expect(resposta.body.sugestao.dias).toBe(30); // sem pet: padrão
  });

  it('7. tutor assina com entrega pela loja: primeiro pedido nasce com 10% off, frete grátis e 24 h', async () => {
    const resposta = await request(app)
      .post('/api/v1/mercado/assinaturas')
      .set('Authorization', `Bearer ${tokenTutor}`)
      .send({
        itens: [{ produto_id: produtoId, quantidade: 1 }],
        frequencia_dias: 30,
        entrega_tipo: 'loja',
        endereco: { endereco: 'Av. do Café, 500', cidade: 'Ribeirão Preto', latitude: -21.19, longitude: -47.82 }
      });
    expect(resposta.status).toBe(201);
    const { assinatura, pedido } = resposta.body;
    assinaturaId = assinatura.id;
    primeiroPedidoId = pedido.id;

    expect(assinatura).toMatchObject({ status: 'ativa', frequencia_dias: 30, frete_gratis: true, ciclos_gerados: 1, ciclos_pagos: 0 });
    expect(Number(assinatura.desconto_pct)).toBe(10);

    expect(pedido.assinatura_id).toBe(assinaturaId);
    expect(Number(pedido.subtotal)).toBe(200);
    expect(Number(pedido.desconto)).toBe(20);
    expect(Number(pedido.frete)).toBe(0);
    expect(Number(pedido.total)).toBe(180);
    expect(Number(pedido.comissao_valor)).toBe(27); // 15% de 180
    expect(Number(pedido.repasse_loja)).toBe(153);
    const horas = (new Date(pedido.expira_em).getTime() - Date.now()) / 3_600_000;
    expect(horas).toBeGreaterThan(23);

    // Reservou estoque como qualquer pedido.
    const produto = await prisma.produtoMercado.findUnique({ where: { id: produtoId }, select: { estoque: true } });
    expect(produto?.estoque).toBe(4);
  });

  it('8. o pedido aparece na lista do tutor marcado como assinatura, e "pedir agora" não duplica', async () => {
    const pedidos = await request(app).get('/api/v1/mercado/pedidos').set('Authorization', `Bearer ${tokenTutor}`);
    expect(pedidos.body.pedidos.find((p: any) => p.id === primeiroPedidoId)?.assinatura_id).toBe(assinaturaId);

    const duplicado = await request(app).post(`/api/v1/mercado/assinaturas/${assinaturaId}/pedir-agora`).set('Authorization', `Bearer ${tokenTutor}`);
    expect(duplicado.status).toBe(409);
  });

  it('9. pagar o pedido do ciclo conta como ciclo pago', async () => {
    const { marcarComoPago } = require('../../../src/services/mercado/pedido.service');
    await marcarComoPago({ pedidoId: primeiroPedidoId, origem: 'teste' });
    const assinatura = await prisma.assinaturaMercado.findUnique({ where: { id: assinaturaId } });
    expect(assinatura?.ciclos_pagos).toBe(1);
    expect(assinatura?.ciclos_perdidos_seguidos).toBe(0);
  });

  it('10. três ciclos vencidos seguidos pausam a assinatura e devolvem o estoque', async () => {
    const { expirarPedidosVencidos } = require('../../../src/services/mercado/pedido.service');
    const { gerarCiclo } = require('../../../src/services/mercado/assinatura.service');

    for (let vez = 1; vez <= 3; vez += 1) {
      const ciclo = await gerarCiclo({ assinaturaId, origem: 'worker' });
      expect(ciclo.gerado).toBe(true);
      // Vence o pedido "no passado" e roda o relógio.
      await prisma.pedidoMercado.update({ where: { id: ciclo.pedido.id }, data: { expira_em: new Date(Date.now() - 1000) } });
      const resultado = await expirarPedidosVencidos();
      expect(resultado.expirados).toBeGreaterThanOrEqual(1);
      const assinatura = await prisma.assinaturaMercado.findUnique({ where: { id: assinaturaId } });
      expect(assinatura?.ciclos_perdidos_seguidos).toBe(vez);
      expect(assinatura?.status).toBe(vez < 3 ? 'ativa' : 'pausada');
    }

    const produto = await prisma.produtoMercado.findUnique({ where: { id: produtoId }, select: { estoque: true } });
    expect(produto?.estoque).toBe(4); // o pago ficou fora; os três vencidos voltaram
  });

  it('11. pausada não gera; tutor retoma e o worker gera o ciclo seguinte quando a data chega', async () => {
    const { processarCiclosVencidos } = require('../../../src/services/mercado/assinatura.service');

    const nada = await processarCiclosVencidos();
    expect(nada.gerados).toBe(0);

    const retomar = await request(app).post(`/api/v1/mercado/assinaturas/${assinaturaId}/retomar`).set('Authorization', `Bearer ${tokenTutor}`);
    expect(retomar.status).toBe(200);
    expect(retomar.body.assinatura).toMatchObject({ status: 'ativa', ciclos_perdidos_seguidos: 0 });

    // Adianta o relógio: a data do próximo ciclo chegou.
    await prisma.assinaturaMercado.update({ where: { id: assinaturaId }, data: { proximo_ciclo_em: new Date(Date.now() - 1000) } });
    const gerou = await processarCiclosVencidos();
    expect(gerou.gerados).toBe(1);

    const detalhe = await request(app).get(`/api/v1/mercado/assinaturas/${assinaturaId}`).set('Authorization', `Bearer ${tokenTutor}`);
    expect(detalhe.status).toBe(200);
    expect(detalhe.body.assinatura.ciclos_gerados).toBe(5);
    expect(detalhe.body.pedidos.length).toBe(5);
  });

  it('12. mudar a frequência e cancelar; cancelada não retoma', async () => {
    const alterar = await request(app)
      .put(`/api/v1/mercado/assinaturas/${assinaturaId}`)
      .set('Authorization', `Bearer ${tokenTutor}`)
      .send({ frequencia_dias: 45, itens: [{ produto_id: produtoId, quantidade: 2 }] });
    expect(alterar.status).toBe(200);
    expect(alterar.body.assinatura.frequencia_dias).toBe(45);
    expect(alterar.body.assinatura.itens[0].quantidade).toBe(2);

    const cancelar = await request(app)
      .post(`/api/v1/mercado/assinaturas/${assinaturaId}/cancelar`)
      .set('Authorization', `Bearer ${tokenTutor}`)
      .send({ motivo: 'Mudei de cidade' });
    expect(cancelar.status).toBe(200);
    expect(cancelar.body.assinatura).toMatchObject({ status: 'cancelada', cancelado_motivo: 'Mudei de cidade' });

    const retomar = await request(app).post(`/api/v1/mercado/assinaturas/${assinaturaId}/retomar`).set('Authorization', `Bearer ${tokenTutor}`);
    expect(retomar.status).toBe(409);
  });

  it('13. outro tutor não enxerga a assinatura; o lojista vê o assinante', async () => {
    const alheio = await request(app).get(`/api/v1/mercado/assinaturas/${assinaturaId}`).set('Authorization', `Bearer ${tokenLojista}`);
    expect(alheio.status).toBe(404);

    const daLoja = await request(app).get('/api/v1/mercado/loja/assinaturas').set('Authorization', `Bearer ${tokenLojista}`);
    expect(daLoja.status).toBe(200);
    const assinante = daLoja.body.assinaturas.find((a: any) => a.id === assinaturaId);
    expect(assinante.tutor.nome).toMatch(/Tutor Assinante/);
    expect(assinante.itens[0].produto.nome).toMatch(/Ração Premium/);
  });
});
