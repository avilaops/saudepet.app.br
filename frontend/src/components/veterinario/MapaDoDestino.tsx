import type { ApiPayload } from '../../types/api'
import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import { VetIcon } from './VetUI'
import api from '../../services/api'
import { camadaBase, moverSuave, pinoDeLocal, pinoDeVeterinario } from '../../lib/mapa'

/**
 * Para onde o veterinário vai.
 *
 * A tela do atendimento ativo não mostrava o endereço em lugar nenhum — o
 * profissional aceitava o chamado e ficava sem saber onde era, tendo que voltar
 * para a lista ou abrir o chat para perguntar. Agora o destino aparece no mapa,
 * com a distância e o botão que abre o navegador de verdade: quem está indo
 * atender não usa mapa embutido, usa Waze ou Google Maps.
 */

// Mesmos pinos do lado do tutor: o profissional vê no mapa dele exatamente o
// que o cliente está vendo no dele.
const PINO_DESTINO = pinoDeLocal({ largura: 30, titulo: 'Endereço do atendimento' })
const PINO_VET = pinoDeVeterinario({ titulo: 'Você' })

/** Distância em linha reta — honesta sobre o que é: não é distância de rua. */
function distanciaKm(a: ApiPayload, b: ApiPayload) {
  if (!a?.latitude || !b?.latitude) return null
  const R = 6371
  const rad = (grau: number) => (grau * Math.PI) / 180
  const dLat = rad(b.latitude - a.latitude)
  const dLng = rad(b.longitude - a.longitude)
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2
  return Math.round(2 * R * Math.asin(Math.sqrt(h)) * 10) / 10
}

export default function MapaDoDestino({ destino, endereco }: ApiPayload) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapaRef = useRef<L.Map | null>(null)
  const vetRef = useRef<L.Marker | null>(null)
  const [minhaPosicao, setMinhaPosicao] = useState<ApiPayload | null>(null)
  const trajetoRef = useRef<L.Polyline | null>(null)
  // Rota por rua: "3 km em linha reta" não diz se são 8 minutos ou 25.
  const [rota, setRota] = useState<ApiPayload | null>(null)

  useEffect(() => {
    if (mapaRef.current || !containerRef.current || !destino?.latitude) return undefined

    const mapa = L.map(containerRef.current, {
      zoomControl: false,
      // Mapa informativo: quem vai dirigir abre o navegador. Travar o gesto
      // impede o dedo de prender a rolagem da tela.
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      touchZoom: false
    }).setView([destino.latitude, destino.longitude], 15)

    camadaBase(mapa)

    L.marker([destino.latitude, destino.longitude], { icon: PINO_DESTINO }).addTo(mapa)

    mapaRef.current = mapa
    setTimeout(() => mapa.invalidateSize(), 80)

    return () => {
      mapa.remove()
      mapaRef.current = null
      vetRef.current = null
    }
  }, [destino?.latitude, destino?.longitude])

  // A posição do próprio veterinário serve para uma coisa só nesta tela: dizer
  // o quanto falta. Uma leitura basta — o rastreio contínuo já roda na tela do
  // atendimento enquanto ele está a caminho.
  useEffect(() => {
    if (!navigator.geolocation || !destino?.latitude) return
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => setMinhaPosicao({ latitude: coords.latitude, longitude: coords.longitude }),
      () => {},
      { timeout: 8000, maximumAge: 60000 }
    )
  }, [destino?.latitude])

  useEffect(() => {
    if (!minhaPosicao || !destino?.latitude) return undefined

    let vigente = true
    api.get('/v1/geo/rota', {
      params: {
        de: `${minhaPosicao.latitude},${minhaPosicao.longitude}`,
        para: `${destino.latitude},${destino.longitude}`
      }
    })
      .then(({ data }) => { if (vigente) setRota(data.rota || null) })
      .catch(() => { if (vigente) setRota(null) })

    return () => { vigente = false }
  }, [minhaPosicao, destino?.latitude, destino?.longitude])

  // Desenha o trajeto.
  useEffect(() => {
    const mapa = mapaRef.current
    if (!mapa) return

    if (trajetoRef.current) {
      mapa.removeLayer(trajetoRef.current)
      trajetoRef.current = null
    }
    if (!rota?.geometria?.length) return

    trajetoRef.current = L.polyline(rota.geometria, { color: '#159fa3', weight: 5, opacity: 0.85 }).addTo(mapa)
    if (trajetoRef.current) {
      mapa.fitBounds(trajetoRef.current.getBounds(), { padding: [25, 25], maxZoom: 15 })
    }
  }, [rota])

  useEffect(() => {
    const mapa = mapaRef.current
    if (!mapa || !minhaPosicao || !destino?.latitude) return

    const ponto: L.LatLngTuple = [minhaPosicao.latitude, minhaPosicao.longitude]
    if (vetRef.current) moverSuave(vetRef.current, ponto)
    else vetRef.current = L.marker(ponto, { icon: PINO_VET }).addTo(mapa)

    // O trajeto, quando existe, manda no enquadramento.
    if (!trajetoRef.current) {
      mapa.fitBounds(L.latLngBounds([[destino.latitude, destino.longitude], ponto]), {
        padding: [30, 30],
        maxZoom: 15
      })
    }
  }, [minhaPosicao, destino?.latitude, destino?.longitude])

  if (!destino?.latitude) {
    return (
      <section className="vet-card vet-section-card">
        <div className="vet-section-card__title"><VetIcon name="pin" size={18} /><h2>Endereço</h2></div>
        <p className="vet-review-pending">{endereco || 'Endereço não informado neste chamado.'}</p>
      </section>
    )
  }

  const distancia = distanciaKm(minhaPosicao, destino)
  const coordenada = `${destino.latitude},${destino.longitude}`

  return (
    <section className="vet-card vet-section-card">
      <div className="vet-section-card__title">
        <VetIcon name="pin" size={18} />
        <h2>Para onde ir</h2>
        {rota
          ? <span className="vet-status vet-status--confirmed">{rota.duracao_min} min · {rota.distancia_km} km</span>
          : distancia != null && <span className="vet-status">{distancia} km em linha reta</span>}
      </div>

      <div ref={containerRef} style={{ height: '11rem', borderRadius: '.9rem', overflow: 'hidden', background: '#eef2f3' }} />

      {endereco && <p className="vet-review-pending" style={{ marginTop: '.6rem' }}>{endereco}</p>}
      {rota?.sem_transito && (
        <p className="vet-review-pending" style={{ marginTop: '.2rem', fontSize: '.66rem' }}>
          Tempo pelo trajeto, sem considerar o trânsito.
        </p>
      )}

      {/* Quem está indo atender não navega por mapa embutido. */}
      <div className="vet-request__actions" style={{ marginTop: '.6rem' }}>
        <a
          className="vet-button--primary"
          href={`https://www.google.com/maps/dir/?api=1&destination=${coordenada}`}
          target="_blank"
          rel="noreferrer"
        >
          Google Maps
        </a>
        <a
          className="vet-button--ghost"
          href={`https://waze.com/ul?ll=${coordenada}&navigate=yes`}
          target="_blank"
          rel="noreferrer"
        >
          Waze
        </a>
      </div>
    </section>
  )
}
