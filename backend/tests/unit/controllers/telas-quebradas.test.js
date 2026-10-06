// Testes dos itens QUEBRADOS/FACHADA que o mapa funcional (TELAS.md) encontrou.
// Cada bloco cobre um botão que a tela mostrava e que não fazia o que dizia.
const prisma = require('../../../src/config/database');

const solicitacaoController = require('../../../src/controllers/solicitacao.controller');
const veterinarioController = require('../../../src/controllers/veterinario.controller');
const formularioController = require('../../../src/controllers/formulario.controller');
const adminFinanceiro = require('../../../src/controllers/admin-financeiro.controller');

const res = () => {
  const r = {};
  r.json = jest.fn().mockReturnValue(r);
  r.status = jest.fn().mockReturnValue(r);
  return r;
};
const next = (erro) => { throw erro; };

beforeEach(() => jest.clearAllMocks());

describe('Torre de controle do admin (/admin/operacoes)', () => {
  // A tela fazia polling de 10s em `GET /solicitacoes` e recebia 403 sempre:
  // o controller só tratava tutor e veterinário. Nunca listou um chamado.
  it('lista os chamados em curso do tenant para o admin', async () => {
    prisma.solicitacao.findMany.mockResolvedValue([{ id: 'a1' }]);
    const r = res();

    await solicitacaoController.listar(
      { userId: 'admin-1', userType: 'admin', tenantId: 'tenant-1', query: {} },
      r,
      next
    );

    const consulta = prisma.solicitacao.findMany.mock.calls[0][0];
    expect(consulta.where.tenant_id).toBe('tenant-1');
    expect(consulta.where.status.in).toContain('procurando_veterinario');
    expect(r.json).toHaveBeenCalledWith({ solicitacoes: [{ id: 'a1' }] });
  });

  it('respeita o filtro de status quando o admin escolhe um', async () => {
    prisma.solicitacao.findMany.mockResolvedValue([]);
    await solicitacaoController.listar(
      { userId: 'admin-1', userType: 'super_admin', tenantId: 'tenant-1', query: { status: 'finalizado' } },
      res(),
      next
    );
    expect(prisma.solicitacao.findMany.mock.calls[0][0].where.status).toBe('finalizado');
  });

  it('continua recusando quem não é tutor, veterinário nem admin', async () => {
    const r = res();
    await solicitacaoController.listar({ userId: 'x', userType: 'parceiro', tenantId: 't' }, r, next);
    expect(r.status).toHaveBeenCalledWith(403);
  });
});

describe('CRMV no perfil do veterinário', () => {
  const req = (body, vet) => ({ userId: 'user-1', tenantId: 'tenant-1', body, __vet: vet });

  const monta = (vet) => {
    prisma.veterinario.findUnique.mockResolvedValue(vet);
    prisma.veterinario.update.mockResolvedValue({ ...vet, ...{} });
  };

  it('grava o CRMV — antes o campo era enviado e descartado em silêncio', async () => {
    monta({ id: 'v1', usuario_id: 'user-1', crmv: 'SP-1', status_credenciamento: 'PENDING_REVIEW' });
    prisma.veterinario.findFirst.mockResolvedValue(null);

    await veterinarioController.atualizar(
      req({ crmv: 'sp-99999', especialidade: 'clínica geral' }),
      res(),
      next
    );

    expect(prisma.veterinario.update.mock.calls[0][0].data.crmv).toBe('SP-99999');
  });

  it('recusa CRMV já usado por outro veterinário do mesmo tenant', async () => {
    monta({ id: 'v1', usuario_id: 'user-1', crmv: 'SP-1', status_credenciamento: 'PENDING_REVIEW' });
    prisma.veterinario.findFirst.mockResolvedValue({ id: 'outro' });

    await expect(veterinarioController.atualizar(req({ crmv: 'SP-2' }), res(), next))
      .rejects.toThrow(/já está cadastrado/i);
  });

  it('não deixa trocar o CRMV depois de credenciado — é a credencial analisada', async () => {
    monta({ id: 'v1', usuario_id: 'user-1', crmv: 'SP-1', status_credenciamento: 'APPROVED' });

    await expect(veterinarioController.atualizar(req({ crmv: 'SP-2' }), res(), next))
      .rejects.toThrow(/já foi verificado/i);
    expect(prisma.veterinario.update).not.toHaveBeenCalled();
  });

  it('salvar sem mexer no CRMV continua funcionando mesmo já aprovado', async () => {
    monta({ id: 'v1', usuario_id: 'user-1', crmv: 'SP-1', status_credenciamento: 'APPROVED' });

    await veterinarioController.atualizar(req({ crmv: 'SP-1', sobre: 'oi' }), res(), next);
    expect(prisma.veterinario.update.mock.calls[0][0].data.crmv).toBeUndefined();
  });
});

describe('Excluir formulário não pode apagar as respostas', () => {
  const req = { params: { id: 'f1' }, user: { tenant_id: 'tenant-1' } };

  it('recusa a exclusão quando já existe resposta registrada', async () => {
    // A relação tem `onDelete: Cascade`: excluir levava junto todo o histórico,
    // enquanto a tela prometia que as respostas seriam preservadas.
    prisma.formulario.findFirst.mockResolvedValue({ id: 'f1' });
    prisma.respostaFormulario.count.mockResolvedValue(12);

    await expect(formularioController.deletar(req, res(), next)).rejects.toThrow(/12 respostas/i);
    expect(prisma.formulario.delete).not.toHaveBeenCalled();
  });

  it('exclui normalmente um formulário que nunca foi respondido', async () => {
    prisma.formulario.findFirst.mockResolvedValue({ id: 'f1' });
    prisma.respostaFormulario.count.mockResolvedValue(0);
    prisma.formulario.delete.mockResolvedValue({});

    await formularioController.deletar(req, res(), next);
    expect(prisma.formulario.delete).toHaveBeenCalledWith({ where: { id: 'f1' } });
  });
});

describe('Painel financeiro: escopo de tenant e busca', () => {
  const req = (query = {}) => ({ query, tenantId: 'tenant-1' });

  beforeEach(() => {
    prisma.payment.count.mockResolvedValue(0);
    prisma.payment.findMany.mockResolvedValue([]);
    prisma.payment.aggregate.mockResolvedValue({ _sum: { amount: 0 }, _count: { id: 0 } });
  });

  it('filtra a lista e o faturamento pelo tenant de quem consulta', async () => {
    // Sem isto o admin de uma organização via o dinheiro de todas as outras.
    await adminFinanceiro.getTransacoes(req(), res(), next);

    expect(prisma.payment.findMany.mock.calls[0][0].where.tenant_id).toBe('tenant-1');
    expect(prisma.payment.aggregate.mock.calls[0][0].where.tenant_id).toBe('tenant-1');
  });

  it('usa o termo do campo "Buscar por ID do pagamento"', async () => {
    // `search` era desestruturado e nunca entrava no `where`: o botão Buscar
    // só recarregava a mesma lista.
    await adminFinanceiro.getTransacoes(req({ search: 'pay_123' }), res(), next);

    const where = prisma.payment.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { id: { contains: 'pay_123', mode: 'insensitive' } },
      { external_payment_id: { contains: 'pay_123', mode: 'insensitive' } }
    ]);
  });
});
