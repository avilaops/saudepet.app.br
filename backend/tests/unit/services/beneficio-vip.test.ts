/**
 * Os benefícios do plano VIP que não cabiam na mecânica de desconto.
 *
 * A vitrine promete "Teleorientação Veterinária Ilimitada" e "Vacina anual
 * preventiva inclusa". Isso custa mais do que a comissão da plataforma arrecada
 * — uma teleorientação de R$ 80 rende R$ 16 —, mas o plano está aprovado com
 * esse texto, então o benefício é real e o custo é assumido. O que não pode é a
 * vitrine prometer e o sistema não entregar.
 *
 * ═══ Por que estes testes passavam com o código quebrado ═══
 *
 * Até 26/08/2026 a contagem da vacina anual usava
 * `payment.count({ where: { atendimento: { tipo_atendimento } } })` — e
 * `Payment` NÃO tem relação chamada `atendimento`, só a coluna
 * `atendimento_id`. Em produção o Prisma recusava o `where` e o `.catch(() => 0)`
 * devolvia zero, então TODA vacinação saía de graça, para sempre, com a
 * plataforma bancando.
 *
 * Aqui isso não aparecia: `prisma.payment.count` é um `jest.fn()` que devolve o
 * que mandarmos, sem olhar o `where`. **Um Prisma mockado não valida a forma da
 * consulta** — ele aceita campo que não existe. Quem achou foi o compilador do
 * TypeScript, na migração do arquivo.
 *
 * Lição para os testes desta casa: mock de banco prova a LÓGICA, nunca a
 * consulta. Onde a consulta é a regra de negócio, o tipo é a única guarda.
 */

const prisma = require('../../../src/config/database');
const servico = require('../../../src/services/beneficio-assinatura.service');

const TENANT = 'tenant-1';
const TUTOR = 'tutor-1';

function assinatura(beneficios: string[], desconto = 10) {
  return {
    id: 'assin-1',
    plano: {
      nome: 'Saúde PET VIP',
      desconto_pct: desconto,
      limite_atendimentos: 4,
      beneficios: JSON.stringify(beneficios)
    }
  };
}

const VIP = [
  'Teleorientação Veterinária Ilimitada',
  'Vacina anual preventiva inclusa sem custo adicional',
  '10% de desconto em todas as consultas'
];

describe('Benefícios do plano VIP', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.assinaturaUsuario.findFirst.mockResolvedValue(assinatura(VIP));
    prisma.payment.count.mockResolvedValue(0);
    // A contagem anual agora passa por `solicitacao.findMany` (os atendimentos
    // do tipo) antes de contar cobranças — não há relação para aninhar.
    prisma.solicitacao.findMany.mockResolvedValue([]);
  });

  it('teleorientação sai de graça para quem tem o benefício', async () => {
    const resultado = await servico.calcularBeneficio({
      tenantId: TENANT, tutorId: TUTOR, precoCheio: 80, tipoAtendimento: 'teleorientacao'
    });

    expect(resultado.valor_a_pagar).toBe(0);
    expect(resultado.desconto_valor).toBe(80);
    expect(resultado.beneficio).toBe('teleorientacao_ilimitada');
  });

  it('a teleorientação não consome o limite mensal do desconto', async () => {
    // Contar as duas juntas faria o VIP perder o desconto das consultas por
    // ter conversado com o veterinário.
    prisma.payment.count.mockResolvedValue(4);

    const resultado = await servico.calcularBeneficio({
      tenantId: TENANT, tutorId: TUTOR, precoCheio: 80, tipoAtendimento: 'teleorientacao'
    });

    expect(resultado.valor_a_pagar).toBe(0);
  });

  it('a contagem anual olha só vacinação do próprio tutor, na janela de um ano', async () => {
    await servico.calcularBeneficio({
      tenantId: TENANT, tutorId: TUTOR, precoCheio: 120, tipoAtendimento: 'vacinacao'
    });

    const where = prisma.solicitacao.findMany.mock.calls[0][0].where;
    expect(where.tipo_atendimento).toBe('vacinacao');
    expect(where.tutor_id).toBe(TUTOR);
    expect(where.tenant_id).toBe(TENANT);
    expect(where.criado_em.gte.getFullYear()).toBe(new Date().getFullYear() - 1);
  });

  it('se a contagem falhar, o benefício NÃO sai de graça', async () => {
    // Falhar e devolver 0 era exatamente o bug. O pior caso aceitável é o
    // tutor pagar COM desconto, não deixar de pagar.
    prisma.solicitacao.findMany.mockRejectedValue(new Error('banco fora'));

    const resultado = await servico.calcularBeneficio({
      tenantId: TENANT, tutorId: TUTOR, precoCheio: 120, tipoAtendimento: 'vacinacao'
    });

    expect(resultado.valor_a_pagar).toBeGreaterThan(0);
    expect(resultado.beneficio).toBeUndefined();
  });

  it('a primeira vacinação do ano é inclusa', async () => {
    const resultado = await servico.calcularBeneficio({
      tenantId: TENANT, tutorId: TUTOR, precoCheio: 120, tipoAtendimento: 'vacinacao'
    });

    expect(resultado.valor_a_pagar).toBe(0);
    expect(resultado.beneficio).toBe('vacina_anual_inclusa');
  });

  it('a segunda vacinação do ano volta ao desconto normal', async () => {
    prisma.solicitacao.findMany.mockResolvedValue([{ id: 'atend-vacina-1' }]);
    prisma.payment.count.mockResolvedValue(1);

    const resultado = await servico.calcularBeneficio({
      tenantId: TENANT, tutorId: TUTOR, precoCheio: 120, tipoAtendimento: 'vacinacao'
    });

    // 10% de 120 = 12.
    expect(resultado.valor_a_pagar).toBe(108);
    expect(resultado.beneficio).toBeUndefined();
  });

  it('consulta domiciliar segue o desconto percentual, sem benefício especial', async () => {
    const resultado = await servico.calcularBeneficio({
      tenantId: TENANT, tutorId: TUTOR, precoCheio: 150, tipoAtendimento: 'consulta_domiciliar'
    });

    expect(resultado.valor_a_pagar).toBe(135);
  });

  it('plano sem os benefícios especiais não ganha teleorientação grátis', async () => {
    prisma.assinaturaUsuario.findFirst.mockResolvedValue(
      assinatura(['10% de desconto em todas as consultas'])
    );

    const resultado = await servico.calcularBeneficio({
      tenantId: TENANT, tutorId: TUTOR, precoCheio: 80, tipoAtendimento: 'teleorientacao'
    });

    expect(resultado.valor_a_pagar).toBe(72);
  });

  it('benefício mal escrito no banco não derruba a cobrança', async () => {
    prisma.assinaturaUsuario.findFirst.mockResolvedValue({
      id: 'assin-1',
      plano: { nome: 'Quebrado', desconto_pct: 10, limite_atendimentos: 2, beneficios: '{não é json' }
    });

    const resultado = await servico.calcularBeneficio({
      tenantId: TENANT, tutorId: TUTOR, precoCheio: 80, tipoAtendimento: 'teleorientacao'
    });

    // Sem benefício especial, o desconto percentual continua valendo.
    expect(resultado.valor_a_pagar).toBe(72);
  });

  it('sem assinatura, paga o preço cheio', async () => {
    prisma.assinaturaUsuario.findFirst.mockResolvedValue(null);

    const resultado = await servico.calcularBeneficio({
      tenantId: TENANT, tutorId: TUTOR, precoCheio: 80, tipoAtendimento: 'teleorientacao'
    });

    expect(resultado.valor_a_pagar).toBe(80);
  });
});
