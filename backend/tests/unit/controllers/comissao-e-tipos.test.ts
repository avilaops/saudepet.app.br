/**
 * A comissão saindo do código, e os seis tipos de atendimento.
 *
 * O percentual era constante (15%) enquanto o plano do produto diz 20 — cinco
 * pontos sobre todo o faturamento decididos por uma linha. Agora vem da cidade
 * do atendimento, com 20 como padrão.
 */

const { createSolicitacaoSchema } = require('../../../src/schemas/solicitacao.schema');

describe('Tipos de atendimento', () => {
  const base = {
    pet_id: '11111111-2222-4333-8444-555555555555',
    localizacao_cliente: 'Rua Exemplo, 100',
    latitude: -20.81,
    longitude: -49.37
  };

  it('aceita os seis tipos do plano', () => {
    for (const tipo of [
      'emergencia', 'consulta_domiciliar', 'teleorientacao',
      'vacinacao', 'avaliacao', 'consulta_rotina'
    ]) {
      const resultado = createSolicitacaoSchema.safeParse({ ...base, tipo_atendimento: tipo });
      expect(resultado.success).toBe(true);
    }
  });

  it('continua recusando tipo inventado', () => {
    const resultado = createSolicitacaoSchema.safeParse({ ...base, tipo_atendimento: 'banho_e_tosa' });
    expect(resultado.success).toBe(false);
  });
});

describe('Prazos por tipo', () => {
  const sla = require('../../../src/services/sla-atendimento.worker');
  const busca = require('../../../src/services/busca-sem-resposta.service');

  it('preventivo não dispara alerta de equipe no prazo de emergência', () => {
    expect(sla.MINUTOS_SLA.emergencia).toBe(10);
    expect(sla.MINUTOS_SLA.vacinacao).toBeGreaterThan(sla.MINUTOS_SLA.consulta_domiciliar);
    expect(sla.MINUTOS_SLA.consulta_rotina).toBeGreaterThan(sla.MINUTOS_SLA.consulta_domiciliar);
  });

  it('a busca desiste mais tarde no preventivo do que na emergência', () => {
    expect(busca.MINUTOS_ATE_DESISTIR.emergencia).toBe(20);
    expect(busca.MINUTOS_ATE_DESISTIR.vacinacao).toBeGreaterThan(60);
    expect(busca.MINUTOS_ATE_DESISTIR.avaliacao).toBeGreaterThan(busca.MINUTOS_ATE_DESISTIR.teleorientacao);
  });

  it('todo tipo do enum tem prazo definido nos dois vigias', () => {
    const tipos = ['emergencia', 'consulta_domiciliar', 'teleorientacao', 'vacinacao', 'avaliacao', 'consulta_rotina'];
    for (const tipo of tipos) {
      expect(sla.MINUTOS_SLA[tipo]).toBeGreaterThan(0);
      expect(busca.MINUTOS_ATE_DESISTIR[tipo]).toBeGreaterThan(0);
    }
  });
});
