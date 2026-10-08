const prisma = require('../../../src/config/database');

jest.mock('../../../src/services/pdf.service', () => ({
  gerarReceitaPdf: jest.fn().mockResolvedValue({ cdnUrl: 'https://r2/receita.pdf' }),
  gerarProntuarioPdf: jest.fn().mockResolvedValue({ cdnUrl: 'https://r2/prontuario.pdf' })
}));

const pdfService = require('../../../src/services/pdf.service');
const service = require('../../../src/services/pdf-reemissao.service');
const worker = require('../../../src/services/pdf-reemissao.worker');

function atendimento(extra = {}) {
  return {
    id: 'atend-1',
    receita: '1. Dipirona — 1 comp 12/12h',
    receita_versao: 1,
    receita_pdf_url: null,
    prontuario_pdf_url: null,
    finalizado_em: new Date('2026-08-19T12:00:00Z'),
    criado_em: new Date('2026-08-19T10:00:00Z'),
    pet: { nome: 'Rex', tipo: 'cachorro' },
    tutor: { nome: 'Maria' },
    veterinario: { crmv: 'SP-1', usuario: { nome: 'Dra. Ana' } },
    prontuario: {
      id: 'pront-1',
      queixa_principal: 'Febre',
      hipotese_diagnostica: 'Infecção',
      itensPrescricao: [{ medicamento: 'Dipirona', posologia: '1 comp 12/12h' }],
      examesSolicitados: []
    },
    ...extra
  };
}

describe('Reemissão de documentos', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.solicitacao.findMany.mockResolvedValue([]);
    prisma.solicitacao.update.mockResolvedValue({});
    prisma.prontuarioEletronico.update.mockResolvedValue({});
  });

  it('procura só atendimento fechado, com prontuário e documento faltando, dentro da janela', async () => {
    await service.pendentesDeReemissao();

    const where = prisma.solicitacao.findMany.mock.calls[0][0].where;
    expect(where.status.in).toEqual(expect.arrayContaining(['finalizado', 'concluido']));
    expect(where.OR).toEqual([{ receita_pdf_url: null }, { prontuario_pdf_url: null }]);
    // Sem prontuário não há o que reemitir — nada é inventado.
    expect(where.prontuario).toEqual({ isNot: null });

    const diasDaJanela = (Date.now() - where.finalizado_em.gte.getTime()) / 86400000;
    expect(diasDaJanela).toBeCloseTo(service.JANELA_DIAS, 1);
  });

  it('reemite os dois documentos quando ambos faltam e grava as URLs', async () => {
    const feito = await service.reemitirDocumentos(atendimento());

    expect(feito).toEqual({ receita: true, prontuario: true });
    const dados = prisma.solicitacao.update.mock.calls[0][0].data;
    expect(dados.receita_pdf_url).toBe('https://r2/receita.pdf');
    expect(dados.prontuario_pdf_url).toBe('https://r2/prontuario.pdf');
    // O prontuário guarda a própria URL também.
    expect(prisma.prontuarioEletronico.update).toHaveBeenCalled();
  });

  it('reemite só o que falta — documento existente não é regerado', async () => {
    const feito = await service.reemitirDocumentos(atendimento({ receita_pdf_url: 'https://r2/ja-existe.pdf' }));

    expect(feito).toEqual({ receita: false, prontuario: true });
    expect(pdfService.gerarReceitaPdf).not.toHaveBeenCalled();
    expect(pdfService.gerarProntuarioPdf).toHaveBeenCalled();
  });

  it('preserva a versão da receita retificada ao reemitir', async () => {
    await service.reemitirDocumentos(atendimento({ receita_versao: 3 }));

    expect(pdfService.gerarReceitaPdf.mock.calls[0][0].versao).toBe(3);
  });

  it('um atendimento com falha não interrompe o ciclo dos outros', async () => {
    prisma.solicitacao.findMany.mockResolvedValue([atendimento(), atendimento({ id: 'atend-2' })]);
    pdfService.gerarReceitaPdf.mockRejectedValueOnce(new Error('R2 fora do ar'));
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    const { pendentes, reemitidos, falhas } = await worker.processarReemissoes();

    expect(pendentes).toBe(2);
    expect(reemitidos).toBe(1);
    expect(falhas).toBe(1);
  });
});

export {};
