/**
 * Entrar de plantão, e até onde o chamado alcança.
 *
 * A regra do produto exige aprovação E configuração para ficar disponível, e só
 * a aprovação era conferida: um veterinário aprovado entrava na fila sem dados
 * bancários, aceitava um atendimento, e a plataforma descobria depois que não
 * tinha para onde mandar o repasse.
 */

const controller = require('../../../src/controllers/veterinario.controller');
const VeterinarioController = controller.constructor;

const completo = {
  aprovado_admin: true,
  dados_bancarios: 'cifrado',
  especialidade: 'Clínica geral'
};

describe('Pendências para entrar de plantão', () => {
  it('quem está completo não tem pendência', () => {
    expect(VeterinarioController.pendenciasParaPlantao(completo)).toEqual([]);
  });

  it('sem dados bancários, aponta onde resolver', () => {
    const pendencias = VeterinarioController.pendenciasParaPlantao({
      ...completo, dados_bancarios: null
    });

    expect(pendencias).toHaveLength(1);
    expect(pendencias[0].campo).toBe('dados_bancarios');
    // A tela precisa dizer o que fazer, não só que não pode.
    expect(pendencias[0].onde).toBe('/veterinario/conta-bancaria');
  });

  it('sem especialidade, aponta o perfil', () => {
    const pendencias = VeterinarioController.pendenciasParaPlantao({
      ...completo, especialidade: null
    });

    expect(pendencias[0].campo).toBe('especialidade');
    expect(pendencias[0].onde).toBe('/veterinario/perfil');
  });

  it('cadastro em análise aparece como pendência, sem link — não há o que fazer', () => {
    const pendencias = VeterinarioController.pendenciasParaPlantao({
      ...completo, aprovado_admin: false
    });

    expect(pendencias[0].campo).toBe('aprovacao');
    expect(pendencias[0].onde).toBeNull();
  });

  it('acumula todas as pendências de uma vez, em vez de uma por tentativa', () => {
    const pendencias = VeterinarioController.pendenciasParaPlantao({
      aprovado_admin: false, dados_bancarios: null, especialidade: null
    });

    expect(pendencias).toHaveLength(3);
  });
});
