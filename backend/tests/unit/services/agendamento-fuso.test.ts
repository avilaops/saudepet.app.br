/**
 * A grade do veterinário é o relógio dele, não o do servidor.
 *
 * O contêiner roda em UTC. Em 08/10/2026, no primeiro teste de agenda feito em
 * produção, o veterinário cadastrou 09:00–17:00 e o tutor recebeu horários
 * livres das 06:00 às 13:00 de Brasília: a grade era lida no relógio do
 * servidor. Quem marcasse "09:00" na tela estava marcando três horas antes do
 * que o profissional atende.
 */
import prisma from '../../../src/config/database';
import { dentroDaGrade, horariosLivres } from '../../../src/services/agendamento.service';
import { diaPedido, inicioDoDiaBr, inicioDoMesBr, instanteDoRelogio, relogioDeParede } from '../../../src/utils/datas';

const banco = prisma as unknown as { agendaDisponivel: { findMany: jest.Mock }; agendamento: { findMany: jest.Mock } };
const emBrasilia = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });

// Um dia bem no futuro, para "horário que já passou" não interferir: sexta, 08/10/2027.
const DIA = '2027-10-08';
const GRADE = [{ dia_semana: 5, hora_inicio: '09:00', hora_fim: '12:00', ativo: true }];

describe('agenda no relógio do Brasil', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.TZ_EXIBICAO;
    banco.agendaDisponivel.findMany.mockResolvedValue(GRADE);
    banco.agendamento.findMany.mockResolvedValue([]);
  });

  it('grade 09:00–12:00 oferece 09:00, 10:00 e 11:00 de Brasília', async () => {
    const livres = await horariosLivres({ tenantId: 't', veterinarioId: 'v', data: DIA });

    expect(livres.map((slot) => emBrasilia(slot.inicio))).toEqual(['09:00', '10:00', '11:00']);
    // 09:00 de Brasília é 12:00 em UTC.
    expect(livres[0].inicio).toBe('2027-10-08T12:00:00.000Z');
    // E a grade procurada é a de sexta-feira, o dia pedido.
    expect(banco.agendaDisponivel.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ dia_semana: 5 }) }));
  });

  it('procura os ocupados dentro do dia de Brasília, da meia-noite à meia-noite', async () => {
    await horariosLivres({ tenantId: 't', veterinarioId: 'v', data: DIA });

    const { inicio } = banco.agendamento.findMany.mock.calls[0][0].where;
    expect(inicio.gte.toISOString()).toBe('2027-10-08T03:00:00.000Z');
    expect(inicio.lt.toISOString()).toBe('2027-10-09T03:00:00.000Z');
  });

  it('consulta já marcada às 10:00 de Brasília tira só esse horário', async () => {
    banco.agendamento.findMany.mockResolvedValue([{ inicio: new Date('2027-10-08T13:00:00.000Z'), fim: new Date('2027-10-08T14:00:00.000Z') }]);

    const livres = await horariosLivres({ tenantId: 't', veterinarioId: 'v', data: DIA });

    expect(livres.map((slot) => emBrasilia(slot.inicio))).toEqual(['09:00', '11:00']);
  });

  it('aceita marcar às 09:00 de Brasília e recusa às 06:00 (que era o que o servidor oferecia)', async () => {
    const as = (hora: number) => ({ inicio: instanteDoRelogio(2027, 10, 8, hora * 60), fim: instanteDoRelogio(2027, 10, 8, hora * 60 + 60) });

    await expect(dentroDaGrade({ tenantId: 't', veterinarioId: 'v', ...as(9) })).resolves.toBe(true);
    await expect(dentroDaGrade({ tenantId: 't', veterinarioId: 'v', ...as(11) })).resolves.toBe(true);
    await expect(dentroDaGrade({ tenantId: 't', veterinarioId: 'v', ...as(6) })).resolves.toBe(false);
    await expect(dentroDaGrade({ tenantId: 't', veterinarioId: 'v', ...as(12) })).resolves.toBe(false);
  });

  it('22:00 de quinta em Brasília é quinta, embora em UTC já seja sexta', async () => {
    const inicio = instanteDoRelogio(2027, 10, 7, 22 * 60);
    expect(inicio.toISOString()).toBe('2027-10-08T01:00:00.000Z');

    await dentroDaGrade({ tenantId: 't', veterinarioId: 'v', inicio, fim: new Date(inicio.getTime() + 3600000) });

    expect(banco.agendaDisponivel.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ dia_semana: 4 }) }));
  });
});

describe('relógio de parede', () => {
  beforeEach(() => { delete process.env.TZ_EXIBICAO; });

  it('lê o relógio do Brasil num instante', () => {
    expect(relogioDeParede('2026-10-09T01:30:00.000Z')).toEqual({ ano: 2026, mes: 10, dia: 8, diaDaSemana: 4, minutos: 22 * 60 + 30 });
  });

  it('dia pedido: só a data é o próprio dia; instante com hora é o dia do Brasil', () => {
    expect(diaPedido('2026-10-09')).toEqual({ ano: 2026, mes: 10, dia: 9, diaDaSemana: 5 });
    expect(diaPedido('2026-10-09T00:00:00.000Z')).toEqual({ ano: 2026, mes: 10, dia: 9, diaDaSemana: 5 });
    expect(diaPedido('2026-10-09T01:30:00.000Z')).toEqual({ ano: 2026, mes: 10, dia: 8, diaDaSemana: 4 });
  });

  it('"hoje" e "este mês" começam à meia-noite de Brasília', () => {
    // 22:30 de 30/09 em Brasília: em UTC já é 01/10.
    const instante = '2026-10-01T01:30:00.000Z';
    expect(inicioDoDiaBr(instante).toISOString()).toBe('2026-09-30T03:00:00.000Z');
    expect(inicioDoMesBr(instante).toISOString()).toBe('2026-09-01T03:00:00.000Z');
    expect(inicioDoMesBr(instante, -1).toISOString()).toBe('2026-08-01T03:00:00.000Z');
    expect(inicioDoMesBr('2026-01-15T12:00:00.000Z', -1).toISOString()).toBe('2025-12-01T03:00:00.000Z');
  });

  it('vale para fuso com horário de verão', () => {
    // Nova York: verão (UTC-4) em julho, inverno (UTC-5) em janeiro.
    expect(instanteDoRelogio(2026, 7, 1, 9 * 60, 'America/New_York').toISOString()).toBe('2026-07-01T13:00:00.000Z');
    expect(instanteDoRelogio(2026, 1, 15, 9 * 60, 'America/New_York').toISOString()).toBe('2026-01-15T14:00:00.000Z');
  });
});
