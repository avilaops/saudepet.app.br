import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import './mapa.css'

/**
 * A base dos mapas da plataforma: camada, pinos e movimento.
 *
 * As três telas com mapa — escolher o endereço, acompanhar o atendimento e
 * "para onde ir" do veterinário — desenhavam cada uma o seu próprio pino, e o
 * resultado era uma gota azulada genérica, igual à de qualquer mapa da
 * internet. Num aplicativo de emergência, saber num relance o que é o SEU
 * endereço e o que é o profissional a caminho não é enfeite: é a informação.
 *
 * Aqui os pinos são a marca — o telhado laranja, o escudo verde-água e a cruz
 * — e ficam num lugar só, para as três telas nunca divergirem.
 *
 * A camada de imagens continua sendo a gratuita do OpenStreetMap. As duas
 * variáveis abaixo existem para o dia em que ela deixar de servir (o servidor
 * público da comunidade não é feito para tráfego de aplicativo): trocar de
 * provedor, ou apontar para um nosso, passa a ser uma linha de ambiente, sem
 * tocar em componente nenhum.
 */

const TILES = import.meta.env.VITE_MAPA_TILES
  || 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'

// Crédito com link não é gentileza: é a condição da licença ODbL, que a linha
// anterior — só "© OpenStreetMap", sem destino — não cumpria.
const ATRIBUICAO = import.meta.env.VITE_MAPA_ATRIBUICAO
  || '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>'

type CoresDoPino = { corpo: string; borda: string }

export const CORES: Record<'local' | 'veterinario', CoresDoPino> = {
  local: { corpo: '#159fa3', borda: '#0b5f62' },
  veterinario: { corpo: '#f58235', borda: '#c65316' }
}

/** Camada de imagens, já anexada ao mapa. */
export function camadaBase(mapa: L.Map, { maxZoom = 19 }: { maxZoom?: number } = {}) {
  return L.tileLayer(TILES, { maxZoom, attribution: ATRIBUICAO }).addTo(mapa)
}

/**
 * O pino da marca: gota com o telhado, o escudo e a cruz do símbolo do
 * Saúde Pet, mais a sombra no chão — é a sombra que faz o pino parecer plantado
 * no ponto em vez de flutuando sobre ele.
 */
function desenhoDoPino({ corpo, borda }: CoresDoPino) {
  return `<svg viewBox="0 0 36 50" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <ellipse cx="18" cy="46.6" rx="6.6" ry="2.3" fill="#0b3f42" opacity=".22"/>
    <path d="M18 2C10.27 2 4 8.27 4 16c0 9.9 11.3 25.3 13.2 27.8a1 1 0 0 0 1.6 0C20.7 41.3 32 25.9 32 16 32 8.27 25.73 2 18 2Z"
      fill="${corpo}" stroke="${borda}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M18 7.2 28 15.4H8L18 7.2Z" fill="#fff"/>
    <path d="M10.6 15.4h14.8v7.4a1.4 1.4 0 0 1-1.4 1.4H12a1.4 1.4 0 0 1-1.4-1.4V15.4Z" fill="#fff"/>
    <path d="M16.6 16.4h2.8v6.2h-2.8z" fill="#f58235"/>
    <path d="M14.4 18.1h7.2v2.8h-7.2z" fill="#f58235"/>
  </svg>`
}

/**
 * Pino de lugar (o endereço do atendimento, o ponto que se arrasta ao escolher
 * o local). `largura` em pixels; a altura sai da proporção do desenho, e a
 * âncora fica na ponta da gota — é ela que aponta a coordenada, não o centro.
 */
export function pinoDeLocal({ largura = 34, cores = CORES.local, titulo = 'Local do atendimento' }: {
  largura?: number
  cores?: CoresDoPino
  titulo?: string
} = {}) {
  const altura = Math.round((largura * 50) / 36)
  return L.divIcon({
    className: 'mapa-pino',
    html: `<span role="img" aria-label="${titulo}" style="display:block;width:${largura}px;height:${altura}px">${desenhoDoPino(cores)}</span>`,
    iconSize: [largura, altura],
    // 45/50 do desenho: a ponta da gota, acima da sombra.
    iconAnchor: [Math.round(largura / 2), Math.round(altura * 0.9)]
  })
}

/**
 * Pino do veterinário a caminho: disco laranja com a cruz e um halo que pulsa.
 * O movimento é o que separa "alguém está vindo" de mais um ponto no mapa — e
 * quem pediu ajuda passa boa parte da espera olhando exatamente para isso.
 */
export function pinoDeVeterinario({ titulo = 'Veterinário a caminho' }: { titulo?: string } = {}) {
  return L.divIcon({
    className: 'mapa-pino',
    html: `<span class="mapa-vet" role="img" aria-label="${titulo}">
      <span class="mapa-vet__halo"></span>
      <span class="mapa-vet__disco">
        <svg width="15" height="15" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M6.4 2h3.2v4.4H14v3.2H9.6V14H6.4V9.6H2V6.4h4.4V2Z" fill="#fff"/>
        </svg>
      </span>
    </span>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17]
  })
}

/**
 * Move um marcador deslizando até o ponto novo.
 *
 * O GPS chega em saltos de dezenas de metros; sem isso o veterinário some de
 * uma esquina e reaparece na outra, e a tela parece travada entre uma leitura e
 * a seguinte. A transição em si é CSS (`mapa.css`) — aqui só marcamos quem
 * participa, e nunca no primeiro posicionamento, que não tem de onde vir.
 */
export function moverSuave(marcador: L.Marker, ponto: L.LatLngExpression) {
  const elemento = marcador.getElement?.()
  if (elemento) elemento.classList.add('mapa-suave')
  marcador.setLatLng(ponto)
}

export default { camadaBase, pinoDeLocal, pinoDeVeterinario, moverSuave, CORES }
