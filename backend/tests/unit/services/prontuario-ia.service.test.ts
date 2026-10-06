/**
 * O que a IA devolve precisa caber no formulário do prontuário.
 *
 * O `prontuario-ia.service` já existia pronto e em produção desde antes de
 * 01/09/2026, com a chave da OpenAI configurada, e **nenhuma tela o chamava**.
 * Ao ligar a tela, o contrato do retorno passou a importar de verdade: se um
 * campo mudar de nome ou de tipo aqui, o prontuário do veterinário passa a
 * chegar vazio sem ninguém perceber.
 *
 * A chamada à OpenAI não entra no teste: o que se protege é o formato do que
 * sai, inclusive no caminho de degradação, que é o que roda quando a chave
 * falta ou a API cai.
 */
import { ProntuarioIaService } from '../../../src/services/prontuario-ia.service';

const RELATO = [
  'Cadela Mel, cinco anos, veio com vômito há dois dias e apatia.',
  'Mucosas normocoradas, temperatura trinta e nove e dois, abdômen doloroso à palpação.',
  'Hipótese de gastrite aguda.',
  'Prescrevo Cerenia dezesseis miligramas, um comprimido a cada vinte e quatro horas por quatro dias.',
  'Pedir hemograma completo para descartar infecção.',
  'Ela tem alergia a dipirona, moderada.',
  'Orientar jejum de oito horas e água à vontade. Retorno em cinco dias.'
].join(' ');

describe('estruturação do prontuário ditado', () => {
  const chaveOriginal = process.env.OPENAI_API_KEY;

  beforeAll(() => {
    // Sem chave, o serviço cai no parser local. É o caminho que precisa
    // continuar devolvendo a mesma FORMA, senão a tela quebra justamente
    // quando a OpenAI está fora do ar.
    delete process.env.OPENAI_API_KEY;
  });

  afterAll(() => {
    if (chaveOriginal) process.env.OPENAI_API_KEY = chaveOriginal;
  });

  it('devolve todos os campos que o formulário do prontuário preenche', async () => {
    const saida = await ProntuarioIaService.parseTextoVoz(RELATO);

    // Os nomes abaixo são lidos um a um pela tela. Renomear qualquer um deles
    // sem mexer no formulário faz o campo chegar vazio, em silêncio.
    expect(saida).toHaveProperty('queixa_principal');
    expect(saida).toHaveProperty('exame_fisico');
    expect(saida).toHaveProperty('hipotese_diagnostica');
    expect(saida).toHaveProperty('diagnostico_definitivo');
    expect(saida).toHaveProperty('orientacoes_tutor');
    expect(saida).toHaveProperty('retorno_dias');
    expect(Array.isArray(saida.prescricoes)).toBe(true);
    expect(Array.isArray(saida.exames)).toBe(true);
    expect(Array.isArray(saida.alergias)).toBe(true);
  });

  it('a hipótese diagnóstica nunca volta vazia, porque o formulário a exige', async () => {
    const saida = await ProntuarioIaService.parseTextoVoz(RELATO);

    expect(typeof saida.hipotese_diagnostica).toBe('string');
    expect(saida.hipotese_diagnostica.length).toBeGreaterThan(0);
  });

  it('recusa relato vazio em vez de devolver um prontuário em branco', async () => {
    await expect(ProntuarioIaService.parseTextoVoz('')).rejects.toThrow();
    await expect(ProntuarioIaService.parseTextoVoz('   ')).rejects.toThrow();
  });

  it('sem a chave da OpenAI ainda responde, e não estoura', async () => {
    const saida = await ProntuarioIaService.parseTextoVoz('Gato Tom com espirros há três dias.');

    expect(saida).toBeTruthy();
    expect(typeof saida.hipotese_diagnostica).toBe('string');
  });

  it('cada prescrição sai com os campos que a receita imprime', async () => {
    const saida = await ProntuarioIaService.parseTextoVoz(RELATO);

    for (const item of saida.prescricoes) {
      expect(item).toHaveProperty('medicamento');
      expect(item).toHaveProperty('posologia');
    }
  });
});
