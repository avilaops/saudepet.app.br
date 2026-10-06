import { useEffect, useRef, useState } from 'react'
import api from '../../services/api'
import { VetIcon } from './VetUI'
import type { ApiPayload } from '../../types/api'

/**
 * Ditar o prontuário em vez de digitar.
 *
 * ── Por que isto existe ───────────────────────────────────────────────────
 *
 * O `POST /veterinarios/prontuario-ia-parse` e o `prontuario-ia.service`
 * inteiro já estavam prontos e em produção, com a chave da OpenAI configurada:
 * o serviço recebe o relato falado e devolve queixa, exame físico, hipótese,
 * prescrições, exames, alergias, orientações e retorno, tudo estruturado.
 * Só que nenhuma tela chamava esse endereço. Era um recurso construído, pago
 * e invisível.
 *
 * O fim do atendimento é o pior momento para digitar: o veterinário está na
 * casa do tutor, muitas vezes de pé, com o animal ainda por perto.
 *
 * ── De onde vem o texto ───────────────────────────────────────────────────
 *
 * A primeira versão usava o reconhecimento de fala do navegador
 * (`SpeechRecognition`): rápido, mas ausente no Firefox e instável no iOS —
 * exatamente os dois ambientes que um veterinário em atendimento domiciliar
 * mais usa. Agora a gravação vai para `POST /solicitacoes/:id/ditar-prontuario`,
 * que transcreve com faster-whisper rodando em infraestrutura própria: mesma
 * cobertura de navegador do resto do app, sem depender de uma API do
 * fabricante do browser, sem custo por minuto. A caixa de texto continua
 * sempre disponível, para quem prefere escrever ou colar uma transcrição de
 * outro lugar.
 *
 * ── A regra que não muda ──────────────────────────────────────────────────
 *
 * A IA PREENCHE, o veterinário CONFERE E ASSINA. Nada é enviado direto: o
 * resultado cai nos campos do formulário, que continuam editáveis, e o
 * atendimento só fecha quando ele mesmo confirma. Prontuário e receita são
 * documentos com responsabilidade técnica, e o CRMV é dele.
 */

/** Formatos por ordem de preferência; o primeiro que o navegador aceitar vence. */
const FORMATOS = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus'
]

function formatoSuportado(): string | null {
  const MR = (window as ApiPayload).MediaRecorder
  if (!MR) return null
  for (const formato of FORMATOS) {
    if (typeof MR.isTypeSupported !== 'function' || MR.isTypeSupported(formato)) return formato
  }
  return null
}

