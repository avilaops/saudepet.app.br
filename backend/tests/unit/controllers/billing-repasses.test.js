// Fila de repasses ao veterinário.
//
// O pedido de transferência debitava o saldo e criava uma `Transacao` pendente
// que nenhum ponto do sistema lia: não havia rota, worker nem tela que pagasse
// aquilo. O dinheiro sumia da tela do profissional e não chegava a lugar nenhum.
const prisma = require('../../../src/config/database');

jest.mock('../../../src/services/audit.service', () => ({
  logForensicEvent: jest.fn().mockResolvedValue(undefined)
}));
jest.mock('../../../src/services/push.service', () => ({
  enviarParaUsuario: jest.fn().mockResolvedValue(undefined)
}));
jest.mock('../../../src/services/crypto.service', () => ({
  encrypt: jest.fn((texto) => `cifrado:${texto}`),
  decrypt: jest.fn((texto) => String(texto).replace(/^cifrado:/, ''))
}));

const cryptoService = require('../../../src/services/crypto.service');
const pushService = require('../../../src/services/push.service');
const billing = require('../../../src/controllers/billing.controller');

const res = () => {
  const r = {};
  r.json = jest.fn().mockReturnValue(r);
  r.status = jest.fn().mockReturnValue(r);
  return r;
};
const next = (erro) => { throw erro; };

const DADOS_BANCARIOS = {
  banco: '001', agencia: '1234', conta: '56789-0',
  tipo_conta: 'corrente', cpf_cnpj: '12345678900', titular: 'Dra. Ana'
};

// `prisma.$transaction` do mock recebe o callback interativo; devolvemos o
// próprio client mockado como `tx`.
const rodarTransacaoInterativa = () => {
  prisma.$transaction.mockImplementation((arg) =>
    typeof arg === 'function' ? arg(prisma) : Promise.all(arg));
};

beforeEach(() => {
  jest.clearAllMocks();
  rodarTransacaoInterativa();
});

describe('Veterinário solicita transferência', () => {
  const req = (valor = 200) => ({
    body: { valor, dados_bancarios: DADOS_BANCARIOS },
    user: { id: 'user-vet', tenant_id: 'tenant-1' }
  });

  const carteira = (saldo = 500) => ({
    veterinario_id: 'vet-1', tenant_id: 'tenant-1', saldo_disponivel: saldo
  });

  beforeEach(() => {
    prisma.veterinario.findFirst.mockResolvedValue({ id: 'vet-1', usuario_id: 'user-vet' });
    prisma.carteiraVeterinario.findFirst.mockResolvedValue(carteira());
    prisma.carteiraVeterinario.updateMany.mockResolvedValue({ count: 1 });
    prisma.transacao.findFirst.mockResolvedValue(null);
    prisma.transacao.create.mockResolvedValue({ id: 't1', valor_total: 200, status: 'pendente' });
  });

  it('grava os dados bancários criptografados — iam em JSON puro', async () => {
    await billing.solicitarTransferencia(req(), res(), next);

    const dados = prisma.carteiraVeterinario.updateMany.mock.calls[0][0].data;
    expect(cryptoService.encrypt).toHaveBeenCalledWith(JSON.stringify(DADOS_BANCARIOS));
    expect(dados.dados_bancarios).toBe(`cifrado:${JSON.stringify(DADOS_BANCARIOS)}`);
  });

  it('debita só se o saldo ainda cobrir o valor na hora da escrita', async () => {
    await billing.solicitarTransferencia(req(200), res(), next);

    const where = prisma.carteiraVeterinario.updateMany.mock.calls[0][0].where;
    expect(where.saldo_disponivel).toEqual({ gte: 200 });
  });

  it('recusa um segundo pedido enquanto o primeiro está em aberto', async () => {
    // Sem esta guarda, dois toques no botão geravam dois débitos.
    prisma.transacao.findFirst.mockResolvedValue({ id: 't-antigo' });

    await expect(billing.solicitarTransferencia(req(), res(), next))
      .rejects.toThrow(/já tem um pedido/i);
    expect(prisma.carteiraVeterinario.updateMany).not.toHaveBeenCalled();
  });

  it('não cria a transação se a corrida pelo saldo for perdida', async () => {
    prisma.carteiraVeterinario.updateMany.mockResolvedValue({ count: 0 });

    await expect(billing.solicitarTransferencia(req(), res(), next))
      .rejects.toThrow(/saldo insuficiente/i);
    expect(prisma.transacao.create).not.toHaveBeenCalled();
  });

  it('recusa valor acima do saldo antes de qualquer escrita', async () => {
    prisma.carteiraVeterinario.findFirst.mockResolvedValue(carteira(50));

    await expect(billing.solicitarTransferencia(req(200), res(), next))
      .rejects.toThrow(/saldo insuficiente/i);
    expect(prisma.carteiraVeterinario.updateMany).not.toHaveBeenCalled();
  });

  it('não promete prazo que ninguém cumpre', async () => {
    const r = res();
    await billing.solicitarTransferencia(req(), r, next);

    const { message } = r.json.mock.calls[0][0];
    expect(message).not.toMatch(/2 dias úteis/i);
    expect(message).toMatch(/registrado/i);
  });
});

