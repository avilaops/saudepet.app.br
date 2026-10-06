import api from '../services/api'

/**
 * Grava a chamada, do lado de cá, e sobe em pedaços enquanto ela acontece.
 *
 * Toda teleorientação é gravada para auditoria interna. Nem o tutor nem o
 * veterinário ouvem o resultado: quem lê é a moderação, com motivo registrado.
 * O que este arquivo faz é só produzir e entregar.
 *
 * ── Por que os DOIS lados gravam ─────────────────────────────────────────
 *
 * Cada aparelho grava a conversa inteira (a própria voz misturada à do outro).
 * São duas gravações por chamada, de propósito: se um navegador fecha no meio,
 * a do outro lado sobrevive. Numa apuração de conduta, perder metade é perder
 * tudo.
 *
 * ── Por que em pedaços ───────────────────────────────────────────────────
 *
 * Um arquivo único enviado no fim significa que celular que desliga, aba que
 * fecha ou rede que cai levam a gravação junto — justamente nas chamadas
 * atribuladas, que são as que geram denúncia. Um trecho a cada 15 s garante
 * que o que já foi dito já está guardado.
 *
 * ── Melhor esforço, sempre ───────────────────────────────────────────────
 *
 * Nada aqui pode derrubar a chamada. Navegador sem `MediaRecorder`, upload que
 * falha, permissão negada: a consulta continua. Uma gravação perdida é um
 * problema; uma consulta interrompida porque a gravação falhou é pior.
 */

/** Um trecho a cada 15 s: perde-se no máximo isso num desligamento seco. */
const INTERVALO_DO_TRECHO_MS = 15_000

/** Formatos por ordem de preferência; o primeiro que o navegador aceitar vence. */
const FORMATOS = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus'
]

export type Gravacao = {
  encerrar: () => Promise<void>
}

function formatoSuportado(): string | null {
  const MR: any = (window as any).MediaRecorder
  if (!MR) return null
  for (const formato of FORMATOS) {
    if (typeof MR.isTypeSupported !== 'function' || MR.isTypeSupported(formato)) return formato
  }
  return null
}

/**
 * Mistura as vozes dos dois lados numa trilha só.
 *
 * Sem isso, gravar `fluxoLocal` capturaria apenas quem está deste lado — e uma
 * apuração com metade do diálogo não apura nada. O `AudioContext` soma as duas
 * fontes numa saída única, que é o que vai para o arquivo.
 */
function misturarVozes(local: MediaStream, remoto: MediaStream | null): { trilha: MediaStream; fechar: () => void } {
  const Contexto: any = (window as any).AudioContext || (window as any).webkitAudioContext
  const temRemoto = Boolean(remoto?.getAudioTracks().length)

  // Sem AudioContext ou sem o outro lado ainda, grava o que dá.
  if (!Contexto || !temRemoto) {
    return { trilha: local, fechar: () => {} }
  }

  const contexto = new Contexto()
  const destino = contexto.createMediaStreamDestination()

  for (const fonte of [local, remoto as MediaStream]) {
    if (fonte.getAudioTracks().length) {
      contexto.createMediaStreamSource(fonte).connect(destino)
    }
  }

  return {
    trilha: destino.stream,
    fechar: () => { contexto.close().catch(() => {}) }
  }
}

export async function iniciarGravacao({
  atendimentoId,
  fluxoLocal,
  fluxoRemoto
}: {
  atendimentoId: string
  fluxoLocal: MediaStream
  fluxoRemoto: MediaStream | null
}): Promise<Gravacao | null> {
  const formato = formatoSuportado()
  if (!formato) {
    console.warn('[GRAVAÇÃO] Este navegador não grava; a chamada segue sem registro.')
    return null
  }

  let gravacaoId: string
  let indice: number
  try {
    const { data } = await api.post(`/v1/solicitacoes/${atendimentoId}/chamada/gravacao`)
    gravacaoId = data.id
    indice = Number(data.indiceProximo) || 0
  } catch (erro) {
    console.warn('[GRAVAÇÃO] Não foi possível abrir a gravação; a chamada segue.', erro)
    return null
  }

  const { trilha, fechar } = misturarVozes(fluxoLocal, fluxoRemoto)
  const gravador = new (window as any).MediaRecorder(trilha, { mimeType: formato })

  const iniciadaEm = Date.now()
  // Os envios entram em fila: dois trechos subindo ao mesmo tempo podem chegar
  // fora de ordem, e o índice é o que remonta o áudio.
  let fila: Promise<unknown> = Promise.resolve()

  const enviarTrecho = (pedaco: Blob, numero: number) => {
    const corpo = new FormData()
    corpo.append('trecho', pedaco, `${numero}.webm`)
    corpo.append('indice', String(numero))

    fila = fila
      .then(() => api.post(`/v1/chamada/gravacao/${gravacaoId}/parte`, corpo))
      // Trecho perdido não interrompe os seguintes: melhor uma gravação com um
      // buraco do que uma gravação que para no primeiro soluço de rede.
      .catch((erro) => console.warn(`[GRAVAÇÃO] Trecho ${numero} não subiu.`, erro))
  }

  gravador.ondataavailable = (evento: any) => {
    if (evento.data && evento.data.size > 0) enviarTrecho(evento.data, indice++)
  }

  gravador.start(INTERVALO_DO_TRECHO_MS)

  return {
    encerrar: async () => {
      try {
        if (gravador.state !== 'inactive') gravador.stop()
      } catch {
        // Gravador já parado: nada a fazer.
      }

      fechar()

      // O `stop` produz o último trecho de forma assíncrona; sem esta espera, o
      // pedaço final às vezes fica para trás.
      await new Promise((r) => setTimeout(r, 400))
      await fila.catch(() => {})

      await api
        .post(`/v1/chamada/gravacao/${gravacaoId}/finalizar`, {
          duracao_seg: Math.round((Date.now() - iniciadaEm) / 1000)
        })
        // Se o fechamento não chegar, a varredura do servidor fecha depois como
        // `interrompida` — o material já guardado continua valendo.
        .catch(() => {})
    }
  }
}
