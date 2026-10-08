/**
 * O servidor roda em UTC e escreve datas para brasileiro ler.
 *
 * Instante vai no fuso do Brasil; dia de calendário (vacina, retorno, lembrete)
 * é o dia que está escrito. Misturar os dois foi o que pôs a vacina de 08/10
 * como 07/10 nas telas e dataria do dia seguinte a receita emitida à noite.
 */
import { dataBr, dataHoraBr, diaDeCalendarioBr } from '../../../src/utils/datas';

describe('datas para exibição', () => {
  const fusoOriginal = process.env.TZ_EXIBICAO;
  afterEach(() => { if (fusoOriginal === undefined) delete process.env.TZ_EXIBICAO; else process.env.TZ_EXIBICAO = fusoOriginal; });

  it('receita emitida às 22h de Brasília leva a data do Brasil, não a de UTC', () => {
    // 22:30 de 08/10 em Brasília = 01:30 de 09/10 em UTC.
    expect(dataBr('2026-10-09T01:30:00.000Z')).toBe('08/10/2026');
    expect(dataHoraBr('2026-10-09T01:30:00.000Z')).toBe('08/10/2026, 22:30');
  });

  it('dia de calendário não recua: a vacina de 08/10 é de 08/10', () => {
    expect(diaDeCalendarioBr('2026-10-08T00:00:00.000Z')).toBe('08/10/2026');
    expect(diaDeCalendarioBr(new Date('2027-10-08T00:00:00.000Z'))).toBe('08/10/2027');
    // O mesmo valor tratado como instante cairia no dia anterior: é por isso
    // que existem duas funções.
    expect(dataBr('2026-10-08T00:00:00.000Z')).toBe('07/10/2026');
  });

  it('o fuso de exibição pode ser trocado por ambiente', () => {
    process.env.TZ_EXIBICAO = 'America/Manaus';
    expect(dataHoraBr('2026-10-09T01:30:00.000Z')).toBe('08/10/2026, 21:30');
  });
});
