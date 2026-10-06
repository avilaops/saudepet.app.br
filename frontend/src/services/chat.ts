import axios, { type AxiosProgressEvent } from 'axios'
import api from './api'
import type { Mensagem } from '../types/api'

/**
 * Chamadas do chat em um lugar só — a tela do tutor e a do veterinário têm
 * estilos diferentes, mas a conversa é a mesma e as regras não podem divergir.
 */

// Tetos espelhados de `backend/src/middleware/upload.middleware.js`. O servidor
// continua sendo a autoridade; a checagem aqui só evita subir 25MB pelo 4G do
// tutor para receber 400 no fim.
const TAMANHO_MAXIMO_ANEXO = 10 * 1024 * 1024
const TAMANHO_MAXIMO_VIDEO = 25 * 1024 * 1024

// Só os formatos que celular grava: Android entrega MP4/WebM, iPhone entrega
// QuickTime (.mov). Sem transcodificação no servidor — o arquivo vai como veio e
// a bolha usa o player nativo do navegador.
export const TIPOS_VIDEO_ACEITOS = ['video/mp4', 'video/webm', 'video/quicktime']

export const TIPOS_ANEXO_ACEITOS = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/pdf',
  ...TIPOS_VIDEO_ACEITOS
].join(',')

export const ehVideo = (mime: string) => TIPOS_VIDEO_ACEITOS.includes(mime)

/** Tamanho legível na bolha — 25MB demora e o número explica a espera. */
export const formatarTamanho = (bytes: number | string | null | undefined) => {
  const numero = Number(bytes)
  if (!Number.isFinite(numero) || numero <= 0) return ''
  if (numero < 1024 * 1024) return `${Math.max(1, Math.round(numero / 1024))} KB`
  return `${(numero / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`
}

/** O `tipo` da mensagem é decidido pelo MIME — o backend recusa divergência. */
const tipoDoArquivo = (arquivo: File) => {
  if (ehVideo(arquivo.type)) return 'video'
  return arquivo.type === 'application/pdf' ? 'documento' : 'imagem'
}

type DestinoDaMensagem = {
  destinatarioId?: string | null
  atendimentoId?: string | null
}

type EnvioDeTexto = DestinoDaMensagem & { conteudo: string }
type EnvioDeAnexo = DestinoDaMensagem & {
  arquivo: File
  legenda?: string
  aoProgredir?: (percentual: number) => void
}

const destino = ({ destinatarioId, atendimentoId }: DestinoDaMensagem) => ({
  ...(destinatarioId ? { destinatarioId } : {}),
  ...(atendimentoId ? { atendimentoId } : {})
})

export const enviarTexto = async ({ destinatarioId, atendimentoId, conteudo }: EnvioDeTexto): Promise<Mensagem> => {
  const { data } = await api.post('/mensagens', {
    ...destino({ destinatarioId, atendimentoId }),
    tipo: 'texto',
    conteudo
  })
  return data.mensagem
}

/**
 * `aoProgredir` recebe 0..100. Vídeo de 25MB numa rede de celular leva dezenas de
 * segundos: sem esse retorno a tela ficaria parada e o tutor tentaria de novo.
 */
export const enviarAnexo = async ({ destinatarioId, atendimentoId, arquivo, legenda, aoProgredir }: EnvioDeAnexo): Promise<Mensagem> => {
  const video = ehVideo(arquivo.type)

  if (arquivo.type.startsWith('video/') && !video) {
    throw new Error('Formato de vídeo não aceito. Envie MP4, WebM ou MOV.')
  }

  const limite = video ? TAMANHO_MAXIMO_VIDEO : TAMANHO_MAXIMO_ANEXO
  if (arquivo.size > limite) {
    throw new Error(video
      ? 'Vídeo acima de 25MB. Grave um trecho mais curto e tente de novo.'
      : 'Arquivo acima de 10MB. Reduza o tamanho e tente de novo.')
  }

  const corpo = new FormData()
  const alvo = destino({ destinatarioId, atendimentoId })
  Object.entries(alvo).forEach(([chave, valor]) => corpo.append(chave, valor))
  corpo.append('tipo', tipoDoArquivo(arquivo))
  if (legenda) corpo.append('conteudo', legenda)
  corpo.append('arquivo', arquivo)

  const { data } = await api.post('/mensagens', corpo, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: aoProgredir
      ? (evento: AxiosProgressEvent) => {
        const total = evento.total || arquivo.size
        if (!total) return
        aoProgredir(Math.min(100, Math.round((evento.loaded * 100) / total)))
      }
      : undefined
  })
  return data.mensagem
}

/** Ponto único, capturado no momento do envio — não é rastreamento contínuo. */
export const enviarLocalizacaoAtual = ({ destinatarioId, atendimentoId }: DestinoDaMensagem) => new Promise<Mensagem>((resolve, reject) => {
  if (!navigator.geolocation) {
    reject(new Error('Este aparelho não permite compartilhar localização.'))
    return
  }

  navigator.geolocation.getCurrentPosition(
    async (posicao) => {
      try {
        const { data } = await api.post('/mensagens', {
          ...destino({ destinatarioId, atendimentoId }),
          tipo: 'localizacao',
          latitude: posicao.coords.latitude,
          longitude: posicao.coords.longitude
        })
        resolve(data.mensagem)
      } catch (erro) {
        reject(erro)
      }
    },
    () => reject(new Error('Não foi possível obter sua localização. Autorize o acesso e tente de novo.')),
    { enableHighAccuracy: true, timeout: 15000 }
  )
})

export const editarMensagem = async (id: string, conteudo: string): Promise<Mensagem> => {
  const { data } = await api.put(`/mensagens/${id}`, { conteudo })
  return data.mensagem
}

export const excluirMensagem = async (id: string): Promise<Mensagem> => {
  const { data } = await api.delete(`/mensagens/${id}`)
  return data.mensagem
}

export const historicoDaMensagem = async (id: string): Promise<unknown> => {
  const { data } = await api.get(`/mensagens/${id}/historico`)
  return data
}

export const marcarComoLida = (id: string) => api.put(`/mensagens/${id}/lida`).catch(() => {})

export const mapaDaLocalizacao = (mensagem: Pick<Mensagem, 'latitude' | 'longitude'>) =>
  `https://www.google.com/maps/search/?api=1&query=${mensagem.latitude},${mensagem.longitude}`

export const erroLegivel = (erro: unknown, padrao: string) => {
  if (axios.isAxiosError<{ error?: string; message?: string }>(erro)) {
    return erro.response?.data?.error || erro.response?.data?.message || erro.message || padrao
  }
  return erro instanceof Error ? erro.message : padrao
}
