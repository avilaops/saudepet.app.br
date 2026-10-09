/**
 * "Não pode estar no futuro" tem de olhar o relógio na hora da validação.
 *
 * `z.date().max(new Date())` congela o agora quando o servidor sobe. Em
 * 08/10/2026, com o backend no ar havia onze horas, a vacina aplicada no dia
 * foi recusada como "data no futuro" — e a recusa crescia a cada dia sem
 * reinício. O mesmo erro estava na data de nascimento do pet e do usuário.
 */
import { naoEstaNoFuturo } from '../../../src/utils/datas';

const { criarVacinaTutorSchema } = require('../../../src/schemas/pet-ficha-tutor.schema');

describe('datas que não podem estar no futuro', () => {
  afterEach(() => jest.useRealTimers());

  it('a validação acompanha o relógio: o que era futuro ontem é válido hoje', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-08T17:00:00.000Z'));
    // O schema já foi carregado (e, no código antigo, já tinha congelado o agora).
    const amanha = { nome_vacina: 'Antirrábica', data_aplicacao: '2026-10-09' };
    expect(criarVacinaTutorSchema.safeParse(amanha).success).toBe(false);

    jest.setSystemTime(new Date('2026-10-09T15:00:00.000Z'));
    expect(criarVacinaTutorSchema.safeParse(amanha).success).toBe(true);
  });

  it('o dia de hoje no Brasil vale inteiro', () => {
    // 01:07 de 09/10 em Brasília (04:07 UTC): a vacina de hoje é de hoje.
    jest.useFakeTimers().setSystemTime(new Date('2026-10-09T04:07:00.000Z'));
    expect(naoEstaNoFuturo(new Date('2026-10-09T00:00:00.000Z'))).toBe(true);
    expect(naoEstaNoFuturo(new Date('2026-10-10T00:00:00.000Z'))).toBe(false);

    // 22:00 de 08/10 em Brasília: em UTC já é dia 9, mas no Brasil ainda é dia 8.
    jest.setSystemTime(new Date('2026-10-09T01:00:00.000Z'));
    expect(naoEstaNoFuturo(new Date('2026-10-08T00:00:00.000Z'))).toBe(true);
    expect(naoEstaNoFuturo(new Date('2026-10-10T00:00:00.000Z'))).toBe(false);
  });

  it('nenhum schema compara com um "agora" calculado na carga do módulo', () => {
    const fs = require('fs');
    const path = require('path');
    const pasta = path.resolve(__dirname, '../../../src/schemas');
    const culpados = fs.readdirSync(pasta)
      .filter((arquivo: string) => arquivo.endsWith('.ts'))
      .filter((arquivo: string) => /\.(max|min)\(\s*new Date\(/.test(fs.readFileSync(path.join(pasta, arquivo), 'utf8')));

    expect(culpados).toEqual([]);
  });
});
