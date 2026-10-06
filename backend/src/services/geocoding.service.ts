import axios from 'axios';

/**
 * Endereço ↔ coordenada.
 *
 * O passo "Endereço do atendimento" era um campo de texto livre. A coordenada
 * do GPS até era lida em silêncio no fundo, mas: ninguém confirmava nada, o
 * tutor não via onde o veterinário seria enviado, e se a permissão fosse negada
 * (ou demorasse) o chamado nascia SEM coordenada — e o despacho por
 * proximidade, que usa índice espacial de verdade, ficava sem o ponto de
 * partida e caía no modo "manda para todo mundo, sem distância".
 *
 * Usamos o Nominatim (OpenStreetMap), que é aberto e não exige chave. A
 * chamada passa por AQUI, e não pelo navegador de cada tutor, por três razões:
 * a política do serviço exige `User-Agent` identificando a aplicação; exige
 * no máximo uma consulta por segundo; e um cache do nosso lado evita repetir a
 * mesma pergunta a cada toque na tela.
 */

const NOMINATIM = 'https://nominatim.openstreetmap.org';
const USER_AGENT = process.env.GEOCODING_USER_AGENT
  || 'SaudePet/1.0 (contato@saudepet.app.br)';

// Uma consulta por segundo é o teto da política pública do Nominatim.
const INTERVALO_MINIMO_MS = 1100;
let ultimaChamada = 0;

// Cache simples em memória: endereço não muda de lugar, e a mesma tela consulta
// o mesmo ponto várias vezes enquanto a pessoa ajusta o pino.
const CACHE_MAXIMO = 500;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const cache = new Map();

function doCache(chave: string) {
  const item = cache.get(chave);
  if (!item) return null;
  if (Date.now() - item.em > CACHE_TTL_MS) {
    cache.delete(chave);
    return null;
  }
  return item.valor;
}

function guardarNoCache(chave: string, valor: unknown) {
  if (cache.size >= CACHE_MAXIMO) {
    // Descarta o mais antigo: `Map` preserva ordem de inserção.
    cache.delete(cache.keys().next().value);
  }
  cache.set(chave, { valor, em: Date.now() });
}

async function esperarAVez() {
  const desdeAUltima = Date.now() - ultimaChamada;
  if (desdeAUltima < INTERVALO_MINIMO_MS) {
    await new Promise((resolve) => setTimeout(resolve, INTERVALO_MINIMO_MS - desdeAUltima));
  }
  ultimaChamada = Date.now();
}

async function chamar(caminho: string, params: Record<string, string | number>) {
  await esperarAVez();
  const { data } = await axios.get(`${NOMINATIM}${caminho}`, {
    params: { format: 'jsonv2', 'accept-language': 'pt-BR', ...params },
    headers: { 'User-Agent': USER_AGENT },
    timeout: 8000
  });
  return data;
}

/** Monta o endereço como uma pessoa escreveria, não como o OSM devolve. */
function enderecoLegivel(item: any) {
  const a = item?.address || {};
  const rua = a.road || a.pedestrian || a.footway || a.neighbourhood || null;
  const numero = a.house_number || null;
  const bairro = a.suburb || a.neighbourhood || a.city_district || null;
  const cidade = a.city || a.town || a.village || a.municipality || null;
  const estado = a.state_code || a.state || null;

  const linha = [
    [rua, numero].filter(Boolean).join(', '),
    bairro,
    [cidade, estado].filter(Boolean).join(' - ')
  ].filter(Boolean).join(', ');

  return {
    endereco: linha || item?.display_name || null,
    rua,
    numero,
    bairro,
    cidade,
    estado,
    cep: a.postcode || null
  };
}

/** Coordenada → endereço. É o caminho do "usar minha localização". */
async function reverso({ latitude, longitude }: { latitude: unknown; longitude: unknown }) {
  const lat = Number(latitude);
  const lng = Number(longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  // Cinco casas ≈ 1 metro: precisão de sobra para o pino, e agrupa as
  // consultas de quem está arrastando o marcador.
  const chave = `r:${lat.toFixed(5)},${lng.toFixed(5)}`;
  const guardado = doCache(chave);
  if (guardado) return guardado;

  const data = await chamar('/reverse', { lat, lon: lng, zoom: 18, addressdetails: 1 });
  if (!data || data.error) return null;

  const resultado = { ...enderecoLegivel(data), latitude: lat, longitude: lng };
  guardarNoCache(chave, resultado);
  return resultado;
}

/** Endereço → coordenadas. É o caminho de quem nega o GPS e digita. */
async function buscar({ termo, limite = 5 }: { termo: string; limite?: number }) {
  const consulta = String(termo || '').trim();
  if (consulta.length < 4) return [];

  const chave = `b:${consulta.toLowerCase()}`;
  const guardado = doCache(chave);
  if (guardado) return guardado;

  const data = await chamar('/search', {
    q: consulta,
    addressdetails: 1,
    limit: Math.min(Number(limite) || 5, 8),
    countrycodes: 'br'
  });

  const resultados = (Array.isArray(data) ? data : []).map((item) => ({
    ...enderecoLegivel(item),
    latitude: Number(item.lat),
    longitude: Number(item.lon)
  })).filter((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude));

  guardarNoCache(chave, resultados);
  return resultados;
}

export {
  reverso,
  buscar,
  enderecoLegivel
};
