// A landing prometia "nossa equipe fará o contato" e nada avisava a equipe: o
// único caminho era alguém abrir /admin/leads por conta própria.
const prisma = require('../../../src/config/database');

jest.mock('../../../src/services/email.service', () => ({
  sendMail: jest.fn().mockResolvedValue(undefined)
}));

const emailService = require('../../../src/services/email.service');
const { avisarNovoLead, destinatariosAdmin } = require('../../../src/services/notificacao-admin.service');

const emits = [];
const io = { to: (sala) => ({ emit: (evento, dados) => emits.push({ sala, evento, dados }) }) };

const lead = {
  id: 'lead-1',
  name: 'Maria',
  phone: '11999998888',
  email: 'maria@example.com',
  city: 'São Paulo',
  state: 'SP',
  interest: 'consulta_domiciliar',
  created_at: new Date()
};

beforeEach(() => {
  jest.clearAllMocks();
  emits.length = 0;
  delete process.env.ADMIN_ALERT_EMAIL;
  prisma.usuario.findMany.mockResolvedValue([
    { email: 'admin@saudepet.app.br' },
    { email: 'suporte@saudepet.app.br' }
  ]);
});

describe('Aviso de novo lead', () => {
  it('manda e-mail para os admins do tenant', async () => {
    await avisarNovoLead({ tenantId: 'tenant-1', lead, io });

    const enviado = emailService.sendMail.mock.calls[0][0];
    expect(enviado.to).toBe('admin@saudepet.app.br,suporte@saudepet.app.br');
    expect(enviado.subject).toContain('Maria');
    expect(enviado.html).toContain('wa.me/5511999998888');
  });

  it('avisa quem está com o painel aberto', async () => {
    await avisarNovoLead({ tenantId: 'tenant-1', lead, io });

    expect(emits).toContainEqual(expect.objectContaining({
      sala: 'tenant:tenant-1:admins',
      evento: 'lead:novo'
    }));
  });

  it('não deixa o lead sem aviso quando o tenant ainda não tem admin', async () => {
    prisma.usuario.findMany.mockResolvedValue([]);
    process.env.ADMIN_ALERT_EMAIL = 'nicolas@avilaops.com';

    await avisarNovoLead({ tenantId: 'tenant-1', lead, io });
    expect(emailService.sendMail.mock.calls[0][0].to).toBe('nicolas@avilaops.com');
  });

  it('não envia nada quando não há para quem enviar', async () => {
    prisma.usuario.findMany.mockResolvedValue([]);

    await avisarNovoLead({ tenantId: 'tenant-1', lead, io });
    expect(emailService.sendMail).not.toHaveBeenCalled();
  });

  it('falha de e-mail não derruba a captura do lead', async () => {
    emailService.sendMail.mockRejectedValue(new Error('SMTP fora do ar'));

    await expect(avisarNovoLead({ tenantId: 'tenant-1', lead, io })).resolves.toBeUndefined();
  });

  it('não repete destinatário que aparece nos dois lugares', async () => {
    process.env.ADMIN_ALERT_EMAIL = 'admin@saudepet.app.br';

    const destinatarios = await destinatariosAdmin('tenant-1');
    expect(destinatarios).toEqual(['admin@saudepet.app.br', 'suporte@saudepet.app.br']);
  });
});

export {};
