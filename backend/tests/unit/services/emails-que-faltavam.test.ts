/**
 * Os três e-mails cujos templates existiam e ninguém chamava.
 *
 * Pedido de avaliação, extrato mensal e chamado urgente. O que estes casos
 * travam é o que separa um lembrete útil de spam: pedir uma vez só, no momento
 * certo, e para quem tem motivo de receber.
 */

jest.mock('../../../src/services/email.service', () => ({
  enviarEmailAvaliacaoNps: jest.fn(),
  enviarEmailExtratoMensalVet: jest.fn()
}));

const prisma = require('../../../src/config/database');
const emailService = require('../../../src/services/email.service');
const avaliacao = require('../../../src/services/pedido-de-avaliacao.worker');
const extrato = require('../../../src/services/extrato-mensal.worker');

const HORA = 3600_000;

function atendimentoFinalizado(extras: Record<string, unknown> = {}) {
  return {
    id: 'atend-1',
    tenant_id: 'tenant-1',
    tutor: { nome: 'Marina Alves', email: 'marina@exemplo.com.br' },
    pet: { nome: 'Amora' },
    veterinario: { usuario: { nome: 'Dr. Henrique' } },
    ...extras
  };
}

describe('Pedido de avaliação', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.solicitacao.findMany.mockResolvedValue([atendimentoFinalizado()]);
    prisma.solicitacao.update.mockResolvedValue({});
    emailService.enviarEmailAvaliacaoNps.mockResolvedValue(undefined);
  });

  it('pede avaliação com o link do atendimento certo', async () => {
    await avaliacao.pedirAvaliacoesPendentes();

    expect(emailService.enviarEmailAvaliacaoNps).toHaveBeenCalledWith(
      'marina@exemplo.com.br',
      expect.objectContaining({
        nomePet: 'Amora',
        nomeVet: 'Dr. Henrique',
        avaliacaoUrl: expect.stringContaining('/tutor/avaliar/atend-1')
      })
    );
  });

  it('só olha atendimentos que já decantaram e ainda não venceram', async () => {
    await avaliacao.pedirAvaliacoesPendentes();

    const where = prisma.solicitacao.findMany.mock.calls[0][0].where;
    const janela = where.finalizado_em;

    // Pedir no mesmo minuto é pedir impressão, não avaliação.
    expect(janela.lte.getTime()).toBeLessThanOrEqual(Date.now() - avaliacao.HORAS_DE_ESPERA * HORA + 1000);
    // E ninguém avalia consulta da semana passada.
    expect(janela.gte.getTime()).toBeGreaterThan(Date.now() - (avaliacao.HORAS_LIMITE + 1) * HORA);
  });

  it('não pede a quem já avaliou nem a quem já recebeu o pedido', async () => {
    await avaliacao.pedirAvaliacoesPendentes();

    const where = prisma.solicitacao.findMany.mock.calls[0][0].where;
    expect(where.avaliacao_pedida_em).toBeNull();
    expect(where.avaliacoes).toEqual({ none: { autor_papel: 'tutor' } });
  });

  it('marca o pedido para não repetir de hora em hora', async () => {
    await avaliacao.pedirAvaliacoesPendentes();

    expect(prisma.solicitacao.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'atend-1' },
        data: { avaliacao_pedida_em: expect.any(Date) }
      })
    );
  });

  it('falha no envio NÃO marca — a próxima rodada tenta de novo', async () => {
    emailService.enviarEmailAvaliacaoNps.mockRejectedValue(new Error('SMTP fora'));

    const resultado = await avaliacao.pedirAvaliacoesPendentes();

    expect(prisma.solicitacao.update).not.toHaveBeenCalled();
    expect(resultado.pedidos).toBe(0);
  });

  it('tutor sem e-mail é marcado assim mesmo, senão seria varrido para sempre', async () => {
    prisma.solicitacao.findMany.mockResolvedValue([
      atendimentoFinalizado({ tutor: { nome: 'Sem e-mail', email: null } })
    ]);

    await avaliacao.pedirAvaliacoesPendentes();

    expect(emailService.enviarEmailAvaliacaoNps).not.toHaveBeenCalled();
    expect(prisma.solicitacao.update).toHaveBeenCalled();
  });
});