export default function DitarProntuario({ atendimentoId, aoEstruturar }: { atendimentoId: string; aoEstruturar: (dados: ApiPayload) => void }) {
  const [aberto, setAberto] = useState(false)
  const [gravando, setGravando] = useState(false)
  const [transcrevendo, setTranscrevendo] = useState(false)
  const [texto, setTexto] = useState('')
  const [processando, setProcessando] = useState(false)
  const [erro, setErro] = useState('')
  const gravadorRef = useRef<MediaRecorder | null>(null)
  const pedacosRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)

  const temGravador = typeof window !== 'undefined' && Boolean(window.MediaRecorder)

  // Sair da tela com o microfone ligado deixaria a captura viva.
  useEffect(() => () => {
    gravadorRef.current?.state !== 'inactive' && gravadorRef.current?.stop()
    streamRef.current?.getTracks().forEach((faixa) => faixa.stop())
  }, [])

  const pararFaixas = () => {
    streamRef.current?.getTracks().forEach((faixa) => faixa.stop())
    streamRef.current = null
  }

  const gravar = async () => {
    setErro('')
    const formato = formatoSuportado()
    if (!formato) {
      setErro('Este navegador não grava áudio. Escreva ou cole o relato no campo abaixo.')
      return
    }

    let fluxo: MediaStream
    try {
      fluxo = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setErro('O microfone está bloqueado. Libere nas permissões do site, no cadeado ao lado do endereço.')
      return
    }

    streamRef.current = fluxo
    pedacosRef.current = []
    const gravador = new MediaRecorder(fluxo, { mimeType: formato })

    gravador.ondataavailable = (evento) => {
      if (evento.data && evento.data.size > 0) pedacosRef.current.push(evento.data)
    }

    gravador.onstop = async () => {
      pararFaixas()
      const pedaco = new Blob(pedacosRef.current, { type: formato })
      pedacosRef.current = []

      if (pedaco.size === 0) return

      setTranscrevendo(true)
      const corpo = new FormData()
      corpo.append('audio', pedaco, 'ditado.webm')

      try {
        const { data } = await api.post(`/v1/solicitacoes/${atendimentoId}/ditar-prontuario`, corpo, {
          headers: { 'Content-Type': 'multipart/form-data' }
        })
        const transcrito = String(data?.rascunho?.texto || '').trim()
        if (transcrito) {
          setTexto((atual) => (atual ? `${atual} ${transcrito}` : transcrito))
        } else {
          setErro('Não entendi nada no áudio. Tente falar mais perto do microfone.')
        }
      } catch (falha: ApiPayload) {
        setErro(falha?.response?.data?.erro || 'Não foi possível transcrever o áudio. Você pode escrever no campo abaixo.')
      } finally {
        setTranscrevendo(false)
      }
    }

    gravadorRef.current = gravador
    gravador.start()
    setGravando(true)
  }

  const parar = () => {
    if (gravadorRef.current && gravadorRef.current.state !== 'inactive') {
      gravadorRef.current.stop()
    }
    setGravando(false)
  }

  const estruturar = async () => {
    const relato = texto.trim()
    if (!relato) {
      setErro('Escreva ou dite o relato antes de estruturar.')
      return
    }

    setProcessando(true)
    setErro('')
    try {
      const { data } = await api.post('/v1/veterinarios/prontuario-ia-parse', { texto: relato })
      aoEstruturar(data?.dados || {})
      setAberto(false)
      setTexto('')
    } catch (falha: ApiPayload) {
      setErro(falha?.response?.data?.error || 'Não foi possível estruturar o relato. Tente de novo ou preencha à mão.')
    } finally {
      setProcessando(false)
    }
  }

  if (!aberto) {
    return (
      <button type="button" className="vet-button--ghost vet-ditado-abrir" onClick={() => setAberto(true)}>
        <VetIcon name="message" size={17} />
        Ditar o atendimento
      </button>
    )
  }

  return (
    <section className="vet-card vet-ditado">
      <header className="vet-ditado__topo">
        <div>
          <strong>Ditar o atendimento</strong>
          <small>Fale como você contaria a um colega. Os campos abaixo são preenchidos e ficam editáveis.</small>
        </div>
        <button type="button" className="vet-icon-button" onClick={() => { parar(); setAberto(false) }} aria-label="Fechar ditado">
          <VetIcon name="close" size={18} />
        </button>
      </header>

      {temGravador && (
        <button
          type="button"
          className={`vet-ditado__microfone ${gravando ? 'is-ouvindo' : ''}`}
          onClick={gravando ? parar : gravar}
          disabled={processando || transcrevendo}
        >
          <VetIcon name={gravando ? 'power' : 'message'} size={20} />
          {gravando ? 'Parar de gravar' : transcrevendo ? 'Transcrevendo…' : 'Começar a falar'}
        </button>
      )}

      <textarea
        className="input vet-ditado__texto"
        value={texto}
        onChange={(evento) => setTexto(evento.target.value)}
        placeholder={temGravador
          ? 'Grave um áudio ou escreva/cole o relato aqui.'
          : 'Escreva ou cole aqui o relato do atendimento.'}
        rows={7}
        disabled={processando || transcrevendo}
      />

      {!temGravador && (
        <p className="vet-ditado__aviso">
          Este navegador não grava áudio. Escreva ou cole o relato acima que a estruturação funciona igual.
        </p>
      )}

      {erro && <p className="vet-ditado__erro" role="alert">{erro}</p>}

      <div className="vet-ditado__acoes">
        <button type="button" className="vet-button--primary" onClick={estruturar} disabled={processando || transcrevendo || !texto.trim()}>
          {processando ? 'Estruturando…' : 'Preencher o prontuário'}
        </button>
        <small>Confira tudo antes de finalizar. A assinatura do documento é sua.</small>
      </div>
    </section>
  )
}
