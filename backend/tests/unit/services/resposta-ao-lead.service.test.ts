/**
 * A resposta a quem deixou contato no site.
 *
 * O e-mail de "novo contato" ia para a EQUIPE, e quem digitou nome, telefone e
 * o nome do pet recebia silêncio. A primeira dúvida de quem espera é sempre
 * "será que enviou?".
 */

jest.mock('../../../src/services/email.service', () => ({ sendMail: jest.fn() }));

const emailService = require('../../../src/services/email.service');
const servico = require('../../../src/services/resposta-ao-lead.service');

const lead = { name: 'Marina Alves', email: 'marina@exemplo.com.br', pet_name: 'Amora' };

describe('Resposta automática ao lead', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    emailService.sendMail.mockResolvedValue(undefined);
  });

  it('responde para quem deixou o contato', async () => {
    const resultado = await servico.responderAoLead(lead);

    expect(emailService.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'marina@exemplo.com.br' })
    );
    expect(resultado.enviado).toBe(true);
  });

  it('chama pelo primeiro nome — nome completo soa como cobrança', () => {
    const corpo = servico.corpoDaResposta(lead);
    expect(corpo).toContain('Olá, Marina');
    expect(corpo).not.toContain('Olá, Marina Alves');
  });

  it('cita o pet pelo nome quando ele foi informado', () => {
    expect(servico.corpoDaResposta(lead)).toContain('Amora');
  });

  it('sem o nome do pet, o texto continua fazendo sentido', () => {
    const corpo = servico.corpoDaResposta({ name: 'João', email: 'j@x.com' });
    expect(corpo).toContain('seu pet');
  });

  it('oferece o caminho imediato — ninguém com animal passando mal deve esperar telefonema', () => {
    const corpo = servico.corpoDaResposta(lead);
    expect(corpo).toMatch(/não espere/i);
    expect(corpo).toMatch(/pronto-socorro/i);
  });

  it('sem e-mail não há o que responder, e isso não é erro', async () => {
    const resultado = await servico.responderAoLead({ name: 'Sem e-mail', email: null });

    expect(emailService.sendMail).not.toHaveBeenCalled();
    expect(resultado).toEqual({ enviado: false, motivo: 'sem_email' });
  });

  it('falha no envio não derruba nada — perder o contato seria pior', async () => {
    emailService.sendMail.mockRejectedValue(new Error('SMTP fora'));

    await expect(servico.responderAoLead(lead)).resolves.toEqual(
      expect.objectContaining({ enviado: false, motivo: 'falhou' })
    );
  });
});
