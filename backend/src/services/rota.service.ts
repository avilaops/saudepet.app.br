import axios from 'axios';

/**
 * Rota por rua e tempo de deslocamento.
 *
 * O mapa mostrava distância em linha reta, dita como tal — honesto, mas pouco
 * útil: quem espera um veterinário quer saber "quanto falta", e 3 km em linha
 * reta podem ser 12 minutos ou 35, dependendo do rio no meio do caminho.
 *
 * Usamos OSRM, que calcula rota real sobre o mapa do OpenStreetMap e não exige
 * chave. O que ele NÃO tem é trânsito: o tempo é de via livre. Por isso tudo
 * aqui e na tela chama isso de estimativa e diz "sem trânsito" — número
 * apresentado como certeza, num momento de aflição, é pior do que número
 * nenhum.
 *
 * `OSRM_URL` permite trocar o servidor (instância própria ou serviço pago com
 * trânsito) sem mexer em mais nada: o formato de resposta é o mesmo.
 */

const OSRM = process.env.OSRM_URL || 'https://router.project-osrm.org';

// O servidor público é uma cortesia da comunidade. Uma consulta por segundo e
// cache agressivo é o mínimo para não abusar — e para não depender dele quando
// estiver lento.
const INTERVALO_MINIMO_MS = 1100;
let ultimaChamada = 0;

const CACHE_MAXIMO = 300;
// Rota entre dois pontos não muda; o que mudaria é o trânsito, que este
// provedor não considera de qualquer forma.
const CACHE_TTL_MS = 60 * 60 * 1000;
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
  if (cache.size >= CACHE_MAXIMO) cache.delete(cache.keys().next().value);
  cache.set(chave, { valor, em: Date.now() });
}

async function esperarAVez() {
  const desde = Date.now() - ultimaChamada;
  if (desde < INTERVALO_MINIMO_MS) {
    await new Promise((resolve) => setTimeout(resolve, INTERVALO_MINIMO_MS - desde));
  }
  ultimaChamada = Date.now();
}

const numero = (valor: unknown): number | null => {
  if (valor === null || valor === undefined || valor === '') return null;
  const convertido = Number(valor);
  return Number.isFinite(convertido) ? convertido : null;
};

/**
 * Rota de carro entre dois pontos.
 *
 * @returns {Promise<null|{distancia_km:number, duracao_min:number, geometria:Array<[number,number]>, sem_transito:boolean}>}
 *          `null` quando não há rota ou o serviço não respondeu — a tela então
 *          continua com a distância em linha reta, que é o que ela já fazia.
 */
type Ponto = { latitude?: unknown; longitude?: unknown } | null | undefined;

async function calcular({ origem, destino }: { origem: Ponto; destino: Ponto }) {
  const oLat = numero(origem?.latitude);
  const oLng = numero(origem?.longitude);
  const dLat = numero(destino?.latitude);
  const dLng = numero(destino?.longitude);

  if (oLat === null || oLng === null || dLat === null || dLng === null) return null;

  // Quatro casas ≈ 11 metros: agrupa as consultas de um veterinário que está se
  // movendo devagar, sem perder precisão útil.
  const chave = `${oLat.toFixed(4)},${oLng.toFixed(4)}>${dLat.toFixed(4)},${dLng.toFixed(4)}`;
  const guardado = doCache(chave);
  if (guardado) return guardado;

  await esperarAVez();

  try {
    const { data } = await axios.get(
      `${OSRM}/route/v1/driving/${oLng},${oLat};${dLng},${dLat}`,
      {
        params: { overview: 'full', geometries: 'geojson', alternatives: false, steps: false },
        timeout: 7000
      }
    );

    const rota = data?.routes?.[0];
    if (!rota) return null;

    const resultado = {
      distancia_km: Math.round((rota.distance / 1000) * 10) / 10,
      duracao_min: Math.max(1, Math.round(rota.duration / 60)),
      // GeoJSON vem [lon, lat]; o mapa desenha [lat, lon]. Convertemos aqui para
      // a tela não precisar saber dessa diferença.
      geometria: (rota.geometry?.coordinates || []).map(([lon, lat]: [number, number]) => [lat, lon]),
      sem_transito: true
    };

    guardarNoCache(chave, resultado);
    return resultado;
  } catch {
    // Serviço fora, lento ou sem rota possível: a tela volta para a linha reta.
    // Um mapa sem rota é bem melhor do que uma tela de erro.
    return null;
  }
}

export {
  calcular
};
