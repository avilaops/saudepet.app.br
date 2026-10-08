// Os seis interruptores de notificação em /admin/sistema gravavam a preferência
// e NADA no sistema os lia: `deveNotificar()` não era chamado por nenhum arquivo
// fora do próprio controller. Ligar ou desligar não mudava nada.
const prisma = require('../../../src/config/database');

jest.mock('../../../src/services/email.service', () => ({
  sendMail: jest.fn().mockResolvedValue(undefined),
  enviarEmailNovoVetAdmin: jest.fn().mockResolvedValue(undefined)
}));

const emailService = require('../../../src/services/email.service');
const notificacaoController = require('../../../src/controllers/notificacao.controller');
const { avisarNovoVeterinario } = require('../../../src/services/notificacao-admin.service');

const emits = [];
const io = { to: (sala) => ({ emit: (evento, dados) => emits.push({ sala, evento, dados }) }) };

const veterinario = { id: 'v1', nome: 'Dra. Ana', email: 'ana@x.com', crmv: 'SP-123', cidade: 'São Paulo' };

const configurar = (valores) =>
  jest.spyOn(notificacaoController, 'deveNotificar').mockResolvedValue(valores);

beforeEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
  emits.length = 0;
  prisma.usuario.findMany.mockResolvedValue([{ email: 'admin@saudepet.app.br' }]);
});

describe('Aviso de novo veterinário', () => {
  it('manda e-mail e popup quando os dois canais estão ligados', async () => {
    configurar({ email: true, popup: true, sms: false });

    await avisarNovoVeterinario({ tenantId: 'tenant-1', veterinario, io });

    expect(emailService.enviarEmailNovoVetAdmin).toHaveBeenCalledWith(
      'admin@saudepet.app.br',
      expect.objectContaining({ nomeVet: 'Dra. Ana', crmvVet: 'SP-123' })
    );
    expect(emits).toContainEqual(expect.objectContaining({ evento: 'novo:veterinario' }));
  });

  it('não manda e-mail quando o admin desligou o canal', async () => {
    configurar({ email: false, popup: true, sms: false });

    await avisarNovoVeterinario({ tenantId: 'tenant-1', veterinario, io });

    expect(emailService.enviarEmailNovoVetAdmin).not.toHaveBeenCalled();
    expect(emits).toHaveLength(1);
  });

  it('não emite popup quando o admin desligou o canal', async () => {
    configurar({ email: true, popup: false, sms: false });

    await avisarNovoVeterinario({ tenantId: 'tenant-1', veterinario, io });

    expect(emits).toHaveLength(0);
    expect(emailService.enviarEmailNovoVetAdmin).toHaveBeenCalled();
  });

  it('avisa mesmo se a preferência não puder ser lida', async () => {
    // Perder um credenciamento na fila é pior do que um e-mail a mais.
    jest.spyOn(notificacaoController, 'deveNotificar').mockRejectedValue(new Error('banco fora'));

    await avisarNovoVeterinario({ tenantId: 'tenant-1', veterinario, io });

    expect(emailService.enviarEmailNovoVetAdmin).toHaveBeenCalled();
    expect(emits).toHaveLength(1);
  });

  it('falha de e-mail não derruba o cadastro do veterinário', async () => {
    configurar({ email: true, popup: true, sms: false });
    emailService.enviarEmailNovoVetAdmin.mockRejectedValue(new Error('SMTP fora do ar'));

    await expect(avisarNovoVeterinario({ tenantId: 'tenant-1', veterinario, io })).resolves.toBeUndefined();
  });
});

export {};
