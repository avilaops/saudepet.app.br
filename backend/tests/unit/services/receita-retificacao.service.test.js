const prisma = require('../../../src/config/database');

jest.mock('../../../src/services/pdf.service', () => ({
  gerarReceitaPdf: jest.fn().mockResolvedValue({ cdnUrl: 'https://r2/receita_v2.pdf', key: 'receitas/v2.pdf' })
}));
jest.mock('../../../src/services/push.service', () => ({ enviarParaUsuario: jest.fn() }));
jest.mock('../../../src/services/email.service', () => ({ sendMail: jest.fn().mockResolvedValue({}) }));

const pdfService = require('../../../src/services/pdf.service');
const emailService = require('../../../src/services/email.service');
const service = require('../../../src/services/receita-retificacao.service');

const VETERINARIO = { id: 'vet-1', crmv: 'SP-1234', usuario: { nome: 'Dra. Ana' } };

function atendimento(extra = {}) {
  return {
    id: 'atend-1',
    tenant_id: 'tenant-1',
    tutor_id: 'tutor-1',
    veterinario_id: 'vet-1',
    receita: '1. Dipirona 500mg — 1 comp a cada 12h',
    receita_versao: 1,
    receita_pdf_url: 'https://r2/receita_v1.pdf',
    pet: { nome: 'Rex', tipo: 'cachorro' },
    tutor: { id: 'tutor-1', nome: 'Maria', email: 'maria@exemplo.com' },
    prontuario: { id: 'pront-1', itensPrescricao: [{ medicamento: 'Dipirona', posologia: '1 comp 12/12h' }] },
    ...extra
  };
}

describe('Retificação de receita', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.solicitacao.findFirst.mockResolvedValue(atendimento());
    prisma.receitaRetificacao.create.mockResolvedValue({});
    prisma.prescricaoItem.deleteMany.mockResolvedValue({});
    prisma.prescricaoItem.createMany.mockResolvedValue({});
    prisma.solicitacao.update.mockResolvedValue({
      id: 'atend-1', receita: 'nova', receita_pdf_url: 'https://r2/receita_v2.pdf', receita_versao: 2
    });
  });

  it('exige motivo com substância — ele vai impresso no documento do tutor', async () => {
    await expect(service.retificarReceita({
      atendimentoId: 'atend-1', tenantId: 'tenant-1', veterinario: VETERINARIO, motivo: 'erro', receitaTexto: 'x'
    })).rejects.toThrow(/pelo menos 10 caracteres/i);

    expect(pdfService.gerarReceitaPdf).not.toHaveBeenCalled();
  });

  it('reemite o PDF marcado como versão 2, com o motivo', async () => {
    await service.retificarReceita({
      atendimentoId: 'atend-1',
      tenantId: 'tenant-1',
      veterinario: VETERINARIO,
      motivo: 'Dose informada em mg quando o correto é ml',
      receitaTexto: 'Dipirona 500mg/ml — 1 ml a cada 12h'
    });

    const argumentos = pdfService.gerarReceitaPdf.mock.calls[0][0];
    expect(argumentos.versao).toBe(2);
    expect(argumentos.motivoRetificacao).toMatch(/mg quando o correto/);
    expect(argumentos.protocolo).toMatch(/-V2$/);
  });

  it('guarda a versão anterior inteira antes de sobrescrever', async () => {
    await service.retificarReceita({
      atendimentoId: 'atend-1',
      tenantId: 'tenant-1',
      veterinario: VETERINARIO,
      motivo: 'Correção de posologia informada pelo tutor',
      receitaTexto: 'nova receita'
    });

    const registro = prisma.receitaRetificacao.create.mock.calls[0][0].data;
    expect(registro.versao).toBe(2);
    expect(registro.receita_anterior).toMatch(/Dipirona 500mg/);
    expect(registro.pdf_anterior_url).toBe('https://r2/receita_v1.pdf');
    expect(registro.pdf_novo_url).toBe('https://r2/receita_v2.pdf');
    expect(registro.motivo).toMatch(/Correção de posologia/);
  });

  it('avisa o tutor: a via em mãos deixou de valer', async () => {
    await service.retificarReceita({
      atendimentoId: 'atend-1',
      tenantId: 'tenant-1',
      veterinario: VETERINARIO,
      motivo: 'Medicamento trocado após revisão do caso',
      receitaTexto: 'nova receita'
    });

    expect(emailService.sendMail).toHaveBeenCalled();
    const email = emailService.sendMail.mock.calls[0][0];
    expect(email.to).toBe('maria@exemplo.com');
    expect(email.html).toMatch(/não deve mais ser usada/i);
  });

  it('troca os itens estruturados quando vêm novos', async () => {
    await service.retificarReceita({
      atendimentoId: 'atend-1',
      tenantId: 'tenant-1',
      veterinario: VETERINARIO,
      motivo: 'Ajuste de concentração do medicamento',
      prescricoes: [{ medicamento: 'Dipirona', concentracao: '500mg/ml', posologia: '1 ml 12/12h', duracao_dias: 5 }]
    });

    expect(prisma.prescricaoItem.deleteMany).toHaveBeenCalledWith({ where: { prontuario_id: 'pront-1' } });
    const criados = prisma.prescricaoItem.createMany.mock.calls[0][0].data;
    expect(criados[0].forma_farmaceutica).toBeNull();
    expect(criados[0].concentracao).toBe('500mg/ml');
  });

  it('retificar só o texto não apaga a prescrição estruturada do prontuário', async () => {
    await service.retificarReceita({
      atendimentoId: 'atend-1',
      tenantId: 'tenant-1',
      veterinario: VETERINARIO,
      motivo: 'Complemento de orientação ao tutor',
      receitaTexto: 'texto novo'
    });

    expect(prisma.prescricaoItem.deleteMany).not.toHaveBeenCalled();
  });

  it('só o veterinário do atendimento pode retificar', async () => {
    prisma.solicitacao.findFirst.mockResolvedValue(atendimento({ veterinario_id: 'outro-vet' }));

    await expect(service.retificarReceita({
      atendimentoId: 'atend-1',
      tenantId: 'tenant-1',
      veterinario: VETERINARIO,
      motivo: 'Tentativa de alteração indevida do documento',
      receitaTexto: 'x'
    })).rejects.toThrow(/conduziu o atendimento/i);
  });

  it('falha do R2 não grava retificação pela metade', async () => {
    pdfService.gerarReceitaPdf.mockRejectedValueOnce(new Error('R2 fora do ar'));

    await expect(service.retificarReceita({
      atendimentoId: 'atend-1',
      tenantId: 'tenant-1',
      veterinario: VETERINARIO,
      motivo: 'Correção de dose do anti-inflamatório',
      receitaTexto: 'nova'
    })).rejects.toThrow(/R2 fora do ar/);

    expect(prisma.receitaRetificacao.create).not.toHaveBeenCalled();
    expect(prisma.solicitacao.update).not.toHaveBeenCalled();
  });
});
