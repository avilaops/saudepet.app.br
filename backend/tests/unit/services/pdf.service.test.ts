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

  // O fechamento do atendimento lia `require('pdf.service').default`, que não
  // existia: em produção nenhum PDF era gerado na hora de fechar.
  it('o módulo entrega a mesma instância por require, por .default e por import', async () => {
    const porImport = (await import('../../../src/services/pdf.service')).default;

    expect(typeof pdfService.gerarReceitaPdf).toBe('function');
    expect(pdfService.default).toBe(pdfService);
    expect(typeof porImport.gerarProntuarioPdf).toBe('function');
  });

  // Logo do consultório no cabeçalho (08/10/2026). O PDF passa a carregar uma
  // imagem; sem logo, ou com arquivo que o pdfkit não lê, o documento sai igual.
  describe('logo do veterinário', () => {
    const sharp = require('sharp');
    const temImagem = (buffer) => buffer.toString('latin1').includes('/Subtype /Image');
    let logo;

    beforeAll(async () => {
      logo = await sharp({ create: { width: 300, height: 100, channels: 4, background: { r: 21, g: 159, b: 163, alpha: 1 } } }).png().toBuffer();
    });

    it('a receita e o prontuário saem com o logo quando ele é informado', async () => {
      await pdfService.gerarReceitaPdf({ ...paciente, medicamentos: [], logoVet: logo });
      await pdfService.gerarProntuarioPdf({ ...paciente, anamnese: 'Tosse.', logoVet: logo });

      expect(enviados).toHaveLength(2);
      expect(temImagem(enviados[0].buffer)).toBe(true);
      expect(temImagem(enviados[1].buffer)).toBe(true);
    });

    it('sem logo, o documento não carrega imagem nenhuma', async () => {
      await pdfService.gerarReceitaPdf({ ...paciente, medicamentos: [] });

      expect(ehPdf(enviados[0].buffer)).toBe(true);
      expect(temImagem(enviados[0].buffer)).toBe(false);
    });

    it('logo corrompido não impede a emissão', async () => {
      jest.spyOn(console, 'warn').mockImplementation(() => {});

      const resultado = await pdfService.gerarReceitaPdf({ ...paciente, medicamentos: [], logoVet: Buffer.from('isto não é um PNG') });

      expect(resultado.cdnUrl).toContain('receitas/receita_ABC12345.pdf');
      expect(ehPdf(enviados[0].buffer)).toBe(true);
      jest.restoreAllMocks();
    });
  });
});

export {};
