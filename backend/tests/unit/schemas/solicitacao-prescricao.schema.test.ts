const { updatePrescriptionSchema } = require('../../../src/schemas/solicitacao.schema');

const MOTIVO = 'Dose informada em miligramas quando o correto é mililitros';

describe('updatePrescriptionSchema', () => {
  it('aceita uma prescrição textual válida acompanhada do motivo', () => {
    const result = updatePrescriptionSchema.safeParse({
      receita: 'Administrar conforme orientação profissional.',
      motivo: MOTIVO
    });
    expect(result.success).toBe(true);
  });

  it('exige motivo: corrigir receita fechada reemite o documento do tutor', () => {
    // Sem motivo o PDF novo sairia sem explicar por que a via anterior não
    // vale mais — e o tutor ficaria com dois documentos conflitantes.
    const semMotivo = updatePrescriptionSchema.safeParse({ receita: 'Nova orientação clínica.' });
    expect(semMotivo.success).toBe(false);

    const motivoRaso = updatePrescriptionSchema.safeParse({ receita: 'Nova orientação.', motivo: 'erro' });
    expect(motivoRaso.success).toBe(false);
  });

  it('rejeita prescrição vazia ou excessivamente longa', () => {
    expect(updatePrescriptionSchema.safeParse({ receita: '  ', motivo: MOTIVO }).success).toBe(false);
    expect(updatePrescriptionSchema.safeParse({ receita: 'x'.repeat(5001), motivo: MOTIVO }).success).toBe(false);
  });

  it('exige que venha algo a corrigir — motivo sozinho não retifica nada', () => {
    expect(updatePrescriptionSchema.safeParse({ motivo: MOTIVO }).success).toBe(false);
  });

  it('aceita itens estruturados no lugar do texto livre', () => {
    const result = updatePrescriptionSchema.safeParse({
      motivo: MOTIVO,
      prescricoes: [
        { medicamento: 'Dipirona', concentracao: '500mg/ml', posologia: '1 ml a cada 12h', duracao_dias: 5 }
      ]
    });
    expect(result.success).toBe(true);
    expect(result.data.prescricoes[0].duracao_dias).toBe(5);
  });

  it('recusa item de prescrição sem medicamento ou sem posologia', () => {
    expect(updatePrescriptionSchema.safeParse({
      motivo: MOTIVO,
      prescricoes: [{ medicamento: '', posologia: '1 ml' }]
    }).success).toBe(false);

    expect(updatePrescriptionSchema.safeParse({
      motivo: MOTIVO,
      prescricoes: [{ medicamento: 'Dipirona', posologia: '' }]
    }).success).toBe(false);
  });
});

export {};
