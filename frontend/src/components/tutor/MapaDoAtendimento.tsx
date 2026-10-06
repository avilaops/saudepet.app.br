import type { ApiPayload } from '../../types/api'
import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import api from '../../services/api'
import { camadaBase, moverSuave, pinoDeLocal, pinoDeVeterinario } from '../../lib/mapa'

/**
 * Onde o atendimento acontece e onde está o veterinário.
 *
 * A tela de acompanhamento tinha só um link "ver posição no mapa" que jogava a
 * pessoa para fora do aplicativo, no Google Maps, com um pino solto e sem o
 * destino — inútil justamente no momento em que ela quer saber "está longe
 * ainda?". O backend já emitia `vet:location_update` na sala do atendimento;
 * faltava desenhar.
 */

// Os dois pinos da marca: o endereço fica parado, o veterinário pulsa e
// desliza. Um relance na tela precisa bastar para saber quem é quem.
const PINO_DESTINO = pinoDeLocal({ largura: 32, titulo: 'Seu endereço' })
const PINO_VET = pinoDeVeterinario()

/** Distância em linha reta. É o que dá para afirmar sem serviço de rotas. */
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

export default function MapaDoAtendimento({ destino, veterinario, className = '' }: ApiPayload) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapaRef = useRef<L.Map | null>(null)
  const destinoRef = useRef<L.Marker | null>(null)
  const vetRef = useRef<L.Marker | null>(null)
  const trajetoRef = useRef<L.Polyline | null>(null)
  // Rota por rua e tempo de deslocamento. A linha reta continua como reserva:
  // se o serviço de rotas não responder, a tela não fica sem resposta.
  const [rota, setRota] = useState<ApiPayload | null>(null)

  useEffect(() => {
    if (mapaRef.current || !containerRef.current || !destino?.latitude) return undefined

    const mapa = L.map(containerRef.current, {
      zoomControl: false,
      // O mapa aqui é informativo: quem quiser navegar abre o app de mapas.
      // Travar o gesto evita o dedo prender a rolagem da página no celular.
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      touchZoom: false
    }).setView([destino.latitude, destino.longitude], 15)

    camadaBase(mapa)

    destinoRef.current = L.marker([destino.latitude, destino.longitude], { icon: PINO_DESTINO }).addTo(mapa)
    mapaRef.current = mapa
    setTimeout(() => mapa.invalidateSize(), 80)

    return () => {
      mapa.remove()
      mapaRef.current = null
      destinoRef.current = null
      vetRef.current = null
    }
  }, [destino?.latitude, destino?.longitude])

  // Rota por rua entre o veterinário e o endereço. Recalcula conforme ele se
  // move — o serviço agrupa consultas próximas, então seguir o deslocamento não
  // vira uma consulta por metro.
  useEffect(() => {
    if (!veterinario?.latitude || !destino?.latitude) {
      setRota(null)
      return
    }

    let vigente = true
    api.get('/v1/geo/rota', {
      params: {
        de: `${veterinario.latitude},${veterinario.longitude}`,
        para: `${destino.latitude},${destino.longitude}`
      }
    })
      .then(({ data }) => { if (vigente) setRota(data.rota || null) })
      .catch(() => { if (vigente) setRota(null) })

    return () => { vigente = false }
  }, [veterinario?.latitude, veterinario?.longitude, destino?.latitude, destino?.longitude])

  // Desenha o trajeto no mapa.
  useEffect(() => {
    const mapa = mapaRef.current
    if (!mapa) return

    if (trajetoRef.current) {
      mapa.removeLayer(trajetoRef.current)
      trajetoRef.current = null
    }

    if (!rota?.geometria?.length) return

    trajetoRef.current = L.polyline(rota.geometria, {
      color: '#159fa3',
      weight: 5,
      opacity: 0.85
    }).addTo(mapa)

    // Enquadra o trajeto inteiro, não só as duas pontas: uma rota que contorna
    // um rio sai da caixa formada pelos extremos.
    if (trajetoRef.current) {
      mapa.fitBounds(trajetoRef.current.getBounds(), { padding: [30, 30], maxZoom: 16 })
    }
  }, [rota])

  // Posição do veterinário: aparece quando ele sai, e o enquadramento abre para
  // caber os dois — é o que responde "está longe ainda?".
  useEffect(() => {
    const mapa = mapaRef.current
    if (!mapa) return

    if (!veterinario?.latitude) {
      if (vetRef.current) {
        mapa.removeLayer(vetRef.current)
        vetRef.current = null
      }
      return
    }

    const ponto: L.LatLngTuple = [veterinario.latitude, veterinario.longitude]
    if (vetRef.current) {
      moverSuave(vetRef.current, ponto)
    } else {
      vetRef.current = L.marker(ponto, { icon: PINO_VET }).addTo(mapa)
    }

    // Só enquadra pelos dois pontos quando não há trajeto desenhado — senão as
    // duas regras brigam e o mapa fica pulando.
    if (destino?.latitude && !trajetoRef.current) {
      mapa.fitBounds(L.latLngBounds([[destino.latitude, destino.longitude], ponto]), {
        padding: [40, 40],
        maxZoom: 16
      })
    }
  }, [veterinario?.latitude, veterinario?.longitude, destino?.latitude, destino?.longitude])

  if (!destino?.latitude) return null

  return (
    <div className={className}>
      <div className="overflow-hidden rounded-2xl border border-slate-200">
        <div ref={containerRef} className="h-44 w-full bg-slate-100" aria-label="Mapa do atendimento" />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.7rem] text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-primary" /> Seu endereço
        </span>
        {veterinario?.latitude && (
          <>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-orange-500" /> Veterinário
            </span>
            {/* Com rota calculada, o tempo é por rua. Sem ela, a linha reta
                continua — e continua dita como linha reta. O que não pode é
                apresentar estimativa como certeza num momento de aflição. */}
            {rota ? (
              <span className="font-semibold text-slate-700">
                cerca de {rota.duracao_min} min · {rota.distancia_km} km de carro
              </span>
            ) : distanciaKm(destino, veterinario) != null ? (
              <span className="font-semibold text-slate-700">
                a {distanciaKm(destino, veterinario)} km daqui, em linha reta
              </span>
            ) : null}
          </>
        )}
      </div>
      {rota?.sem_transito && (
        <p className="mt-1 text-[0.66rem] text-slate-400">
          Tempo estimado pelo trajeto, sem considerar o trânsito.
        </p>
      )}
    </div>
  )
}
