// Endereço e coordenada deixaram de ser opcionais na abertura do chamado.
const { createSolicitacaoSchema } = require('../../../src/schemas/solicitacao.schema');

const base = {
  pet_id: '11111111-2222-4333-8444-555555555555',
  tipo_atendimento: 'emergencia',
  localizacao_cliente: 'Rua Vergueiro, 1000 - São Paulo',
  latitude: -23.5613,
  longitude: -46.6565
};

describe('Local do atendimento', () => {
  it('aceita o chamado com o local confirmado', () => {
    expect(createSolicitacaoSchema.safeParse(base).success).toBe(true);
  });

  it('recusa chamado sem coordenada', () => {
    // Sem ponto de partida o despacho por proximidade fica cego e volta a
    // avisar todo mundo de plantão, sem distância.
    const { latitude, longitude, ...semCoordenada } = base;
    const resultado = createSolicitacaoSchema.safeParse(semCoordenada);

    expect(resultado.success).toBe(false);
    expect(JSON.stringify(resultado.error.issues)).toMatch(/mapa/i);
  });

  it('recusa chamado sem endereço escrito', () => {
    const resultado = createSolicitacaoSchema.safeParse({ ...base, localizacao_cliente: '' });
    expect(resultado.success).toBe(false);
  });

  it('aceita a coordenada 0 — é o equador, não ausência de dado', () => {
    expect(createSolicitacaoSchema.safeParse({ ...base, latitude: 0, longitude: 0 }).success).toBe(true);
  });

  it('recusa coordenada fora do planeta', () => {
    expect(createSolicitacaoSchema.safeParse({ ...base, latitude: 120 }).success).toBe(false);
    expect(createSolicitacaoSchema.safeParse({ ...base, longitude: -400 }).success).toBe(false);
  });
});

export {};
