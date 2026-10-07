/**
 * Cadastro com e-mail de confirmação que não saiu.
 *
 * O controller engolia a falha do SMTP e respondia "verifique seu email"
 * mesmo quando nada tinha sido enviado — e a tela mandava a pessoa procurar
 * na caixa de entrada um e-mail inexistente. A conta continua sendo criada
 * (o link pode ser pedido de novo), mas a resposta precisa dizer a verdade
 * em `email_verificacao_enviado`.
 */

jest.mock('../../../src/services/token.service', () => ({
  createEmailVerificationToken: jest.fn().mockResolvedValue('token-de-verificacao'),
  createRefreshToken: jest.fn().mockResolvedValue('refresh-token')
}));
jest.mock('../../../src/services/audit.service', () => ({
  logRegister: jest.fn().mockResolvedValue(undefined)
}));
jest.mock('../../../src/services/notificacao-admin.service', () => ({
  avisarNovoVeterinario: jest.fn().mockResolvedValue(undefined)
}));
jest.mock('../../../src/services/meta-conversions.service', () => ({
  trackConversion: jest.fn().mockResolvedValue(undefined)
}));
jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('hash'),
  compare: jest.fn().mockResolvedValue(true)
}));

const prisma = require('../../../src/config/database');
const emailService = require('../../../src/services/email.service');
const modulo = require('../../../src/controllers/auth.controller');
const controller = modulo.default || modulo;

const resposta = () => {
  const res: Record<string, unknown> = {};
  res.json = jest.fn(() => res);
  res.status = jest.fn(() => res);
  return res;
};

const requisicao = () => ({
  body: {
    tipo_usuario: 'tutor',
    nome: 'Ana Tutora',
    email: 'ana@teste.com',
    senha: 'segredo1',
    tenant_slug: 'saudepet'
  },
  ip: '127.0.0.1',
  headers: { 'user-agent': 'jest' },
  connection: { remoteAddress: '127.0.0.1' },
  app: { get: () => null }
});

function corpoDaResposta(res: Record<string, unknown>) {
  return (res.json as jest.Mock).mock.calls[0][0];
}

describe('Cadastro: a resposta diz se o e-mail de confirmação saiu', () => {
  beforeEach(() => {
    prisma.tenant.findUnique.mockResolvedValue({
      id: 'tenant-1',
      status: 'ativo',
      limite_usuarios: 100,
      configuracoes: { permitir_cadastro: true }
    });
    prisma.usuario.count.mockResolvedValue(0);
    prisma.usuario.findFirst.mockResolvedValue(null);
    prisma.usuario.create.mockResolvedValue({
      id: 'usuario-1',
      nome: 'Ana Tutora',
      email: 'ana@teste.com',
      tipo_usuario: 'tutor',
      cidade: null
    });
  });

  it('com o envio em ordem, confirma que o e-mail saiu', async () => {
    emailService.enviarEmailVerificacao.mockResolvedValue({ success: true });
    const res = resposta();
    const next = jest.fn();

    await controller.register(requisicao(), res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
    const corpo = corpoDaResposta(res);
    expect(corpo.email_verificacao_enviado).toBe(true);
    expect(corpo.message).toMatch(/verifique seu email/i);
  });

  it('com o SMTP recusando, a conta é criada e a resposta avisa que o e-mail não saiu', async () => {
    emailService.enviarEmailVerificacao.mockRejectedValue(new Error('SMTP indisponível'));
    const res = resposta();
    const next = jest.fn();

    await controller.register(requisicao(), res, next);

    expect(next).not.toHaveBeenCalled();
    expect(prisma.usuario.create).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(201);
    const corpo = corpoDaResposta(res);
    expect(corpo.email_verificacao_enviado).toBe(false);
    expect(corpo.message).not.toMatch(/verifique seu email/i);
    expect(corpo.message).toMatch(/não conseguimos enviar/i);
  });

  it('um envio que resolve sem sucesso conta como não enviado', async () => {
    emailService.enviarEmailVerificacao.mockResolvedValue({ success: false });
    const res = resposta();

    await controller.register(requisicao(), res, jest.fn());

    expect(corpoDaResposta(res).email_verificacao_enviado).toBe(false);
  });
});
