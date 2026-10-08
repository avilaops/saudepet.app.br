// Direitos do titular (LGPD, art. 18).
//
// A Política de Privacidade prometia acesso, portabilidade e exclusão e não
// existia NENHUM endpoint nem tela para nada disso.
const prisma = require('../../../src/config/database');

jest.mock('../../../src/services/audit.service', () => ({
  logForensicEvent: jest.fn().mockResolvedValue(undefined)
}));
jest.mock('bcryptjs', () => ({
  compare: jest.fn().mockResolvedValue(true),
  hash: jest.fn().mockResolvedValue('hash')
}));

const bcrypt = require('bcryptjs');
const userController = require('../../../src/controllers/user.controller');
const dadosPessoais = require('../../../src/services/dados-pessoais.service');

const res = () => {
  const r = {};
  r.json = jest.fn().mockReturnValue(r);
  r.status = jest.fn().mockReturnValue(r);
  r.send = jest.fn().mockReturnValue(r);
  r.setHeader = jest.fn();
  return r;
};
const next = (erro) => { throw erro; };

const req = (extra = {}) => ({
  body: {},
  params: {},
  query: {},
  headers: {},
  ip: '1.1.1.1',
  userId: 'user-1',
  tenantId: 'tenant-1',
  ...extra
});

const semNada = () => {
  prisma.pet.findMany.mockResolvedValue([]);
  prisma.solicitacao.findMany.mockResolvedValue([]);
  prisma.mensagem.findMany.mockResolvedValue([]);
  prisma.avaliacao.findMany.mockResolvedValue([]);
  prisma.lembretePet.findMany.mockResolvedValue([]);
  prisma.payment.findMany.mockResolvedValue([]);
  prisma.assinaturaUsuario.findMany.mockResolvedValue([]);
};

beforeEach(() => {
  jest.clearAllMocks();
  bcrypt.compare.mockResolvedValue(true);
  prisma.$transaction.mockImplementation((arg) =>
    typeof arg === 'function' ? arg(prisma) : Promise.all(arg));
});

describe('Baixar meus dados', () => {
  beforeEach(() => {
    prisma.usuario.findFirst.mockResolvedValue({ id: 'user-1', nome: 'Maria', email: 'maria@x.com' });
    semNada();
    prisma.pet.findMany.mockResolvedValue([{ id: 'pet-1', nome: 'Rex', vacinas: [], alergias: [], medicamentos: [] }]);
    prisma.payment.findMany.mockResolvedValue([{ id: 'pay-1', amount: 150, status: 'PAID' }]);
  });

  it('entrega um arquivo com a conta, os pets e os pagamentos', async () => {
    const r = res();
    await userController.exportarMeusDados(req(), r, next);

    const pacote = JSON.parse(r.send.mock.calls[0][0]);
    expect(pacote.conta.nome).toBe('Maria');
    expect(pacote.pets).toHaveLength(1);
    expect(pacote.pagamentos[0].amount).toBe(150);
    expect(r.setHeader).toHaveBeenCalledWith('Content-Type', 'application/json');
  });

  it('busca só os dados do próprio tenant', async () => {
    await userController.exportarMeusDados(req(), res(), next);
    expect(prisma.usuario.findFirst.mock.calls[0][0].where).toEqual({ id: 'user-1', tenant_id: 'tenant-1' });
  });
});

