const request = require('supertest');
const express = require('express');
const billingRoutes = require('../../src/routes/billing.routes');
const { errorHandler } = require('../../src/middleware/error.middleware');

jest.mock('../../src/config/database');
const prisma = require('../../src/config/database');
const jwt = require('jsonwebtoken');

jest.mock('../../src/services/payment-gateway.service', () => ({ getGateway: jest.fn() }));
const PaymentGatewayService = require('../../src/services/payment-gateway.service');

describe('Billing Routes', () => {
  let app;
  let tutorToken;
  let vetToken;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/v1/billing', billingRoutes);
    app.use(errorHandler);
    jest.clearAllMocks();

    tutorToken = jwt.sign(
      { id: 'tutor-1', tipo_usuario: 'tutor', tenant_id: 'tenant-1' },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    vetToken = jwt.sign(
      { id: 'vet-1', tipo_usuario: 'veterinario', tenant_id: 'tenant-1' },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // authMiddleware/tenantContext recarregam usuário e tenant do banco a cada
    // request (Fase 1 de segurança) — sem isso tudo cai em 401 direto.
    const usuariosPorId = {
      'tutor-1': { id: 'tutor-1', tenant_id: 'tenant-1', tipo_usuario: 'tutor', email_verificado: true },
      'vet-1': { id: 'vet-1', tenant_id: 'tenant-1', tipo_usuario: 'veterinario', email_verificado: true }
    };
    prisma.usuario.findUnique.mockImplementation(({ where }) => {
      const usuario = usuariosPorId[where.id];
      if (!usuario) return Promise.resolve(null);
      return Promise.resolve({
        ...usuario,
        tenant: { status: 'ativo', expira_em: null },
        veterinario: usuario.tipo_usuario === 'veterinario' ? { id: 'vet-record-1', aprovado_admin: true } : null
      });
    });
    prisma.tenant.findUnique.mockResolvedValue({ status: 'ativo', expira_em: null, plano: 'premium' });
  });

  describe('GET /api/v1/billing/saldo', () => {
    it('deve retornar saldo do tutor', async () => {
      // O controller usa findFirst (não findUnique) pra buscar a carteira.
      prisma.carteiraTutor.findFirst.mockResolvedValue({
        saldo: 100.00,
        total_gasto: 500.00
      });

      const response = await request(app)
        .get('/api/v1/billing/saldo')
        .set('Authorization', `Bearer ${tutorToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('carteira');
    });

    it('deve retornar saldo do veterinário', async () => {
      // O controller primeiro resolve Veterinario.id a partir do usuario_id
      // (não confunde os dois IDs, é uma das correções da Fase 1 de segurança).
      prisma.veterinario.findFirst.mockResolvedValue({ id: 'vet-record-1' });
      prisma.carteiraVeterinario.findFirst.mockResolvedValue({
        saldo_disponivel: 1500.00,
        saldo_pendente: 300.00,
        total_recebido: 5000.00,
        total_transferido: 0,
        dados_bancarios: null
      });

      const response = await request(app)
        .get('/api/v1/billing/saldo')
        .set('Authorization', `Bearer ${vetToken}`);

      expect(response.status).toBe(200);
      expect(response.body.carteira).toHaveProperty('saldo_disponivel');
    });
  });

  describe('POST /api/v1/billing/pagamentos', () => {
    it('deve criar pagamento de atendimento', async () => {
      const atendimentoId = '33333333-3333-4333-8333-333333333333';

      prisma.solicitacao.findFirst.mockResolvedValue({
        id: atendimentoId,
        veterinario_id: 'vet-record-1',
        veterinario: { usuario: { nome: 'Dr. Teste' } }
      });

      prisma.transacao.create.mockResolvedValue({
        id: 'trans-1',
        valor_total: 150.00,
        valor_veterinario: 127.50,
        valor_plataforma: 22.50,
        status: 'pendente'
      });

      PaymentGatewayService.getGateway.mockResolvedValue({
        createPaymentIntent: jest.fn().mockResolvedValue({
          success: true,
          gateway_payment_id: 'pi_test_123',
          client_secret: null
        })
      });

      const response = await request(app)
        .post('/api/v1/billing/pagamentos')
        .set('Authorization', `Bearer ${tutorToken}`)
        .send({
          atendimento_id: atendimentoId,
          valor_total: 150.00,
          metodo_pagamento: 'pix'
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('transacao');
    });
  });
});

export {};
