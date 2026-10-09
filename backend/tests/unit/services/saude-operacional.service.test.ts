/**
 * Sinais de operação travada (`GET /api/v1/automation/operacao/saude`).
 *
 * O n8n lê essa resposta de hora em hora e avisa o administrador. O que se
 * garante aqui: sinal zerado não vira alerta, e os cortes de tempo de cada
 * consulta são os que o título promete.
 */
import prisma from '../../../src/config/database';
import { medirSaudeOperacional } from '../../../src/services/saude-operacional.service';

const banco = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const AGORA = new Date('2026-10-09T15:00:00.000Z');

function contagens(valores: { solicitacao?: number[]; payment?: number; agendamento?: number; veterinario?: number }) {
  const [parados = 0, documentos = 0, semVeterinario = 0, abertos = 0] = valores.solicitacao || [];
  banco.solicitacao.count
    .mockResolvedValueOnce(parados)
    .mockResolvedValueOnce(documentos)
    .mockResolvedValueOnce(semVeterinario)
    .mockResolvedValueOnce(abertos);
  banco.payment.count.mockResolvedValue(valores.payment || 0);
  banco.agendamento.count.mockResolvedValue(valores.agendamento || 0);
  banco.veterinario.count.mockResolvedValue(valores.veterinario || 0);
}

describe('saúde operacional', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('sem nada parado responde ok e sem alertas, mas lista todos os sinais medidos', async () => {
    contagens({});
    const saude = await medirSaudeOperacional(AGORA);

    expect(saude.ok).toBe(true);
    expect(saude.total_de_alertas).toBe(0);
    expect(saude.alertas).toEqual([]);
    expect(saude.sinais.map((sinal) => sinal.codigo)).toEqual([
      'chamados_parados',
      'documentos_pendentes',
      'pagamentos_com_problema',
      'chamados_sem_veterinario',
      'atendimentos_abertos',
      'agendamentos_sem_resposta',
      'credenciamentos_parados'
    ]);
    expect(saude.gerado_em).toBe(AGORA.toISOString());
  });

  it('só o sinal com contagem vira alerta, com o total e a gravidade dele', async () => {
    contagens({ solicitacao: [0, 2, 0, 0], agendamento: 3 });
    const saude = await medirSaudeOperacional(AGORA);

    expect(saude.ok).toBe(false);
    expect(saude.alertas.map(({ codigo, total, gravidade }) => ({ codigo, total, gravidade }))).toEqual([
      { codigo: 'documentos_pendentes', total: 2, gravidade: 'alta' },
      { codigo: 'agendamentos_sem_resposta', total: 3, gravidade: 'media' }
    ]);
  });

  it('chamado só conta como parado depois de 30 minutos de busca', async () => {
    contagens({});
    await medirSaudeOperacional(AGORA);

    expect(banco.solicitacao.count.mock.calls[0][0].where).toEqual({
      status: { in: ['criado', 'procurando_veterinario', 'oferta_enviada'] },
      criado_em: { lte: new Date('2026-10-09T14:30:00.000Z') }
    });
  });

  it('documento pendente dá uma hora para a reemissão e desiste junto com ela, em 7 dias', async () => {
    contagens({});
    await medirSaudeOperacional(AGORA);

    expect(banco.solicitacao.count.mock.calls[1][0].where).toEqual({
      status: { in: ['finalizado', 'concluido', 'encaminhado'] },
      finalizado_em: { gte: new Date('2026-10-02T15:00:00.000Z'), lte: new Date('2026-10-09T14:00:00.000Z') },
      prontuario_pdf_url: null,
      prontuario: { isNot: null }
    });
  });

  it('agendamento pendente alerta por espera de 24 horas ou por já ter passado da hora', async () => {
    contagens({});
    await medirSaudeOperacional(AGORA);

    expect(banco.agendamento.count.mock.calls[0][0].where).toEqual({
      status: 'pendente',
      OR: [{ criado_em: { lte: new Date('2026-10-08T15:00:00.000Z') } }, { inicio: { lte: AGORA } }]
    });
  });
});
