// Benefício do plano no preço do atendimento.
//
// `limite_atendimentos` estava gravado e nunca era aplicado. A economia dos
// planos cadastrados desfaz a ambiguidade: "Saúde PET Básico" custa R$ 29,90,
// promete "10% de desconto em todas as consultas" e tem limite 2 — e a consulta
// domiciliar custa R$ 150, cujos 10% são R$ 15, dois por mês R$ 30. O número é
// quantos atendimentos do mês recebem o DESCONTO, não um teto de atendimento.
const prisma = require('../../../src/config/database');

const { calcularBeneficio, resumoDoBeneficio } = require('../../../src/services/beneficio-assinatura.service');
const paymentService = require('../../../src/services/payment/payment.service');

const assinatura = (extra = {}) => ({
  id: 'assin-1',
  plano: { nome: 'Saúde PET Básico', desconto_pct: 10, limite_atendimentos: 2 },
  ...extra
});

const escopo = { tenantId: 'tenant-1', tutorId: 'tutor-1' };

beforeEach(() => {
  jest.clearAllMocks();
  prisma.assinaturaUsuario.findFirst.mockResolvedValue(assinatura());
  prisma.payment.count.mockResolvedValue(0);
});

describe('Desconto do plano', () => {
  it('aplica os 10% do plano Básico na consulta de R$ 150', async () => {
    const beneficio = await calcularBeneficio({ ...escopo, precoCheio: 150 });

    expect(beneficio.preco_cheio).toBe(150);
    expect(beneficio.desconto_valor).toBe(15);
    expect(beneficio.valor_a_pagar).toBe(135);
    expect(beneficio.assinatura_id).toBe('assin-1');
  });

  it('conta o benefício já usado no mês', async () => {
    prisma.payment.count.mockResolvedValue(1);

    const beneficio = await calcularBeneficio({ ...escopo, precoCheio: 150 });

    expect(beneficio.usados_no_mes).toBe(1);
    expect(beneficio.desconto_valor).toBe(15);
  });

  it('esgotado o limite, o atendimento continua — só sem desconto', async () => {
    // É a diferença entre limitar o BENEFÍCIO e limitar o CUIDADO. Bloquear um
    // tutor de chamar veterinário para um pet doente seria inaceitável.
    prisma.payment.count.mockResolvedValue(2);

    const beneficio = await calcularBeneficio({ ...escopo, precoCheio: 150 });

    expect(beneficio.esgotado).toBe(true);
    expect(beneficio.desconto_valor).toBe(0);
    expect(beneficio.valor_a_pagar).toBe(150);
  });

  it('plano sem limite dá desconto em todos os atendimentos', async () => {
    prisma.assinaturaUsuario.findFirst.mockResolvedValue(
      assinatura({ plano: { nome: 'VIP', desconto_pct: 20, limite_atendimentos: null } })
    );
    prisma.payment.count.mockResolvedValue(37);

    const beneficio = await calcularBeneficio({ ...escopo, precoCheio: 150 });

    expect(beneficio.desconto_valor).toBe(30);
    expect(beneficio.valor_a_pagar).toBe(120);
  });

  it('sem assinatura, o preço é o de tabela', async () => {
    prisma.assinaturaUsuario.findFirst.mockResolvedValue(null);

    const beneficio = await calcularBeneficio({ ...escopo, precoCheio: 150 });

    expect(beneficio.desconto_valor).toBe(0);
    expect(beneficio.valor_a_pagar).toBe(150);
    expect(beneficio.plano).toBeNull();
  });

  it('assinatura pendente de pagamento não dá desconto', async () => {
    // `findFirst` filtra por status 'ativa': quem ainda não pagou não usufrui.
    await calcularBeneficio({ ...escopo, precoCheio: 150 });
    expect(prisma.assinaturaUsuario.findFirst.mock.calls[0][0].where.status).toBe('ativa');
  });

  it('plano sem percentual configurado não muda nada', async () => {
    prisma.assinaturaUsuario.findFirst.mockResolvedValue(
      assinatura({ plano: { nome: 'Clube', desconto_pct: 0, limite_atendimentos: 5 } })
    );

    const beneficio = await calcularBeneficio({ ...escopo, precoCheio: 150 });
    expect(beneficio.valor_a_pagar).toBe(150);
  });

  it('arredonda o desconto em centavos', async () => {
    const beneficio = await calcularBeneficio({ ...escopo, precoCheio: 80 });
    expect(beneficio.desconto_valor).toBe(8);
    expect(beneficio.valor_a_pagar).toBe(72);
  });
});

