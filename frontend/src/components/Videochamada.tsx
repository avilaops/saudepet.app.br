import { useEffect, useRef, useState } from 'react'
import { iniciarGravacao, type Gravacao } from '../lib/gravacaoDaChamada'
import api from '../services/api'
import { useSocket } from '../contexts/SocketContext'
import { abrirChamada, type Chamada, type EstadoDaChamada } from '../lib/videochamada'
import { Icon } from './ui/AppKit'

type Props = {
  atendimentoId: string
  /** Muda o texto e contexto: quem chama e quem atende esperam coisas diferentes. */
  papel: 'tutor' | 'veterinario'
}

export default function Videochamada({ atendimentoId, papel }: Props) {
  const { socket } = useSocket() as { socket: Parameters<typeof abrirChamada>[0]['socket'] | null }
  const [config, setConfig] = useState<{ pode_chamar: boolean; iceServers: RTCIceServer[]; tem_retransmissao: boolean } | null>(null)
  const [estado, setEstado] = useState<EstadoDaChamada>('ocioso')
  const [erro, setErro] = useState('')
  const [microfoneLigado, setMicrofoneLigado] = useState(true)
  const [cameraLigada, setCameraLigada] = useState(true)
  const [iniciando, setIniciando] = useState(false)

  const [fluxoLocal, setFluxoLocal] = useState<MediaStream | null>(null)
  const [fluxoRemoto, setFluxoRemoto] = useState<MediaStream | null>(null)

  const gravacaoRef = useRef<Gravacao | null>(null)
  const chamadaRef = useRef<Chamada | null>(null)
  const videoLocalRef = useRef<HTMLVideoElement | null>(null)
  const videoRemotoRef = useRef<HTMLVideoElement | null>(null)

  const outro = papel === 'tutor' ? 'veterinário' : 'tutor'

  useEffect(() => {
    let vigente = true
    api.get(`/v1/solicitacoes/${atendimentoId}/chamada`)
      .then(({ data }) => { if (vigente) setConfig(data) })
      .catch(() => { if (vigente) setConfig(null) })
    return () => { vigente = false }
  }, [atendimentoId])

  // Desliga faixas de mídia e encerra chamada ao desmontar o componente
  useEffect(() => () => {
    gravacaoRef.current?.encerrar().catch(() => {})
    chamadaRef.current?.encerrar()
    fluxoLocal?.getTracks().forEach((t) => t.stop())
  }, [fluxoLocal])

  // Vincula o fluxo local ao elemento <video> assim que ele for montado no DOM
  useEffect(() => {
    const el = videoLocalRef.current
    if (el && fluxoLocal) {
      el.srcObject = fluxoLocal
      el.muted = true
      el.setAttribute('playsinline', 'true')
      el.play().catch((err) => console.warn('Aviso ao dar play no vídeo local:', err))
    }
  }, [fluxoLocal, estado])

  // Vincula o fluxo remoto ao elemento <video> assim que recebido
  useEffect(() => {
    const el = videoRemotoRef.current
    if (el && fluxoRemoto) {
      el.srcObject = fluxoRemoto
      el.setAttribute('playsinline', 'true')
      el.play().catch((err) => console.warn('Aviso ao dar play no vídeo remoto:', err))
    }
  }, [fluxoRemoto, estado])

  if (!config?.pode_chamar) return null

  const iniciar = async () => {
    if (!socket) {
      setErro('Sem conexão em tempo real. Verifique sua internet e recarregue a página.')
      return
    }
    setErro('')
    setIniciando(true)

    try {
      chamadaRef.current = await abrirChamada({
        socket,
        atendimentoId,
        iceServers: config.iceServers,
        aoMudarEstado: (novoEstado) => {
          setEstado(novoEstado)
          if (novoEstado === 'falhou' || novoEstado === 'encerrada') {
            setIniciando(false)
          }
        },
        aoObterVideoLocal: (fluxo) => {
          setFluxoLocal(fluxo)
        },
        aoReceberVideo: (fluxo) => {
          setFluxoRemoto(fluxo)

          if (!gravacaoRef.current && fluxoLocal) {
            iniciarGravacao({
              atendimentoId,
              fluxoLocal,
              fluxoRemoto: fluxo
            })
              .then((g) => { gravacaoRef.current = g })
              .catch(() => {})
          }
        },
        aoFalhar: (msg) => {
          setErro(msg)
          setIniciando(false)
        }
      })
      setMicrofoneLigado(true)
      setCameraLigada(true)
    } catch {
      // Erro entregue por aoFalhar
    } finally {
      setIniciando(false)
    }
  }

  const encerrar = () => {
    gravacaoRef.current?.encerrar().catch(() => {})
    gravacaoRef.current = null
    chamadaRef.current?.encerrar()
    chamadaRef.current = null
    fluxoLocal?.getTracks().forEach((t) => t.stop())
    setFluxoLocal(null)
    setFluxoRemoto(null)
    setEstado('ocioso')
  }

  const alternarMicrofone = () => {
    if (chamadaRef.current) {
      const ligado = chamadaRef.current.alternarMicrofone()
      setMicrofoneLigado(ligado)
    }
  }

  const [modoCamera, setModoCamera] = useState<'user' | 'environment'>('user')
  const [trocandoCamera, setTrocandoCamera] = useState(false)

  const alternarCamera = () => {
    if (chamadaRef.current) {
      const ligada = chamadaRef.current.alternarCamera()
      setCameraLigada(ligada)
    }
  }

  const alternarDispositivoCamera = async () => {
    if (chamadaRef.current && !trocandoCamera) {
      setTrocandoCamera(true)
      try {
        const novoModo = await chamadaRef.current.alternarCameraDispositivo()
        setModoCamera(novoModo)
      } finally {
        setTrocandoCamera(false)
      }
    }
  }

  const emAndamento =
    estado === 'chamando' || estado === 'conectando' || estado === 'em_chamada' || estado === 'reconectando'

  const emChamadaAoVivo = estado === 'em_chamada' && Boolean(fluxoRemoto)

  return (
    <section className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon name="camera" size={15} />
          </span>
          <h3 className="text-[0.86rem] font-semibold text-ink">Teleorientação por vídeo</h3>
        </div>
        {estado !== 'ocioso' && (
          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[0.68rem] font-semibold ${
            emChamadaAoVivo
              ? 'bg-emerald-50 text-emerald-700'
              : estado === 'reconectando'
              ? 'bg-amber-50 text-amber-700'
              : 'bg-teal-50 text-teal-700'
          }`}>
            <span className={`h-1.5 w-1.5 rounded-full ${emChamadaAoVivo ? 'bg-emerald-500 animate-ping' : 'bg-primary'}`} />
            {emChamadaAoVivo
              ? 'Ao vivo'
              : estado === 'chamando'
              ? `Aguardando ${outro}`
              : estado === 'conectando'
              ? 'Conectando…'
              : estado === 'reconectando'
              ? 'Reconectando…'
              : estado}
          </span>
        )}
      </div>

      <p className="mt-1 flex items-center gap-1.5 text-[0.68rem] text-slate-400">
        <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" aria-hidden="true" />
        Esta teleorientação é gravada para auditoria e segurança médica.
      </p>

      {erro && (
        <div className="mt-2.5 rounded-xl border border-red-200 bg-red-50 p-3 text-[0.74rem] text-red-700" role="alert">
          <p className="font-semibold">Atenção ao acesso de vídeo:</p>
          <p className="mt-0.5 leading-relaxed">{erro}</p>
        </div>
      )}

      {emAndamento ? (
        <>
          <div className="relative mt-3 h-72 w-full overflow-hidden rounded-2xl bg-slate-950 shadow-inner">
            {/* Vídeo remoto (quando ambos estão conectados) */}
            <video
              ref={videoRemotoRef}
              autoPlay
              playsInline
              className={`h-full w-full object-cover ${emChamadaAoVivo ? 'block' : 'hidden'}`}
            />

            {/* Vídeo local: tela inteira enquanto aguarda, miniatura (PiP) quando em chamada com o outro */}
            <div className={
              emChamadaAoVivo
                ? 'absolute bottom-3 right-3 h-28 w-22 sm:h-32 sm:w-24 overflow-hidden rounded-2xl border-2 border-white/90 bg-slate-800 shadow-2xl transition-all'
                : 'h-full w-full'
            }>
              <video
                ref={videoLocalRef}
                autoPlay
                playsInline
                muted
                className={`h-full w-full object-cover ${cameraLigada ? 'block' : 'hidden'}`}
              />
              {!cameraLigada && (
                <div className="flex h-full w-full items-center justify-center bg-slate-800 text-slate-400">
                  <Icon name="camera" size={20} />
                </div>
              )}
            </div>

            {/* Mensagem flutuante enquanto aguarda o outro participante */}
            {!emChamadaAoVivo && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 p-4 text-center backdrop-blur-[1px]">
                <div className="mb-2.5 flex h-10 w-10 items-center justify-center rounded-full bg-primary/25 text-white">
                  <span className="h-3 w-3 rounded-full bg-primary animate-ping" />
                </div>
                <p className="text-[0.84rem] font-semibold text-white">
                  {estado === 'conectando'
                    ? `Conectando com o ${outro}…`
                    : `Sua câmera está ativa. Aguardando o ${outro} entrar…`}
                </p>
                <p className="mt-1 text-[0.7rem] text-slate-300">
                  Assim que o {outro} abrir a tela, a conversa começará automaticamente.
                </p>
              </div>
            )}
          </div>

          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
            <button
              type="button"
              onClick={alternarMicrofone}
              className={`flex items-center justify-center gap-1.5 rounded-xl border px-2.5 py-2.5 text-[0.74rem] font-semibold transition ${
                microfoneLigado
                  ? 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  : 'border-amber-200 bg-amber-50 text-amber-800'
              }`}
            >
              <Icon name="bell" size={14} />
              {microfoneLigado ? 'Mutar áudio' : 'Ativar áudio'}
            </button>

            <button
              type="button"
              onClick={alternarCamera}
              className={`flex items-center justify-center gap-1.5 rounded-xl border px-2.5 py-2.5 text-[0.74rem] font-semibold transition ${
                cameraLigada
                  ? 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  : 'border-amber-200 bg-amber-50 text-amber-800'
              }`}
            >
              <Icon name="camera" size={14} />
              {cameraLigada ? 'Pausar vídeo' : 'Ligar vídeo'}
            </button>

            <button
              type="button"
              onClick={alternarDispositivoCamera}
              disabled={trocandoCamera || !cameraLigada}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-2.5 text-[0.74rem] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition"
              title="Trocar entre câmera frontal e traseira para mostrar o pet"
            >
              <Icon name="spark" size={14} />
              {trocandoCamera ? 'Trocando…' : modoCamera === 'user' ? 'Ver pet (traseira)' : 'Frontal'}
            </button>

            <button
              type="button"
              onClick={encerrar}
              className="flex items-center justify-center gap-1 rounded-xl bg-red-600 px-3 py-2.5 text-[0.74rem] font-semibold text-white shadow-sm transition hover:bg-red-700 active:scale-95"
            >
              <Icon name="close" size={14} />
              Encerrar
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="mt-2 text-[0.75rem] leading-relaxed text-slate-500">
            {papel === 'tutor'
              ? 'Conecte-se por vídeo com o veterinário em tempo real. Deixe o pet por perto para facilitar a avaliação.'
              : 'Inicie a chamada de vídeo quando estiver pronto. O tutor entrará automaticamente assim que abrir a sessão.'}
          </p>

          <button
            type="button"
            onClick={iniciar}
            disabled={iniciando}
            className="mt-3.5 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-[0.82rem] font-semibold text-white shadow-sm transition hover:bg-[#127e82] active:scale-[0.99] disabled:opacity-60"
          >
            <Icon name="camera" size={17} />
            {iniciando
              ? 'Solicitando permissão de câmera…'
              : estado === 'encerrada' || estado === 'falhou'
              ? 'Chamar de novo'
              : 'Entrar na chamada de vídeo'}
          </button>

          {!config.tem_retransmissao && (
            <p className="mt-2 text-[0.67rem] leading-relaxed text-slate-400">
              Caso sua rede bloqueie conexão direta ponto a ponto (P2P), o chat em texto com envio de fotos continua ativo nesta tela.
            </p>
          )}
        </>
      )}
    </section>
  )
}

