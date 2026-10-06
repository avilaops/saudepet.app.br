// Rota por rua e tempo de deslocamento.
//
// O mapa só sabia distância em linha reta — honesto, mas pouco útil: quem espera
// um veterinário quer saber quanto falta, e 3 km em linha reta podem ser 12
// minutos ou 35, dependendo do que existe no caminho.
jest.mock('axios', () => ({ get: jest.fn() }));

const axios = require('axios');
const rota = require('../../../src/services/rota.service');

const resposta = (extra = {}) => ({
  data: {
    routes: [{
      distance: 4200,
      duration: 780,
      geometry: { coordinates: [[-46.65, -23.56], [-46.64, -23.55]] },
      ...extra
    }]
  }
});

// O cache é do módulo e vive entre os testes — de propósito, é o que evita
// repetir a consulta enquanto alguém arrasta o pino. Cada teste usa um par de
// coordenadas próprio para não acertar a resposta guardada pelo anterior.
let sequencia = 0;
const par = () => {
  sequencia += 1;
  return {
    origem: { latitude: -23.5 - sequencia, longitude: -46.6 - sequencia },
    destino: { latitude: -23.4 - sequencia, longitude: -46.5 - sequencia }
  };
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ advanceTimers: true });
});
afterEach(() => jest.useRealTimers());

describe('Cálculo da rota', () => {
  it('devolve distância e tempo por rua', async () => {
    axios.get.mockResolvedValue(resposta());

    const { origem, destino } = par();
    const r = await rota.calcular({ origem, destino });

    expect(r.distancia_km).toBe(4.2);
    expect(r.duracao_min).toBe(13);
    expect(r.sem_transito).toBe(true);
  });

  it('converte a geometria para a ordem que o mapa desenha', async () => {
    // O GeoJSON vem [lon, lat]; o mapa desenha [lat, lon]. Trocar aqui evita
    // que a tela precise saber dessa diferença — e que o trajeto apareça no
    // oceano Índico.
    axios.get.mockResolvedValue(resposta());

    const { origem, destino } = par();
    const r = await rota.calcular({ origem, destino });

    expect(r.geometria[0]).toEqual([-23.56, -46.65]);
  });

  it('nunca anuncia menos de um minuto', async () => {
    axios.get.mockResolvedValue(resposta({ duration: 20 }));

    const { origem, destino } = par();
    const r = await rota.calcular({ origem, destino });
    expect(r.duracao_min).toBe(1);
  });

  it('serviço fora do ar não vira erro na tela', async () => {
    // Sem rota, a tela volta para a linha reta. Mapa sem trajeto é melhor do
    // que tela de erro.
    axios.get.mockRejectedValue(new Error('timeout'));

    const { origem, destino } = par();
    expect(await rota.calcular({ origem, destino })).toBeNull();
  });

  it('sem rota possível devolve nulo', async () => {
    axios.get.mockResolvedValue({ data: { routes: [] } });

    const { origem, destino } = par();
    expect(await rota.calcular({ origem, destino })).toBeNull();
  });

  it('recusa coordenada ausente sem chamar o serviço', async () => {
    const { origem, destino } = par();
    expect(await rota.calcular({ origem, destino: { latitude: null, longitude: null } })).toBeNull();
    expect(await rota.calcular({ origem: {}, destino })).toBeNull();
    expect(axios.get).not.toHaveBeenCalled();
  });

  it('não repete consulta enquanto o veterinário anda poucos metros', async () => {
    axios.get.mockResolvedValue(resposta());

    const { origem, destino } = par();
    await rota.calcular({ origem, destino });
    await rota.calcular({
      origem: { latitude: origem.latitude + 0.00001, longitude: origem.longitude },
      destino
    });

    expect(axios.get).toHaveBeenCalledTimes(1);
  });

  it('pede a geometria completa, para o traçado não sair quadrado', async () => {
    axios.get.mockResolvedValue(resposta());

    await rota.calcular({ origem: { latitude: -10, longitude: -40 }, destino: { latitude: -11, longitude: -41 } });

    const params = axios.get.mock.calls[0][1].params;
    expect(params.overview).toBe('full');
    expect(params.geometries).toBe('geojson');
  });
});
