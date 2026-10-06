// Duas promessas que a interface fazia sem nada por trás:
//  • "Achei este Pet! Alertar Tutor" era só um deeplink de WhatsApp — o sistema
//    nunca ficava sabendo que a coleira tinha sido lida.
//  • `/admin/planos` mostrava um número de assinantes que consultava um modelo
//    inexistente e caía sempre em zero, sem deixar abrir a lista.
const prisma = require('../../../src/config/database');

jest.mock('../../../src/services/push.service', () => ({ enviarParaUsuario: jest.fn() }));
jest.mock('../../../src/services/audit.service', () => ({
  logForensicEvent: jest.fn().mockResolvedValue(undefined)
}));

const pushService = require('../../../src/services/push.service');
const petPublic = require('../../../src/controllers/pet-public.controller');
const billing = require('../../../src/controllers/billing.controller');

const res = () => {
  const r = {};
  r.json = jest.fn().mockReturnValue(r);
  r.status = jest.fn().mockReturnValue(r);
  return r;
};
const next = (erro) => { throw erro; };

const PET_ID = '11111111-2222-3333-4444-555555555555';

const req = (extra = {}) => ({
  params: { id: PET_ID },
  body: {},
  query: {},
  headers: { 'user-agent': 'jest' },
  ip: '1.2.3.4',
  userId: 'tutor-1',
  tenantId: 'tenant-1',
  user: { id: 'admin-1', tenant_id: 'tenant-1' },
  ...extra
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Leitura da coleira', () => {
  beforeEach(() => {
    prisma.pet.findUnique.mockResolvedValue({
      id: PET_ID, nome: 'Rex', tenant_id: 'tenant-1', tutor_id: 'tutor-1'
    });
    prisma.petTagScan.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: 'scan-1', criado_em: new Date(), ...data }));
    prisma.petTagScan.findFirst.mockResolvedValue(null);
  });

  it('grava a leitura com localização e recado de quem achou', async () => {
    await petPublic.registrarLeitura(
      req({ body: { latitude: -23.5, longitude: -46.6, mensagem: 'Está na praça', contato: '11999', deliberado: true } }),
      res(), next
    );

    const dados = prisma.petTagScan.create.mock.calls[0][0].data;
    expect(dados.pet_id).toBe(PET_ID);
    expect(dados.latitude).toBe(-23.5);
    expect(dados.mensagem).toBe('Está na praça');
    expect(dados.deliberado).toBe(true);
  });

  it('avisa o tutor quando alguém aciona o alerta', async () => {
    await petPublic.registrarLeitura(req({ body: { deliberado: true } }), res(), next);

    expect(pushService.enviarParaUsuario).toHaveBeenCalledWith('tutor-1', expect.objectContaining({
      title: 'Alguém está com Rex!'
    }));
  });

  it('não repete alerta de abertura de página dentro da mesma hora', async () => {
    // Um QR compartilhado viraria enxurrada de notificações, e o tutor passaria
    // a ignorar todas — inclusive a que importava.
    prisma.petTagScan.findFirst.mockResolvedValue({ id: 'scan-antigo' });

    await petPublic.registrarLeitura(req({ body: { deliberado: false } }), res(), next);

    expect(prisma.petTagScan.create).toHaveBeenCalled();
    expect(pushService.enviarParaUsuario).not.toHaveBeenCalled();
  });

  it('toque deliberado fura o silêncio: ali tem gente com o animal', async () => {
    prisma.petTagScan.findFirst.mockResolvedValue({ id: 'scan-antigo' });

    await petPublic.registrarLeitura(req({ body: { deliberado: true } }), res(), next);

    expect(pushService.enviarParaUsuario).toHaveBeenCalled();
  });

  it('ignora coordenada inválida em vez de gravar lixo', async () => {
    await petPublic.registrarLeitura(
      req({ body: { latitude: 'não sei', longitude: null, deliberado: true } }), res(), next
    );

    const dados = prisma.petTagScan.create.mock.calls[0][0].data;
    expect(dados.latitude).toBeNull();
    expect(dados.longitude).toBeNull();
  });

  it('recusa identificador que não é UUID sem chegar ao banco', async () => {
    await expect(petPublic.registrarLeitura(req({ params: { id: 'coleira-torta' } }), res(), next))
      .rejects.toThrow(/não encontrada/i);
    expect(prisma.pet.findUnique).not.toHaveBeenCalled();
  });

  it('o tutor consegue ver quem leu a coleira do próprio pet', async () => {
    prisma.pet.findFirst.mockResolvedValue({ id: PET_ID, nome: 'Rex' });
    prisma.petTagScan.findMany.mockResolvedValue([{ id: 'scan-1', deliberado: true }]);

    const r = res();
    await petPublic.listarLeituras(req(), r, next);

    expect(prisma.pet.findFirst.mock.calls[0][0].where).toEqual({
      id: PET_ID, tutor_id: 'tutor-1', tenant_id: 'tenant-1'
    });
    expect(r.json.mock.calls[0][0].leituras).toHaveLength(1);
  });

  it('não mostra as leituras do pet de outra pessoa', async () => {
    prisma.pet.findFirst.mockResolvedValue(null);

    await expect(petPublic.listarLeituras(req(), res(), next)).rejects.toThrow(/não encontrado/i);
  });
});

