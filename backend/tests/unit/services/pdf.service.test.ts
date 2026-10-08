// O R2 não é alcançável nos testes: capturamos o buffer que seria enviado.
const enviados = [];

jest.mock('../../../src/config/r2', () => ({
  uploadBuffer: jest.fn(async (buffer, key) => {
    enviados.push({ buffer, key });
    return `https://cdn.exemplo/${key}`;
  })
}));

const pdfService = require('../../../src/services/pdf.service');

const paciente = {
  protocolo: 'ABC12345',
  nomeTutor: 'Maria Silva',
  nomePet: 'Rex',
  especiePet: 'Canina',
  racaPet: 'SRD',
  pesoPet: 29,
  nomeVet: 'João Santos',
  crmvVet: '12345',
  ufCrmv: 'SP',
  dataAtendimento: '15/08/2026'
};

const ehPdf = (buffer) => buffer.slice(0, 4).toString() === '%PDF';

describe('pdf.service', () => {
  beforeEach(() => { enviados.length = 0; });

  it('gera o prontuário com o conteúdo clínico do atendimento', async () => {
    const resultado = await pdfService.gerarProntuarioPdf({
      ...paciente,
      anamnese: 'Tosse persistente há dois dias.',
      exameFisico: 'Mucosas normocoradas, ausculta com ruído brônquico.',
      hipotesesDiagnosticas: 'Traqueobronquite infecciosa canina',
      conduta: 'Amoxicilina 500mg a cada 12h por 7 dias.',
      exames: [{ nome_exame: 'Hemograma completo', justificativa: 'Confirmar componente bacteriano' }],
      retornoSugerido: '01/09/2026'
    });

    expect(resultado.cdnUrl).toContain('prontuarios/prontuario_ABC12345.pdf');
    expect(enviados).toHaveLength(1);
    expect(ehPdf(enviados[0].buffer)).toBe(true);
  });

  // Cada bloco mede a própria altura e quebra a página quando precisa; com texto
  // longo o layout antigo escrevia uma seção por cima da outra.
  it('não quebra com texto clínico longo', async () => {
    const textoLongo = 'Paciente apresenta quadro arrastado. '.repeat(120);

    const resultado = await pdfService.gerarProntuarioPdf({
      ...paciente,
      anamnese: textoLongo,
      exameFisico: textoLongo,
      hipotesesDiagnosticas: textoLongo,
      conduta: textoLongo
    });

    expect(ehPdf(enviados[0].buffer)).toBe(true);
    expect(resultado.cdnUrl).toBeTruthy();
  });

  it('gera a receita com a lista de medicamentos prescritos', async () => {
    const resultado = await pdfService.gerarReceitaPdf({
      ...paciente,
      medicamentos: [
        { nome: 'AMOXICILINA 500mg', posologia: '1 comprimido a cada 12h. Por 7 dia(s).' },
        { nome: 'MELOXICAM 0,1mg/kg', posologia: '1x ao dia. Por 5 dia(s).' }
      ],
      orientacoes: 'Repouso e hidratação.'
    });

    expect(resultado.cdnUrl).toContain('receitas/receita_ABC12345.pdf');
    expect(ehPdf(enviados[0].buffer)).toBe(true);
  });
});

export {};