describe('Extrato mensal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.paymentSplit.findMany.mockResolvedValue([
      { recipient_id: 'vet-1', recipient_amount: 120 },
      { recipient_id: 'vet-1', recipient_amount: 120 },
      { recipient_id: 'vet-2', recipient_amount: 200 }
    ]);
    prisma.veterinario.findMany.mockResolvedValue([
      { id: 'vet-1', usuario: { nome: 'Dra. Helena', email: 'helena@exemplo.com.br' } },
      { id: 'vet-2', usuario: { nome: 'Dr. Paulo', email: null } }
    ]);
    emailService.enviarEmailExtratoMensalVet.mockResolvedValue(undefined);
  });

  it('soma as consultas e o líquido de cada profissional', async () => {
    await extrato.enviarExtratosDoMes(new Date('2026-09-02T09:00:00'));

    expect(emailService.enviarEmailExtratoMensalVet).toHaveBeenCalledWith(
      'helena@exemplo.com.br',
      expect.objectContaining({ qtdConsultas: 2, valorLiquido: '240,00', mesAno: 'Agosto/2026' })
    );
  });

  it('conta só repasse de veterinário e só o que foi pago', async () => {
    await extrato.enviarExtratosDoMes(new Date('2026-09-02T09:00:00'));

    const where = prisma.paymentSplit.findMany.mock.calls[0][0].where;
    expect(where.recipient_type).toBe('VETERINARIAN');
    // Split pendente não é dinheiro que caiu.
    expect(where.status).toBe('PAID');
  });

  it('quem não tem e-mail não trava o envio dos outros', async () => {
    const resultado = await extrato.enviarExtratosDoMes(new Date('2026-09-02T09:00:00'));

    expect(resultado.veterinarios).toBe(2);
    expect(resultado.enviados).toBe(1);
  });

  it('mês sem movimento não manda nada — extrato zerado parece cobrança', async () => {
    prisma.paymentSplit.findMany.mockResolvedValue([]);

    const resultado = await extrato.enviarExtratosDoMes(new Date('2026-09-02T09:00:00'));

    expect(resultado).toEqual({ veterinarios: 0, enviados: 0 });
    expect(emailService.enviarEmailExtratoMensalVet).not.toHaveBeenCalled();
  });

  it('a janela é o dia 2 pela manhã, não o dia 1', async () => {
    // Dia 1 é cedo: o fechamento do último dia ainda está liquidando.
    // Horas de Brasília, escritas com o fuso: o servidor roda em UTC.
    expect(extrato.ehJanelaDeEnvio(new Date('2026-09-01T09:00:00-03:00'))).toBe(false);
    expect(extrato.ehJanelaDeEnvio(new Date('2026-09-02T09:00:00-03:00'))).toBe(true);
    expect(extrato.ehJanelaDeEnvio(new Date('2026-09-02T15:00:00-03:00'))).toBe(false);
    // 09:00 em UTC são 06:00 em Brasília: ainda não é a janela.
    expect(extrato.ehJanelaDeEnvio(new Date('2026-09-02T09:00:00Z'))).toBe(false);
  });

  it('o mês de referência é o anterior, com a virada do ano certa', () => {
    const janeiro = extrato.mesAnterior(new Date('2027-01-02T09:00:00-03:00'));
    expect(janeiro.rotulo).toBe('Dezembro/2026');
    // O mês vai da meia-noite de Brasília do dia 1 à do dia 1 seguinte.
    expect(janeiro.inicio.toISOString()).toBe('2026-12-01T03:00:00.000Z');
    expect(janeiro.fim.toISOString()).toBe('2027-01-01T03:00:00.000Z');
  });
});
