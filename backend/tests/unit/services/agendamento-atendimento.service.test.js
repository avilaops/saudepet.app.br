const prisma = require('../../../src/config/database');
const service = require('../../../src/services/agendamento-atendimento.service');

function agendamentoConfirmado(extra = {}) {
  return {
    id: 'ag-1',
    tenant_id: 'tenant-1',
    tutor_id: 'tutor-1',
    pet_id: 'pet-1',
    veterinario_id: 'vet-1',
    tipo_atendimento: 'consulta_domiciliar',
    status: 'confirmado',
    observacoes: 'Retorno de vacina',
    valor_estimado: 145,
    preco_catalogo_codigo: 'consulta_domiciliar',
    solicitacao_id: null,
    inicio: new Date('2026-08-21T14:00:00.000Z'),
    pet: { id: 'pet-1', nome: 'Rex' },
    tutor: { id: 'tutor-1', nome: 'Maria', endereco: 'Rua A', numero: '10', cidade: 'São Paulo' },
    veterinario: { id: 'vet-1', usuario_id: 'usuario-vet-1' },
    ...extra
  };
}

describe('Ponte agenda → atendimento', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.solicitacao.findFirst.mockResolvedValue(null);
    prisma.solicitacao.create.mockResolvedValue({ id: 'sol-1', pet: {}, tutor: {} });
    prisma.solicitacaoTimeline.create.mockResolvedValue({});
    prisma.agendamento.update.mockResolvedValue({});
  });

  it('abre o atendimento já com dono, hora e endereço do tutor', async () => {
    prisma.agendamento.findFirst.mockResolvedValue(agendamentoConfirmado());

    const { solicitacao, reaproveitada } = await service.abrirAtendimentoDoAgendamento({
      agendamentoId: 'ag-1',
      tenantId: 'tenant-1'
    });

    expect(reaproveitada).toBe(false);
    expect(solicitacao.id).toBe('sol-1');

    const criada = prisma.solicitacao.create.mock.calls[0][0].data;
    // Nasce aceito: a consulta tem dono desde que foi marcada, não passa pela
    // fila aberta de plantão.
    expect(criada.status).toBe('aceito');
    expect(criada.veterinario_id).toBe('vet-1');
    expect(criada.tutor_id).toBe('tutor-1');
    expect(criada.pet_id).toBe('pet-1');
    expect(criada.localizacao_cliente).toBe('Rua A, 10 — São Paulo');
    expect(criada.observacoes).toBe('Retorno de vacina');
    expect(criada.valor_estimado).toBe(145);
  });

  it('registra a abertura na linha do tempo e amarra o agendamento ao atendimento', async () => {
    prisma.agendamento.findFirst.mockResolvedValue(agendamentoConfirmado());

    await service.abrirAtendimentoDoAgendamento({
      agendamentoId: 'ag-1',
      tenantId: 'tenant-1',
      ator: { id: 'usuario-vet-1', tipo: 'veterinario' },
      origem: 'api',
      manual: true
    });

    const timeline = prisma.solicitacaoTimeline.create.mock.calls[0][0].data;
    expect(timeline.status).toBe('aceito');
    expect(timeline.ator_tipo).toBe('veterinario');
    expect(timeline.origem).toBe('api');

    // `solicitacao_id` existia no schema sem ninguém para preenchê-lo.
    const atualizacao = prisma.agendamento.update.mock.calls[0][0].data;
    expect(atualizacao.solicitacao_id).toBe('sol-1');
    expect(atualizacao.status).toBe('confirmado');
  });

  it('é idempotente: consulta já aberta devolve o mesmo atendimento', async () => {
    prisma.agendamento.findFirst.mockResolvedValue(agendamentoConfirmado({ solicitacao_id: 'sol-existente' }));
    prisma.solicitacao.findUnique.mockResolvedValue({ id: 'sol-existente' });

    const { solicitacao, reaproveitada } = await service.abrirAtendimentoDoAgendamento({
      agendamentoId: 'ag-1',
      tenantId: 'tenant-1'
    });

    expect(reaproveitada).toBe(true);
    expect(solicitacao.id).toBe('sol-existente');
    expect(prisma.solicitacao.create).not.toHaveBeenCalled();
  });

  it('recusa consulta ainda pendente de confirmação no caminho automático', async () => {
    prisma.agendamento.findFirst.mockResolvedValue(agendamentoConfirmado({ status: 'pendente' }));

    await expect(
      service.abrirAtendimentoDoAgendamento({ agendamentoId: 'ag-1', tenantId: 'tenant-1' })
    ).rejects.toThrow(/aguarda confirmação/i);
    expect(prisma.solicitacao.create).not.toHaveBeenCalled();
  });

  it('aceita consulta pendente quando o próprio veterinário inicia', async () => {
    prisma.agendamento.findFirst.mockResolvedValue(agendamentoConfirmado({ status: 'pendente' }));

    const { reaproveitada } = await service.abrirAtendimentoDoAgendamento({
      agendamentoId: 'ag-1',
      tenantId: 'tenant-1',
      manual: true
    });

    expect(reaproveitada).toBe(false);
    expect(prisma.solicitacao.create).toHaveBeenCalled();
  });

  it('não abre um segundo atendimento para tutor que já tem um em andamento', async () => {
    prisma.agendamento.findFirst.mockResolvedValue(agendamentoConfirmado());
    prisma.solicitacao.findFirst.mockResolvedValue({ id: 'sol-em-andamento' });

    await expect(
      service.abrirAtendimentoDoAgendamento({ agendamentoId: 'ag-1', tenantId: 'tenant-1' })
    ).rejects.toThrow(/já possui um atendimento/i);
    expect(prisma.solicitacao.create).not.toHaveBeenCalled();
  });

  it('usa o endereço salvo do tutor, com coordenada, quando existe', async () => {
    // O atendimento aberto a partir de consulta agendada nascia sem
    // latitude/longitude: o veterinário não via para onde ir e o tutor não via
    // ninguém se aproximando — justamente na consulta marcada, em que dá tempo
    // de tudo estar certo.
    prisma.enderecoTutor.findFirst.mockResolvedValue({
      endereco: 'Rua Vergueiro, 1000 - São Paulo',
      complemento: 'Apto 42',
      latitude: -23.5613,
      longitude: -46.6565
    });

    await service.abrirAtendimentoDoAgendamento({ agendamentoId: 'ag-1', tenantId: 'tenant-1' });

    const dados = prisma.solicitacao.create.mock.calls[0][0].data;
    expect(dados.latitude).toBe(-23.5613);
    expect(dados.longitude).toBe(-46.6565);
    expect(dados.localizacao_cliente).toBe('Rua Vergueiro, 1000 - São Paulo — Apto 42');
  });

  it('sem endereço salvo, cai no endereço de texto do perfil', async () => {
    prisma.enderecoTutor.findFirst.mockResolvedValue(null);

    await service.abrirAtendimentoDoAgendamento({ agendamentoId: 'ag-1', tenantId: 'tenant-1' });

    const dados = prisma.solicitacao.create.mock.calls[0][0].data;
    expect(dados.latitude).toBeNull();
    expect(dados.localizacao_cliente).toBeTruthy();
  });

  it('monta o endereço com o que existir no cadastro do tutor', () => {
    expect(service.enderecoDoTutor({ endereco: 'Rua A', numero: '10', cidade: 'SP' })).toBe('Rua A, 10 — SP');
    expect(service.enderecoDoTutor({ cidade: 'SP' })).toBe('SP');
    expect(service.enderecoDoTutor({})).toBeNull();
    expect(service.enderecoDoTutor(null)).toBeNull();
  });
});
