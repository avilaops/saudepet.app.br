// Endereço <-> coordenada.
//
// O passo do endereço era texto livre e a coordenada do GPS entrava em silêncio:
// negada a permissão, o chamado nascia SEM coordenada e o despacho por
// proximidade — que usa índice espacial e raio da cidade — ficava sem ponto de
// partida, voltando a avisar todo mundo de plantão sem distância nenhuma.
jest.mock('axios', () => ({ get: jest.fn() }));

const axios = require('axios');
const geocoding = require('../../../src/services/geocoding.service');

const respostaReversa = (endereco = {}) => ({
  data: {
    display_name: 'Rua Vergueiro, 1000, Vila Mariana, São Paulo',
    address: {
      road: 'Rua Vergueiro',
      house_number: '1000',
      suburb: 'Vila Mariana',
      city: 'São Paulo',
      state: 'São Paulo',
      postcode: '04101-000',
      ...endereco
    }
  }
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ advanceTimers: true });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('Coordenada para endereço', () => {
  it('escreve o endereço como uma pessoa escreveria', async () => {
    axios.get.mockResolvedValue(respostaReversa());

    const local = await geocoding.reverso({ latitude: -23.5613, longitude: -46.6565 });

    expect(local.endereco).toBe('Rua Vergueiro, 1000, Vila Mariana, São Paulo - São Paulo');
    expect(local.cidade).toBe('São Paulo');
    expect(local.cep).toBe('04101-000');
    expect(local.latitude).toBe(-23.5613);
  });

  it('identifica a aplicação no User-Agent, como a política do serviço exige', async () => {
    axios.get.mockResolvedValue(respostaReversa());

    await geocoding.reverso({ latitude: -20, longitude: -40 });

    expect(axios.get.mock.calls[0][1].headers['User-Agent']).toMatch(/SaudePet/);
  });

  it('não repete a mesma consulta enquanto a pessoa ajusta o pino', async () => {
    axios.get.mockResolvedValue(respostaReversa());

    await geocoding.reverso({ latitude: -21.1234567, longitude: -41.7654321 });
    await geocoding.reverso({ latitude: -21.1234571, longitude: -41.7654319 });

    // Cinco casas decimais são ~1 metro: mesma consulta, uma chamada só.
    expect(axios.get).toHaveBeenCalledTimes(1);
  });

  it('recusa coordenada que não é número', async () => {
    const local = await geocoding.reverso({ latitude: 'aqui', longitude: null });

    expect(local).toBeNull();
    expect(axios.get).not.toHaveBeenCalled();
  });

  it('trata o ponto sem endereço conhecido sem quebrar', async () => {
    axios.get.mockResolvedValue({ data: { error: 'Unable to geocode' } });

    expect(await geocoding.reverso({ latitude: -30, longitude: -50 })).toBeNull();
  });
});

describe('Endereço para coordenada', () => {
  it('devolve as opções com coordenada, para o pino ir até lá', async () => {
    axios.get.mockResolvedValue({
      data: [
        { lat: '-23.5613', lon: '-46.6565', display_name: 'Rua Vergueiro, 1000', address: { road: 'Rua Vergueiro', house_number: '1000', city: 'São Paulo' } }
      ]
    });

    const locais = await geocoding.buscar({ termo: 'Rua Vergueiro 1000 São Paulo' });

    expect(locais).toHaveLength(1);
    expect(locais[0].latitude).toBeCloseTo(-23.5613, 4);
    expect(locais[0].endereco).toContain('Rua Vergueiro, 1000');
  });

  it('descarta resultado sem coordenada utilizável', async () => {
    axios.get.mockResolvedValue({
      data: [{ lat: 'nao-sei', lon: '-46.6', display_name: 'X', address: {} }]
    });

    expect(await geocoding.buscar({ termo: 'endereço estranho' })).toEqual([]);
  });

  it('não consulta o serviço por um termo curto demais', async () => {
    expect(await geocoding.buscar({ termo: 'rua' })).toEqual([]);
    expect(axios.get).not.toHaveBeenCalled();
  });

  it('busca só no Brasil', async () => {
    axios.get.mockResolvedValue({ data: [] });

    await geocoding.buscar({ termo: 'avenida paulista' });

    expect(axios.get.mock.calls[0][1].params.countrycodes).toBe('br');
  });
});