describe('Assinantes no painel', () => {
  it('conta assinantes pelo modelo certo — a contagem caía sempre em zero', async () => {
    prisma.planoAssinatura.findMany.mockResolvedValue([
      { id: 'plano-1', nome: 'Clube', valor_mensal: 49.9, beneficios: '[]' }
    ]);
    prisma.assinaturaUsuario.groupBy.mockResolvedValue([
      { plano_id: 'plano-1', _count: { _all: 7 } }
    ]);

    const r = res();
    await billing.listarPlanosAdmin(req(), r, next);

    expect(r.json.mock.calls[0][0].planos[0].assinantes_ativos).toBe(7);
  });

  it('lista quem assina, com a cobrança para chegar ao estorno', async () => {
    prisma.assinaturaUsuario.findMany.mockResolvedValue([
      {
        id: 'assin-1', status: 'ativa', valor_mensal: 49.9, usuario_id: 'user-1',
        inicio_em: new Date(), proxima_cobranca: new Date(), cancelada_em: null,
        plano: { id: 'plano-1', nome: 'Clube' }
      }
    ]);
    prisma.usuario.findMany.mockResolvedValue([{ id: 'user-1', nome: 'Maria', email: 'maria@x.com' }]);
    prisma.payment.findMany.mockResolvedValue([
      { id: 'pay-1', assinatura_id: 'assin-1', status: 'PAID', amount: 49.9 }
    ]);

    const r = res();
    await billing.listarAssinaturasAdmin(req(), r, next);

    const resposta = r.json.mock.calls[0][0];
    expect(resposta.assinaturas[0].assinante.nome).toBe('Maria');
    expect(resposta.assinaturas[0].pagamento.id).toBe('pay-1');
    expect(resposta.receita_mensal).toBe(49.9);
  });

  it('cancelar exige motivo e avisa quem assinava', async () => {
    prisma.assinaturaUsuario.findFirst.mockResolvedValue({
      id: 'assin-1', status: 'ativa', usuario_id: 'user-1', valor_mensal: 49.9
    });
    prisma.assinaturaUsuario.update.mockResolvedValue({ id: 'assin-1', status: 'cancelada', valor_mensal: 49.9 });

    await expect(billing.cancelarAssinaturaAdmin(
      req({ params: { id: 'assin-1' }, body: { motivo: 'x' } }), res(), next
    )).rejects.toThrow(/motivo/i);

    await billing.cancelarAssinaturaAdmin(
      req({ params: { id: 'assin-1' }, body: { motivo: 'Solicitado por telefone' } }), res(), next
    );

    expect(prisma.assinaturaUsuario.update.mock.calls[0][0].data.status).toBe('cancelada');
    expect(pushService.enviarParaUsuario).toHaveBeenCalledWith('user-1', expect.objectContaining({
      title: 'Sua assinatura foi cancelada'
    }));
  });

  it('não cancela duas vezes', async () => {
    prisma.assinaturaUsuario.findFirst.mockResolvedValue({ id: 'assin-1', status: 'cancelada' });

    await expect(billing.cancelarAssinaturaAdmin(
      req({ params: { id: 'assin-1' }, body: { motivo: 'Motivo suficiente' } }), res(), next
    )).rejects.toThrow(/já está cancelada/i);
  });
});
