import type { ApiPayload } from '../../types/api'
import { useCallback, useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import api from '../../services/api'
import { camadaBase, pinoDeLocal } from '../../lib/mapa'
import { Icon } from '../ui/AppKit'

/**
 * Onde o veterinário deve ir.
 *
 * O passo do endereço era um campo de texto livre — "Rua, número, bairro e
 * cidade..." — e a coordenada do GPS era lida em silêncio no fundo da tela.
 * Ninguém confirmava nada, e se a permissão fosse negada o chamado nascia SEM
 * coordenada: o despacho por proximidade, que usa índice espacial e raio da
 * cidade, ficava sem ponto de partida e voltava a avisar todo mundo de plantão
 * sem distância nenhuma.
 *
 * Aqui o local é decidido à vista: mapa, pino, e o endereço escrito por extenso
 * a partir da coordenada. Quem não autoriza o GPS busca pelo endereço e o pino
 * vai até lá. O complemento (apartamento, bloco, referência) é campo à parte,
 * porque não existe em mapa nenhum e é o que faz a diferença na hora de bater
 * na porta certa.
 */

// O pino é o da marca (`lib/mapa`), maior aqui do que nas outras telas: este é
// o único que se arrasta, e alvo de dedo pede tamanho.
const PINO = pinoDeLocal({ largura: 40, titulo: 'Arraste para ajustar o local' })

const SAO_PAULO = { latitude: -23.5505, longitude: -46.6333 }

export default function SeletorDeLocal({ valor, onChange }: ApiPayload) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapaRef = useRef<L.Map | null>(null)
  const marcadorRef = useRef<L.Marker | null>(null)

  const [buscando, setBuscando] = useState(false)
  const [localizando, setLocalizando] = useState(false)
  const [termo, setTermo] = useState('')
  const [sugestoes, setSugestoes] = useState<ApiPayload[]>([])
  const [aviso, setAviso] = useState('')

  const posicao = valor?.latitude != null && valor?.longitude != null
    ? { latitude: valor.latitude, longitude: valor.longitude }
    : null

  // `onChange` do pai muda a cada render; guardar em ref evita recriar o mapa.
  const onChangeRef = useRef(onChange)
  useEffect(() => { onChangeRef.current = onChange }, [onChange])

  const descreverPonto = useCallback(async (latitude: number, longitude: number) => {
    onChangeRef.current({ latitude, longitude, endereco: 'Buscando endereço…', carregando: true })
    try {
      const { data } = await api.get('/v1/geo/reverso', { params: { lat: latitude, lng: longitude } })
      onChangeRef.current({
        latitude,
        longitude,
        endereco: data.local?.endereco || '',
        cidade: data.local?.cidade || null,
        carregando: false
      })
      setAviso('')
    } catch {
      // Sem o nome da rua o atendimento ainda funciona: o veterinário navega
      // pela coordenada. Melhor um endereço em branco do que travar o chamado.
      onChangeRef.current({ latitude, longitude, endereco: '', carregando: false })
      setAviso('Não conseguimos escrever o endereço deste ponto. Descreva no complemento abaixo.')
    }
  }, [])

  // Monta o mapa uma única vez.
  useEffect(() => {
    if (mapaRef.current || !containerRef.current) return undefined

    const centro = posicao || SAO_PAULO
    const mapa = L.map(containerRef.current, { zoomControl: false, attributionControl: true })
      .setView([centro.latitude, centro.longitude], posicao ? 17 : 12)

    camadaBase(mapa)

    L.control.zoom({ position: 'bottomright' }).addTo(mapa)

    const marcador = L.marker([centro.latitude, centro.longitude], { icon: PINO, draggable: true }).addTo(mapa)

    // Arrastar o pino e tocar no mapa fazem a mesma coisa: é o gesto que a
    // pessoa já conhece de outros aplicativos.
    marcador.on('dragend', () => {
      const { lat, lng } = marcador.getLatLng()
      descreverPonto(lat, lng)
    })
    mapa.on('click', (evento) => {
      marcador.setLatLng(evento.latlng)
      descreverPonto(evento.latlng.lat, evento.latlng.lng)
    })

    mapaRef.current = mapa
    marcadorRef.current = marcador

    // O contêiner às vezes é medido antes de ganhar altura no layout, e o mapa
    // nasce cinza. Um `invalidateSize` no fim do ciclo resolve.
    setTimeout(() => mapa.invalidateSize(), 80)

    return () => {
      mapa.remove()
      mapaRef.current = null
      marcadorRef.current = null
    }
  }, [descreverPonto]) // eslint-disable-line react-hooks/exhaustive-deps

  // Mantém o pino em sincronia quando a posição vem de fora (GPS, busca).
  useEffect(() => {
    if (!mapaRef.current || !marcadorRef.current || !posicao) return
    marcadorRef.current.setLatLng([posicao.latitude, posicao.longitude])
    mapaRef.current.setView([posicao.latitude, posicao.longitude], Math.max(mapaRef.current.getZoom(), 17))
  }, [posicao?.latitude, posicao?.longitude]) // eslint-disable-line react-hooks/exhaustive-deps

  const usarMinhaLocalizacao = () => {
    if (!navigator.geolocation) {
      return setAviso('Este aparelho não informa a localização. Busque pelo endereço abaixo.')
    }
    setLocalizando(true)
    setAviso('')
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocalizando(false)
        descreverPonto(coords.latitude, coords.longitude)
      },
      () => {
        setLocalizando(false)
        // Recusar o GPS não pode ser um beco sem saída: a busca por endereço
        // leva ao mesmo lugar.
        setAviso('Sem acesso à localização. Busque pelo endereço no campo abaixo.')
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    )
  }

  // Padrão de aplicativo de corrida: ao abrir a tela, o mapa já vai para onde a
  // pessoa está. Ficar esperando um toque em "usar minha localização" é pedir
  // trabalho a quem tem um animal passando mal na frente — e era o que
  // acontecia. Se a permissão for negada, nada trava: o aviso explica e a busca
  // por endereço leva ao mesmo lugar.
  const jaPediuOGps = useRef(false)
  useEffect(() => {
    if (jaPediuOGps.current || posicao) return
    jaPediuOGps.current = true
    usarMinhaLocalizacao()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const buscarEndereco = async (event: any) => {
    event?.preventDefault()
    if (termo.trim().length < 4) return
    setBuscando(true)
    setAviso('')
    try {
      const { data } = await api.get('/v1/geo/buscar', { params: { q: termo.trim() } })
      setSugestoes(data.locais || [])
      if ((data.locais || []).length === 0) {
        setAviso('Nenhum endereço encontrado. Tente incluir a cidade.')
      }
    } catch {
      setAviso('Não foi possível buscar o endereço agora.')
    } finally {
      setBuscando(false)
    }
  }

  const escolherSugestao = (local: ApiPayload) => {
    setSugestoes([])
    setTermo('')
    onChangeRef.current({
      latitude: local.latitude,
      longitude: local.longitude,
      endereco: local.endereco,
      cidade: local.cidade,
      carregando: false
    })
  }

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-2xl border border-slate-200">
        <div ref={containerRef} className="h-56 w-full bg-slate-100" aria-label="Mapa do local do atendimento" />
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={usarMinhaLocalizacao}
          disabled={localizando}
          className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-[0.82rem] font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
        >
          <Icon name="pin" size={16} />
          {localizando ? 'Localizando…' : 'Usar minha localização'}
        </button>
      </div>

      <form onSubmit={buscarEndereco} className="flex gap-2">
        <input
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          placeholder="Ou busque: rua, número, cidade"
          className="input flex-1 text-[0.85rem]"
        />
        <button
          type="submit"
          disabled={buscando || termo.trim().length < 4}
          className="rounded-2xl border border-slate-200 px-4 text-[0.82rem] font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
        >
          {buscando ? '…' : 'Buscar'}
        </button>
      </form>

      {sugestoes.length > 0 && (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200">
          {sugestoes.map((local) => (
            <li key={`${local.latitude},${local.longitude}`}>
              <button
                type="button"
                onClick={() => escolherSugestao(local)}
                className="w-full px-4 py-3 text-left text-[0.8rem] text-slate-700 transition hover:bg-slate-50"
              >
                {local.endereco}
              </button>
            </li>
          ))}
        </ul>
      )}

      {aviso && (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[0.75rem] text-amber-800" role="status">
          {aviso}
        </p>
      )}

      <div className={`rounded-2xl border px-4 py-3 ${posicao ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}>
        <span className="text-[0.68rem] font-bold uppercase tracking-wider text-slate-400">
          O veterinário vai até aqui
        </span>
        <p className={`mt-1 text-[0.85rem] font-semibold ${posicao ? 'text-emerald-900' : 'text-slate-400'}`}>
          {valor?.carregando
            ? 'Buscando endereço…'
            : valor?.endereco || (posicao ? 'Ponto marcado no mapa' : 'Nenhum local escolhido ainda')}
        </p>
        {posicao && (
          <p className="mt-0.5 text-[0.7rem] text-slate-400">
            Arraste o pino no mapa se o ponto não estiver exato.
          </p>
        )}
      </div>
    </div>
  )
}