describe('Admin vê a fila de repasses', () => {
  const req = (query = {}) => ({ query, user: { id: 'admin-1', tenant_id: 'tenant-1' } });

  beforeEach(() => {
    prisma.transacao.findMany.mockResolvedValue([
      { id: 't1', status: 'pendente', valor_total: 200, veterinario_id: 'vet-1', criado_em: new Date(), concluido_em: null, notas: null },
      { id: 't2', status: 'pendente', valor_total: 50, veterinario_id: 'vet-1', criado_em: new Date(), concluido_em: null, notas: null }
    ]);
    prisma.carteiraVeterinario.findMany.mockResolvedValue([
      { veterinario_id: 'vet-1', saldo_disponivel: 300, dados_bancarios: `cifrado:${JSON.stringify(DADOS_BANCARIOS)}` }
    ]);
    prisma.veterinario.findMany.mockResolvedValue([
      { id: 'vet-1', crmv: 'SP-1', usuario: { nome: 'Dra. Ana', email: 'ana@x.com', telefone: '11999' } }
    ]);
  });

  it('devolve os dados bancários decifrados para quem vai pagar', async () => {
    const r = res();
    await billing.listarTransferencias(req(), r, next);

    const { transferencias } = r.json.mock.calls[0][0];
    expect(transferencias[0].dados_bancarios).toEqual(DADOS_BANCARIOS);
    expect(transferencias[0].veterinario.nome).toBe('Dra. Ana');
  });

  it('soma quanto está aguardando repasse', async () => {
    const r = res();
    await billing.listarTransferencias(req(), r, next);
    expect(r.json.mock.calls[0][0].total_pendente).toBe(250);
  });

  it('lê carteira antiga que ainda está em JSON puro', async () => {
    // Quem pediu transferência antes da criptografia não pode sumir da fila.
    prisma.carteiraVeterinario.findMany.mockResolvedValue([
      { veterinario_id: 'vet-1', saldo_disponivel: 300, dados_bancarios: JSON.stringify(DADOS_BANCARIOS) }
    ]);
    cryptoService.decrypt.mockImplementationOnce(() => { throw new Error('não é cifrado'); });

    const r = res();
    await billing.listarTransferencias(req(), r, next);
    expect(r.json.mock.calls[0][0].transferencias[0].dados_bancarios).toEqual(DADOS_BANCARIOS);
  });
});

describe('Admin confirma o repasse', () => {
  const req = { params: { id: 't1' }, body: { comprovante: 'PIX E123' }, user: { id: 'admin-1', tenant_id: 'tenant-1' } };

  beforeEach(() => {
    prisma.transacao.findFirst.mockResolvedValue({
      id: 't1', status: 'pendente', valor_total: 200, veterinario_id: 'vet-1', notas: null
    });
    prisma.transacao.update.mockResolvedValue({ id: 't1', status: 'concluida', valor_total: 200 });
    prisma.carteiraVeterinario.updateMany.mockResolvedValue({ count: 1 });
    prisma.veterinario.findFirst.mockResolvedValue({ usuario_id: 'user-vet' });
  });

  it('encerra o pedido e soma no total transferido', async () => {
    await billing.confirmarTransferencia(req, res(), next);

    expect(prisma.transacao.update.mock.calls[0][0].data.status).toBe('concluida');
    expect(prisma.carteiraVeterinario.updateMany.mock.calls[0][0].data)
      .toEqual({ total_transferido: { increment: 200 } });
  });

  it('não devolve o saldo — ele já saiu no pedido', async () => {
    await billing.confirmarTransferencia(req, res(), next);

    const escrita = prisma.carteiraVeterinario.updateMany.mock.calls[0][0].data;
    expect(escrita.saldo_disponivel).toBeUndefined();
  });

  it('avisa o veterinário', async () => {
    await billing.confirmarTransferencia(req, res(), next);
    expect(pushService.enviarParaUsuario).toHaveBeenCalledWith('user-vet', expect.objectContaining({
      title: 'Repasse confirmado'
    }));
  });

  it('recusa confirmar duas vezes o mesmo pedido', async () => {
    prisma.transacao.findFirst.mockResolvedValue({ id: 't1', status: 'concluida', valor_total: 200 });

    await expect(billing.confirmarTransferencia(req, res(), next)).rejects.toThrow(/já foi encerrado/i);
  });
});

describe('Admin recusa o pedido', () => {
  const req = (motivo) => ({
    params: { id: 't1' },
    body: { motivo },
    user: { id: 'admin-1', tenant_id: 'tenant-1' }
  });

  beforeEach(() => {
    prisma.transacao.findFirst.mockResolvedValue({
      id: 't1', status: 'pendente', valor_total: 200, veterinario_id: 'vet-1', notas: null
    });
    prisma.transacao.update.mockResolvedValue({ id: 't1', status: 'cancelada', valor_total: 200 });
    prisma.carteiraVeterinario.updateMany.mockResolvedValue({ count: 1 });
    prisma.veterinario.findFirst.mockResolvedValue({ usuario_id: 'user-vet' });
  });

  it('devolve o saldo ao veterinário — recusar sem devolver seria confisco', async () => {
    await billing.recusarTransferencia(req('Conta não pertence ao titular'), res(), next);

    expect(prisma.carteiraVeterinario.updateMany.mock.calls[0][0].data)
      .toEqual({ saldo_disponivel: { increment: 200 } });
    expect(prisma.transacao.update.mock.calls[0][0].data.status).toBe('cancelada');
  });

  it('exige motivo — o veterinário precisa saber o que corrigir', async () => {
    await expect(billing.recusarTransferencia(req('não'), res(), next)).rejects.toThrow(/motivo/i);
    expect(prisma.carteiraVeterinario.updateMany).not.toHaveBeenCalled();
  });
});
