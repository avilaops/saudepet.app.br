/**
 * Distância entre tutor e veterinário.
 *
 * A landing e o FAQ prometem "o profissional verificado mais próximo
 * disponível", mas até 20/08/2026 o despacho era um broadcast para TODOS os
 * veterinários do tenant, e a única aproximação de proximidade era um filtro
 * no navegador comparando o NOME da cidade por igualdade exata
 * (`solicitacao.tutor.cidade === user.cidade`) — "São Paulo" e "Sao Paulo"
 * eram cidades diferentes, e um vet do outro extremo do estado recebia o
 * mesmo chamado que o vizinho da esquina.
 *
 * As coordenadas já existiam nos dois lados: `Veterinario.latitude/longitude`
 * são gravadas quando o profissional entra em plantão e
 * `Solicitacao.latitude/longitude` quando o tutor pede. Faltava alguém fazer
 * a conta — e `CidadeCobertura.raio_atendimento_km`, que o admin configura na
 * tela de cidades, nunca era lido por ninguém.
 */

const RAIO_TERRA_KM = 6371;
// Usado quando a cidade do tutor não tem cobertura cadastrada.
const RAIO_PADRAO_KM = 20;

const rad = (graus: number) => (graus * Math.PI) / 180;

/**
 * `Number(null)` é 0 e `Number('')` também — sem esta guarda, um veterinário
 * sem GPS seria tratado como se estivesse na latitude 0 (golfo da Guiné) e
 * receberia uma distância plausível e completamente falsa.
 */
const paraCoordenada = (valor: unknown): number => {
  if (valor === null || valor === undefined || valor === '') return NaN;
  return Number(valor);
};

/**
 * Distância em km pela fórmula de Haversine.
 * @returns {number|null} `null` quando falta qualquer coordenada.
 */
function distanciaKm(
  latA: unknown,
  lonA: unknown,
  latB: unknown,
  lonB: unknown
): number | null {
  const nums = [latA, lonA, latB, lonB].map(paraCoordenada);
  if (!nums.every(Number.isFinite)) return null;
  const [lat1, lon1, lat2, lon2] = nums;

  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Number((RAIO_TERRA_KM * c).toFixed(2));
}

/**
 * Ordena candidatos do mais perto para o mais longe.
 *
 * Quem está sem coordenada NÃO é descartado — vai para o fim da fila. Um
 * veterinário que entrou em plantão sem dar permissão de localização
 * continua atendendo; ele só perde a preferência de quem está perto.
 */
function ordenarPorDistancia<T extends Record<string, any>>(itens: T[], chave = 'distancia_km'): T[] {
  return [...itens].sort((a, b) => {
    const da = a[chave];
    const db = b[chave];
    if (da == null && db == null) return 0;
    if (da == null) return 1;
    if (db == null) return -1;
    return da - db;
  });
}

/**
 * Está dentro do raio de atendimento?
 * Sem distância conhecida a resposta é `true`: é melhor um chamado chegar a
 * mais gente do que ficar sem ninguém por falta de GPS.
 */
function dentroDoRaio(distancia: number | null | undefined, raioKm: number = RAIO_PADRAO_KM): boolean {
  if (distancia == null) return true;
  return distancia <= raioKm;
}

/** Rótulo curto para a tela: "1,2 km" / "850 m" / "distância não informada". */
function rotuloDistancia(distancia: number | null | undefined): string | null {
  if (distancia == null) return 'distância não informada';
  if (distancia < 1) return `${Math.round(distancia * 1000)} m`;
  return `${distancia.toFixed(1).replace('.', ',')} km`;
}

export {
  distanciaKm,
  ordenarPorDistancia,
  dentroDoRaio,
  rotuloDistancia,
  RAIO_PADRAO_KM
};