describe('Quem banca o desconto', () => {
  const gateway = {
    createPayment: jest.fn().mockResolvedValue({ externalPaymentId: 'mp-1', status: 'PENDING' })
  };

  beforeEach(() => {
    jest.spyOn(paymentService, 'getGateway').mockResolvedValue(gateway);
    prisma.usuario.findUnique.mockResolvedValue({ id: 'tutor-1', nome: 'Maria' });
    prisma.solicitacao.findUnique.mockResolvedValue({
      id: 'atend-1',
      veterinario: { id: 'vet-1', status_financeiro: 'ACTIVE', asaas_wallet_id: 'w1', usuario: { nome: 'Ana' } }
    });
    prisma.configuracaoTenant.findUnique.mockResolvedValue({ comissao_plataforma_pct: 15 });
    prisma.payment.create.mockImplementation(({ data }) => Promise.resolve({ id: 'pay-1', ...data }));
    prisma.payment.update.mockResolvedValue({ id: 'pay-1' });
    prisma.paymentSplit.createMany.mockResolvedValue({ count: 1 });
  });

  it('o veterinário recebe sobre o preço cheio, não sobre o descontado', async () => {
    // Descontar do valor bruto cortaria os dois na mesma proporção, tirando
    // dinheiro de quem foi até a casa do animal e não vendeu plano nenhum.
    await paymentService.createPaymentIntent({
      tenantId: 'tenant-1',
      atendimentoId: 'atend-1',
      tutorId: 'tutor-1',
      amount: 135,
      beneficio: { preco_cheio: 150, desconto_valor: 15, assinatura_id: 'assin-1' }
    });

    const splits = prisma.paymentSplit.createMany.mock.calls[0][0].data;
    const doVet = splits.find((item) => item.recipient_type === 'VETERINARIAN');
    // 150 − 15% = 127,50, o mesmo que ele receberia sem plano nenhum.
    expect(Number(doVet.recipient_amount)).toBeCloseTo(127.5, 2);
  });

  it('a comissão da plataforma absorve o desconto', async () => {
    await paymentService.createPaymentIntent({
      tenantId: 'tenant-1',
      atendimentoId: 'atend-1',
      tutorId: 'tutor-1',
      amount: 135,
      beneficio: { preco_cheio: 150, desconto_valor: 15, assinatura_id: 'assin-1' }
    });

    // Tutor pagou 135, vet recebe 127,50: sobram 7,50 para a plataforma, em vez
    // dos 22,50 que ela teria sem o benefício.
    const dados = prisma.payment.create.mock.calls[0][0].data;
    expect(Number(dados.preco_cheio)).toBe(150);
    expect(Number(dados.desconto_valor)).toBe(15);
    expect(dados.desconto_assinatura_id).toBe('assin-1');
  });

  it('desconto maior que a comissão zera a plataforma, nunca o veterinário', async () => {
    await paymentService.createPaymentIntent({
      tenantId: 'tenant-1',
      atendimentoId: 'atend-1',
      tutorId: 'tutor-1',
      amount: 100,
      beneficio: { preco_cheio: 150, desconto_valor: 50, assinatura_id: 'assin-1' }
    });

    const splits = prisma.paymentSplit.createMany.mock.calls[0][0].data;
    const doVet = splits.find((item) => item.recipient_type === 'VETERINARIAN');
    expect(Number(doVet.recipient_amount)).toBeCloseTo(127.5, 2);

    const daPlataforma = splits.find((item) => item.recipient_type === 'PLATFORM');
    if (daPlataforma) expect(Number(daPlataforma.platform_fee)).toBeGreaterThanOrEqual(0);
  });

  it('sem benefício, o cálculo continua o de sempre', async () => {
    await paymentService.createPaymentIntent({
      tenantId: 'tenant-1',
      atendimentoId: 'atend-1',
      tutorId: 'tutor-1',
      amount: 150
    });

    const splits = prisma.paymentSplit.createMany.mock.calls[0][0].data;
    const doVet = splits.find((item) => item.recipient_type === 'VETERINARIAN');
    expect(Number(doVet.recipient_amount)).toBeCloseTo(127.5, 2);
    expect(Number(prisma.payment.create.mock.calls[0][0].data.desconto_valor)).toBe(0);
  });
});

describe('Resumo para as telas', () => {
  it('diz quanto do benefício ainda resta no mês', async () => {
    prisma.payment.count.mockResolvedValue(1);

    const { plano } = await resumoDoBeneficio(escopo);

    expect(plano).toEqual(expect.objectContaining({
      nome: 'Saúde PET Básico', desconto_pct: 10, limite_mensal: 2, usados_no_mes: 1, restantes: 1
    }));
  });

  it('plano ilimitado não tem restante a informar', async () => {
    prisma.assinaturaUsuario.findFirst.mockResolvedValue(
      assinatura({ plano: { nome: 'VIP', desconto_pct: 20, limite_atendimentos: null } })
    );

    const { plano } = await resumoDoBeneficio(escopo);
    expect(plano.restantes).toBeNull();
  });

  it('sem assinatura, nada a mostrar', async () => {
    prisma.assinaturaUsuario.findFirst.mockResolvedValue(null);

    const { plano } = await resumoDoBeneficio(escopo);
    expect(plano).toBeNull();
  });
});

export {};