describe('Encerrar minha conta', () => {
  const reqEncerrar = (body = { senha: 'segredo123' }) => req({ body });

  beforeEach(() => {
    prisma.usuario.findFirst.mockResolvedValue({ id: 'user-1', senha: 'hash', tipo_usuario: 'tutor' });
    prisma.solicitacao.findFirst.mockResolvedValue(null);
    prisma.payment.findFirst.mockResolvedValue(null);
    prisma.usuario.update.mockResolvedValue({ id: 'user-1', tenant_id: 'tenant-1' });
    prisma.pushSubscription.deleteMany.mockResolvedValue({ count: 0 });
    prisma.auditLog.create.mockResolvedValue({});
  });

  it('anonimiza os dados pessoais e derruba a sessão', async () => {
    await userController.encerrarMinhaConta(reqEncerrar(), res(), next);

    const dados = prisma.usuario.update.mock.calls[0][0].data;
    expect(dados.nome).toBe('Usuário removido');
    expect(dados.telefone).toBeNull();
    expect(dados.cpf).toBeNull();
    expect(dados.senha).toBeNull();
    expect(dados.ativo).toBe(false);
    expect(dados.sessoes_revogadas_em).toBeInstanceOf(Date);
  });

  it('exige a senha — sessão esquecida num aparelho não apaga a conta de alguém', async () => {
    await expect(userController.encerrarMinhaConta(reqEncerrar({}), res(), next))
      .rejects.toThrow(/confirme sua senha/i);
    expect(prisma.usuario.update).not.toHaveBeenCalled();
  });

  it('recusa senha incorreta', async () => {
    bcrypt.compare.mockResolvedValue(false);

    await expect(userController.encerrarMinhaConta(reqEncerrar(), res(), next))
      .rejects.toThrow(/senha incorreta/i);
  });

  it('não encerra conta profissional por autoatendimento', async () => {
    // Veterinário tem vínculo, repasse e prontuário assinado.
    prisma.usuario.findFirst.mockResolvedValue({ id: 'user-1', senha: 'hash', tipo_usuario: 'veterinario' });

    await expect(userController.encerrarMinhaConta(reqEncerrar(), res(), next))
      .rejects.toThrow(/administração/i);
  });

  it('não encerra no meio de um atendimento', async () => {
    // Senão o veterinário fica a caminho de um endereço que acabou de sumir.
    prisma.solicitacao.findFirst.mockResolvedValue({ id: 'atend-1' });

    await expect(userController.encerrarMinhaConta(reqEncerrar(), res(), next))
      .rejects.toThrow(/atendimento em andamento/i);
  });

  it('não encerra com cobrança em aberto', async () => {
    prisma.payment.findFirst.mockResolvedValue({ id: 'pay-1' });

    await expect(userController.encerrarMinhaConta(reqEncerrar(), res(), next))
      .rejects.toThrow(/cobrança em aberto/i);
  });

  it('não toca no prontuário nem no histórico clínico do pet', async () => {
    // Prontuário é documento clínico do animal, com guarda obrigatória, e apagar
    // vacina e alergia pode custar caro num atendimento futuro.
    await userController.encerrarMinhaConta(reqEncerrar(), res(), next);

    const apagados = Object.entries(prisma)
      .filter(([, modelo]) => modelo && typeof modelo === 'object' && modelo.deleteMany?.mock)
      .filter(([, modelo]) => modelo.deleteMany.mock.calls.length > 0)
      .map(([nome]) => nome);

    // A única exclusão do encerramento é a das inscrições de push, que é dado de
    // dispositivo. Pet, atendimento e prontuário permanecem.
    expect(apagados).toEqual(['pushSubscription']);
  });

  it('registra o encerramento na trilha, com o que foi preservado', async () => {
    await userController.encerrarMinhaConta(reqEncerrar({ senha: 'segredo123', motivo: 'Não uso mais' }), res(), next);

    const log = prisma.auditLog.create.mock.calls[0][0].data;
    expect(log.acao).toBe('lgpd.conta_encerrada');
    // A coluna é `acao`; `action` não existe no modelo.
    expect(log.action).toBeUndefined();
    expect(JSON.parse(log.detalhes).motivo).toBe('Não uso mais');
  });
});

describe('Pendências antes de encerrar', () => {
  it('lista o que impede, para a tela avisar antes do formulário', async () => {
    prisma.solicitacao.findFirst.mockResolvedValue({ id: 'atend-1' });
    prisma.payment.findFirst.mockResolvedValue({ id: 'pay-1' });

    const r = res();
    await userController.pendenciasDaConta(req(), r, next);

    const resposta = r.json.mock.calls[0][0];
    expect(resposta.pode_encerrar).toBe(false);
    expect(resposta.impedimentos).toHaveLength(2);
  });

  it('libera quando não há nada pendente', async () => {
    prisma.solicitacao.findFirst.mockResolvedValue(null);
    prisma.payment.findFirst.mockResolvedValue(null);

    const r = res();
    await userController.pendenciasDaConta(req(), r, next);
    expect(r.json.mock.calls[0][0].pode_encerrar).toBe(true);
  });
});

describe('Anonimização', () => {
  it('não deixa e-mail real para trás e libera o endereço para novo cadastro', async () => {
    const anonimo = dadosPessoais.ANONIMO('user-1');
    expect(anonimo.email).toBe('removido+user-1@saudepet.invalido');
    expect(anonimo.nome).not.toMatch(/@/);
  });
});

export {};
