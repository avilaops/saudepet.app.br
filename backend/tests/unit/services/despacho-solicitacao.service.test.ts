const prisma = require('../../../src/config/database');
const despacho = require('../../../src/services/despacho-solicitacao.service');

// Coordenadas reais para as distâncias fazerem sentido no teste.
const TUTOR = { lat: -23.5614, lon: -46.6559 };   // Av. Paulista
const PERTO = { latitude: -23.5629, longitude: -46.6544 }; // ~200 m
const MEDIO = { latitude: -23.6003, longitude: -46.7196 }; // ~8 km
const LONGE = { latitude: -22.9068, longitude: -43.1729 }; // Rio, ~360 km

function solicitacao(extra = {}) {
  return {
    id: 'sol-1',
    tenant_id: 'tenant-1',
    latitude: TUTOR.lat,
    longitude: TUTOR.lon,
    pet: { nome: 'Rex' },
    tutor: { cidade: 'São Paulo' },
    ...extra
  };
}

describe('Despacho por proximidade', () => {
  let io;
  let emitidos;

  beforeEach(() => {
    jest.clearAllMocks();
    emitidos = [];
    io = { to: jest.fn((room) => ({ emit: (evento, payload) => emitidos.push({ room, evento, payload }) })) };
    prisma.cidadeCobertura.findFirst.mockResolvedValue({ raio_atendimento_km: 20 });
  });

  it('entrega só a quem está dentro do raio, do mais perto ao mais longe', async () => {
    prisma.veterinario.findMany.mockResolvedValue([
      { id: 'v-longe', usuario_id: 'u-longe', ...LONGE },
      { id: 'v-perto', usuario_id: 'u-perto', ...PERTO },
      { id: 'v-medio', usuario_id: 'u-medio', ...MEDIO }
    ]);

    const { notificados, raioKm } = await despacho.despacharSolicitacao({ io, solicitacao: solicitacao() });

    expect(raioKm).toBe(20);
    expect(notificados).toBe(2); // o do Rio ficou de fora
    // Cada um recebe na SUA sala, não num megafone para o tenant inteiro.
    expect(emitidos.map((e) => e.room)).toEqual(['user:u-perto', 'user:u-medio']);
    expect(emitidos[0].payload.distancia_km).toBeLessThan(emitidos[1].payload.distancia_km);
    expect(emitidos[0].payload.distancia_label).toMatch(/m|km/);
  });

  it('usa o raio configurado para a cidade do tutor', async () => {
    prisma.cidadeCobertura.findFirst.mockResolvedValue({ raio_atendimento_km: 5 });
    prisma.veterinario.findMany.mockResolvedValue([
      { id: 'v-perto', usuario_id: 'u-perto', ...PERTO },
      { id: 'v-medio', usuario_id: 'u-medio', ...MEDIO }
    ]);

    const { notificados } = await despacho.despacharSolicitacao({ io, solicitacao: solicitacao() });

    // Com raio de 5 km o de ~8 km fica fora.
    expect(notificados).toBe(1);
    expect(emitidos[0].room).toBe('user:u-perto');
  });

  it('não deixa chamado sem ninguém: sem alguém no raio, vai para todos de plantão', async () => {
    prisma.veterinario.findMany.mockResolvedValue([
      { id: 'v-longe', usuario_id: 'u-longe', ...LONGE }
    ]);

    const { notificados } = await despacho.despacharSolicitacao({ io, solicitacao: solicitacao() });

    expect(notificados).toBe(1);
    expect(emitidos[0].room).toBe('user:u-longe');
  });

  it('veterinário sem GPS continua recebendo, por último', async () => {
    prisma.veterinario.findMany.mockResolvedValue([
      { id: 'v-sem-gps', usuario_id: 'u-sem-gps', latitude: null, longitude: null },
      { id: 'v-perto', usuario_id: 'u-perto', ...PERTO }
    ]);

    const { notificados } = await despacho.despacharSolicitacao({ io, solicitacao: solicitacao() });

    expect(notificados).toBe(2);
    expect(emitidos.map((e) => e.room)).toEqual(['user:u-perto', 'user:u-sem-gps']);
  });

  it('sem coordenada do tutor, todos de plantão recebem', async () => {
    prisma.veterinario.findMany.mockResolvedValue([
      { id: 'v-perto', usuario_id: 'u-perto', ...PERTO },
      { id: 'v-longe', usuario_id: 'u-longe', ...LONGE }
    ]);

    const { notificados } = await despacho.despacharSolicitacao({
      io,
      solicitacao: solicitacao({ latitude: null, longitude: null })
    });

    expect(notificados).toBe(2);
  });

  it('só considera quem está online e aprovado', async () => {
    prisma.veterinario.findMany.mockResolvedValue([]);

    await despacho.despacharSolicitacao({ io, solicitacao: solicitacao() });

    const where = prisma.veterinario.findMany.mock.calls[0][0].where;
    expect(where.online).toBe(true);
    expect(where.aprovado_admin).toBe(true);
    expect(where.tenant_id).toBe('tenant-1');
  });

  it('cai no raio padrão quando a cidade não tem cobertura cadastrada', async () => {
    prisma.cidadeCobertura.findFirst.mockResolvedValue(null);
    prisma.veterinario.findMany.mockResolvedValue([]);

    const { raioKm } = await despacho.despacharSolicitacao({ io, solicitacao: solicitacao() });

    expect(raioKm).toBe(20);
  });
});

