const { finalizarAtendimentoSchema } = require('../../../src/schemas/prontuario.schema');

const registroEstruturado = {
  queixa_principal: 'Tosse persistente há dois dias.',
  exame_fisico: 'Mucosas normocoradas.',
  hipotese_diagnostica: 'Traqueobronquite infecciosa',
  orientacoes_tutor: 'Repouso e hidratação.',
  prescricoes: [
    { medicamento: 'Amoxicilina', concentracao: '500mg', forma_farmaceutica: 'comprimido', posologia: '1 comp a cada 12h', duracao_dias: 7 }
  ],
  exames: [
    { nome_exame: 'Hemograma completo', justificativa: 'Confirmar componente bacteriano' }
  ]
};

describe('finalizarAtendimentoSchema', () => {
  it('aceita o prontuário estruturado completo', () => {
    const resultado = finalizarAtendimentoSchema.safeParse(registroEstruturado);
    expect(resultado.success).toBe(true);
    expect(resultado.data.prescricoes[0].duracao_dias).toBe(7);
    expect(resultado.data.exames).toHaveLength(1);
  });

  it('assume listas vazias quando o veterinário não prescreve nada', () => {
    const { prescricoes, exames, ...semListas } = registroEstruturado;
    const resultado = finalizarAtendimentoSchema.safeParse(semListas);
    expect(resultado.success).toBe(true);
    expect(resultado.data.prescricoes).toEqual([]);
    expect(resultado.data.exames).toEqual([]);
  });

  it('exige hipótese diagnóstica para encerrar o atendimento', () => {
    const resultado = finalizarAtendimentoSchema.safeParse({ orientacoes_tutor: 'Repouso.' });
    expect(resultado.success).toBe(false);
    expect(resultado.error.issues.some((erro) => erro.message.includes('hipótese diagnóstica'))).toBe(true);
  });

  // A tela de plantão continua mandando o formato antigo; ele não pode quebrar.
  it('normaliza o formato antigo da tela de plantão', () => {
    const resultado = finalizarAtendimentoSchema.safeParse({
      diagnostico: 'Otite externa alérgica',
      receita: 'Otodem Plus - 4 gotas a cada 12h',
      observacoes: 'Evitar banho por 5 dias.'
    });

    expect(resultado.success).toBe(true);
    expect(resultado.data.hipotese_diagnostica).toBe('Otite externa alérgica');
    expect(resultado.data.diagnostico_definitivo).toBe('Otite externa alérgica');
    expect(resultado.data.orientacoes_tutor).toBe('Evitar banho por 5 dias.');
    expect(resultado.data.receita).toContain('Otodem');
  });

  it('não deixa o campo estruturado ser sobrescrito pelo legado', () => {
    const resultado = finalizarAtendimentoSchema.safeParse({
      ...registroEstruturado,
      diagnostico: 'Valor antigo',
      observacoes: 'Observação antiga'
    });

    expect(resultado.success).toBe(true);
    expect(resultado.data.hipotese_diagnostica).toBe('Traqueobronquite infecciosa');
    expect(resultado.data.orientacoes_tutor).toBe('Repouso e hidratação.');
  });

  it('rejeita item de prescrição sem posologia', () => {
    const resultado = finalizarAtendimentoSchema.safeParse({
      ...registroEstruturado,
      prescricoes: [{ medicamento: 'Amoxicilina' }]
    });

    expect(resultado.success).toBe(false);
  });

  it('rejeita duração de tratamento negativa ou fora do limite', () => {
    const comDuracao = (duracao_dias) => finalizarAtendimentoSchema.safeParse({
      ...registroEstruturado,
      prescricoes: [{ ...registroEstruturado.prescricoes[0], duracao_dias }]
    }).success;

    expect(comDuracao(-1)).toBe(false);
    expect(comDuracao(0)).toBe(false);
    expect(comDuracao(400)).toBe(false);
    expect(comDuracao(30)).toBe(true);
  });

  it('converte a data de retorno enviada como texto', () => {
    const resultado = finalizarAtendimentoSchema.safeParse({
      ...registroEstruturado,
      retorno_sugerido_em: '2026-09-01'
    });

    expect(resultado.success).toBe(true);
    expect(resultado.data.retorno_sugerido_em).toBeInstanceOf(Date);
  });
});
