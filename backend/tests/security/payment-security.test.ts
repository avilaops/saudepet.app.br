const express = require('express');
const request = require('supertest');
const crypto = require('crypto');

jest.mock('../../src/services/payment-gateway.service', () => ({ getGateway: jest.fn() }));

const prisma = require('../../src/config/database');
const PaymentGatewayService = require('../../src/services/payment-gateway.service');
const billingController = require('../../src/controllers/billing.controller');
const webhookRoutes = require('../../src/routes/webhook.routes');
const { errorHandler } = require('../../src/middleware/error.middleware');
const MercadoPagoGateway = require('../../src/services/gateways/mercadopago.gateway');

function responseDouble() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  res.send = jest.fn(() => res);
  return res;
}

describe('segurança de pagamentos e webhooks', () => {
  beforeEach(() => {
    prisma.tenant.findUnique.mockResolvedValue({ id: 'tenant-a', slug: 'tenant-a' });
  });

  it('usa status válido processando quando o gateway exige confirmação', async () => {
    prisma.solicitacao.findFirst.mockResolvedValue({
      id: 'attendance-a',
      tenant_id: 'tenant-a',
      tutor_id: 'tutor-a',
      veterinario_id: 'vet-a',
      veterinario: { usuario: { nome: 'Vet A' } }
    });
    PaymentGatewayService.getGateway.mockResolvedValue({
      createPaymentIntent: jest.fn().mockResolvedValue({
        success: true,
        gateway_payment_id: 'gateway-payment-a',
        client_secret: 'client-secret-not-persisted-in-test-output'
      })
    });
    prisma.transacao.create.mockImplementation(async ({ data }) => ({ id: 'transaction-a', ...data }));
    const req = {
      body: {
        atendimento_id: 'attendance-a',
        valor_total: 100,
        metodo_pagamento: 'pix',
        gateway: 'mercado_pago'
      },
      user: { id: 'tutor-a', tenant_id: 'tenant-a', email: 'tutor@example.com', nome: 'Tutor A' }
    };
    const res = responseDouble();
    const next = jest.fn();

    await billingController.criarPagamento(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(prisma.transacao.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ tenant_id: 'tenant-a', status: 'processando' })
    }));
    const data = prisma.transacao.create.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('gateway_nome');
  });

  it('não aprova nem altera carteira de transação de outro tenant', async () => {
    prisma.transacao.findFirst.mockResolvedValue(null);
    const req = {
      params: { id: 'transaction-b' },
      body: {},
      tenantId: 'tenant-a'
    };
    const res = responseDouble();
    const next = jest.fn();

    await billingController.aprovarPagamento(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
    expect(prisma.transacao.findFirst).toHaveBeenCalledWith({
      where: { id: 'transaction-b', tenant_id: 'tenant-a' }
    });
    expect(prisma.carteiraTutor.upsert).not.toHaveBeenCalled();
    expect(prisma.carteiraVeterinario.upsert).not.toHaveBeenCalled();
  });

  it('entrega JSON aos gateways de webhook', async () => {
    const seen = [];
    PaymentGatewayService.getGateway.mockImplementation(async (_tenantId, gatewayName) => ({
      verifyWebhook: async (payload) => {
        seen.push({ gatewayName, isBuffer: Buffer.isBuffer(payload), payload });
        return { success: true, event_type: 'evento.nao_tratado', event_data: {} };
      }
    }));
    const app = express();
    app.use('/webhooks', webhookRoutes);
    app.use(errorHandler);

    await request(app)
      .post('/webhooks/mercadopago/tenant-a')
      .send({ type: 'other', data: { id: 'event-b' } })
      .expect(200);

    expect(seen.find((item) => item.gatewayName === 'mercado_pago').isBuffer).toBe(false);
  });

  it('valida a assinatura HMAC do Mercado Pago antes de consultar o pagamento', async () => {
    const gateway = new MercadoPagoGateway({
      ambiente: 'sandbox',
      secret_key: 'test-only-key',
      webhook_secret: 'test-only-webhook-secret'
    });
    gateway.getPaymentStatus = jest.fn().mockResolvedValue({
      success: true,
      gateway_payment_id: 'payment-a',
      status: 'aprovado'
    });
    const context = { xRequestId: 'request-a', dataId: 'PAYMENT-A' };
    const ts = '1704908010';
    const manifest = `id:payment-a;request-id:${context.xRequestId};ts:${ts};`;
    const signature = crypto
      .createHmac('sha256', 'test-only-webhook-secret')
      .update(manifest)
      .digest('hex');

    const valid = await gateway.verifyWebhook(
      { type: 'payment', data: { id: 'PAYMENT-A' } },
      { ...context, xSignature: `ts=${ts},v1=${signature}` }
    );
    expect(valid.success).toBe(true);
    expect(gateway.getPaymentStatus).toHaveBeenCalledWith('PAYMENT-A');

    gateway.getPaymentStatus.mockClear();
    const invalid = await gateway.verifyWebhook(
      { type: 'payment', data: { id: 'PAYMENT-A' } },
      { ...context, xSignature: `ts=${ts},v1=${'0'.repeat(64)}` }
    );
    expect(invalid.success).toBe(false);
    expect(gateway.getPaymentStatus).not.toHaveBeenCalled();
  });

  it('não reaplica carteira quando o webhook repetido perde a reivindicação idempotente', async () => {
    prisma.transacao.findFirst.mockResolvedValue({
      id: 'transaction-a',
      tenant_id: 'tenant-a',
      status: 'pendente',
      tutor_id: 'tutor-a',
      veterinario_id: 'vet-a',
      valor_tutor: 100,
      valor_veterinario: 80
    });
    prisma.transacao.updateMany.mockResolvedValue({ count: 0 });
    PaymentGatewayService.getGateway.mockResolvedValue({
      verifyWebhook: jest.fn().mockResolvedValue({
        success: true,
        event_type: 'payment',
        event_data: { id: 'gateway-payment-a', status: 'aprovada' }
      })
    });
    const app = express();
    app.use('/webhooks', webhookRoutes);

    await request(app)
      .post('/webhooks/mercadopago/tenant-a')
      .send({ type: 'payment', data: { id: 'event-a' } })
      .expect(200);

    expect(prisma.carteiraTutor.upsert).not.toHaveBeenCalled();
    expect(prisma.carteiraVeterinario.upsert).not.toHaveBeenCalled();
  });
});

export {};