describe('Busca geoespacial no Postgres (cube + earthdistance)', () => {
  let io;
  let emitidos;

  beforeEach(() => {
    jest.clearAllMocks();
    emitidos = [];
    io = { to: jest.fn((room) => ({ emit: (evento, payload) => emitidos.push({ room, evento, payload }) })) };
    prisma.cidadeCobertura.findFirst.mockResolvedValue({ raio_atendimento_km: 20 });
  });

  it('usa o resultado do banco, já ordenado, sem varrer todos em memória', async () => {
    prisma.$queryRaw.mockResolvedValue([
      { id: 'v-perto', usuario_id: 'u-perto', latitude: -23.56, longitude: -46.65, distancia_km: 0.2 },
      { id: 'v-medio', usuario_id: 'u-medio', latitude: -23.6, longitude: -46.71, distancia_km: 8.1 }
    ]);

    const { notificados, fonte } = await despacho.despacharSolicitacao({ io, solicitacao: solicitacao() });

    expect(fonte).toBe('postgres');
    expect(notificados).toBe(2);
    expect(emitidos.map((e) => e.room)).toEqual(['user:u-perto', 'user:u-medio']);
    expect(emitidos[0].payload.distancia_label).toBe('200 m');
    // O caminho do banco dispensa carregar o plantão inteiro na memória.
    expect(prisma.veterinario.findMany).not.toHaveBeenCalled();
  });

  it('sem ninguém no raio, o banco devolve vazio e o chamado vai para todo o plantão', async () => {
    prisma.$queryRaw.mockResolvedValue([]);
    prisma.veterinario.findMany.mockResolvedValue([
      { id: 'v-longe', usuario_id: 'u-longe', latitude: -22.9068, longitude: -43.1729 }
    ]);

    const { notificados, fonte } = await despacho.despacharSolicitacao({ io, solicitacao: solicitacao() });

    expect(fonte).toBe('postgres-sem-alcance');
    expect(notificados).toBe(1);
  });

  it('banco sem as extensões cai no cálculo em memória sem perder o chamado', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('function ll_to_earth(...) does not exist'));
    prisma.veterinario.findMany.mockResolvedValue([
      { id: 'v-perto', usuario_id: 'u-perto', latitude: -23.5629, longitude: -46.6544 }
    ]);
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    const { notificados, fonte } = await despacho.despacharSolicitacao({ io, solicitacao: solicitacao() });

    expect(fonte).toBe('memoria');
    expect(notificados).toBe(1);
  });

  it('não consulta o banco por proximidade quando o tutor não tem coordenada', async () => {
    prisma.veterinario.findMany.mockResolvedValue([{ id: 'v1', usuario_id: 'u1', latitude: null, longitude: null }]);

    const { fonte } = await despacho.despacharSolicitacao({
      io,
      solicitacao: solicitacao({ latitude: null, longitude: null })
    });

    expect(fonte).toBe('sem-coordenada');
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});

export {};
