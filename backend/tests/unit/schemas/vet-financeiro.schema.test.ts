const { contaBancariaSchema, criarCobrancaSchema } = require('../../../src/schemas/vet-financeiro.schema');

const contaValida = {
  tipoChavePix: 'CPF',
  chavePix: '123.456.789-00',
  banco: '1',
  agencia: '0001',
  conta: '12345-6',
  tipoConta: 'corrente'
};

describe('contaBancariaSchema', () => {
  it('aceita uma conta completa e normaliza o código do banco para 3 dígitos', () => {
    const result = contaBancariaSchema.safeParse(contaValida);
    expect(result.success).toBe(true);
    expect(result.data.banco).toBe('001');
  });

  it('assume conta corrente quando o tipo não é informado', () => {
    const { tipoConta, ...semTipo } = contaValida;
    const result = contaBancariaSchema.safeParse(semTipo);
    expect(result.success).toBe(true);
    expect(result.data.tipoConta).toBe('corrente');
  });

  it('rejeita chave que não corresponde ao tipo declarado', () => {
    // 11 dígitos passariam como CPF, mas não como e-mail
    expect(contaBancariaSchema.safeParse({ ...contaValida, tipoChavePix: 'EMAIL' }).success).toBe(false);
    expect(contaBancariaSchema.safeParse({ ...contaValida, tipoChavePix: 'CNPJ' }).success).toBe(false);
    expect(contaBancariaSchema.safeParse({ ...contaValida, tipoChavePix: 'RANDOM' }).success).toBe(false);
  });

  it('aceita cada tipo de chave no formato correspondente', () => {
    const casos = [
      ['CPF', '12345678900'],
      ['CNPJ', '12.345.678/0001-90'],
      ['EMAIL', 'vet@saudepet.app.br'],
      ['PHONE', '+55 41 98775-2756'],
      ['RANDOM', '8f14e45f-ceea-467a-9a1b-0f1c2d3e4a5b']
    ];

    casos.forEach(([tipoChavePix, chavePix]) => {
      const result = contaBancariaSchema.safeParse({ ...contaValida, tipoChavePix, chavePix });
      expect([tipoChavePix, result.success]).toEqual([tipoChavePix, true]);
    });
  });

  it('rejeita agência e conta em formato inválido', () => {
    expect(contaBancariaSchema.safeParse({ ...contaValida, agencia: 'abc' }).success).toBe(false);
    expect(contaBancariaSchema.safeParse({ ...contaValida, conta: '' }).success).toBe(false);
    expect(contaBancariaSchema.safeParse({ ...contaValida, banco: '1234' }).success).toBe(false);
  });

  it('rejeita CPF/CNPJ de titular com contagem de dígitos inválida', () => {
    expect(contaBancariaSchema.safeParse({ ...contaValida, cpfCnpjTitular: '123' }).success).toBe(false);
    expect(contaBancariaSchema.safeParse({ ...contaValida, cpfCnpjTitular: '123.456.789-00' }).success).toBe(true);
  });
});

describe('criarCobrancaSchema', () => {
  const atendimentoId = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

  it('aceita uma cobrança válida e assume PIX como método', () => {
    const result = criarCobrancaSchema.safeParse({ atendimentoId, valor: 180.5 });
    expect(result.success).toBe(true);
    expect(result.data.metodo).toBe('PIX');
  });

  it('converte valor enviado como string pelo formulário', () => {
    const result = criarCobrancaSchema.safeParse({ atendimentoId, valor: '180.50' });
    expect(result.success).toBe(true);
    expect(result.data.valor).toBe(180.5);
  });

  it('rejeita valores não positivos ou acima do teto', () => {
    expect(criarCobrancaSchema.safeParse({ atendimentoId, valor: 0 }).success).toBe(false);
    expect(criarCobrancaSchema.safeParse({ atendimentoId, valor: -10 }).success).toBe(false);
    expect(criarCobrancaSchema.safeParse({ atendimentoId, valor: 50001 }).success).toBe(false);
  });

  it('exige um atendimento identificado por UUID', () => {
    expect(criarCobrancaSchema.safeParse({ valor: 100 }).success).toBe(false);
    expect(criarCobrancaSchema.safeParse({ atendimentoId: 'atendimento-1', valor: 100 }).success).toBe(false);
  });

  it('rejeita método de pagamento que o veterinário não pode iniciar sozinho', () => {
    expect(criarCobrancaSchema.safeParse({ atendimentoId, valor: 100, metodo: 'CREDIT_CARD' }).success).toBe(false);
  });
});

export {};
