import axios from 'axios';
import FormData from 'form-data';

/**
 * Cliente do serviço de transcrição de voz (faster-whisper), rodando local em
 * `ferramentas/voz/servico-transcricao`. Não é IA de terceiro: o áudio nunca
 * sai da infraestrutura própria, e não há custo por minuto.
 *
 * Usado hoje só pelo ditado de prontuário do veterinário — ver
 * `ditar-prontuario.service.ts`. Se um segundo consumo aparecer (triagem por
 * áudio do tutor, por exemplo), ele chama este mesmo cliente.
 */

const BASE = (process.env.TRANSCRICAO_API_URL || 'http://127.0.0.1:8100').replace(/\/$/, '');
const TIMEOUT_MS = Math.max(5000, Number(process.env.TRANSCRICAO_TIMEOUT_MS || 30000));

export class ErroTranscricao extends Error {
  constructor(message: string, public readonly status = 502) {
    super(message);
    this.name = 'ErroTranscricao';
  }
}

export type TrechoTranscrito = { inicio: number; fim: number; texto: string };

export type ResultadoTranscricao = {
  texto: string;
  idioma: string;
  confianca_idioma: number;
  duracao_processamento_segundos: number;
  trechos: TrechoTranscrito[];
};

/** Envia o áudio para o serviço local e devolve o texto transcrito. */
export async function transcrever(arquivo: { buffer: Buffer; originalname?: string; mimetype?: string }): Promise<ResultadoTranscricao> {
  const form = new FormData();
  form.append('arquivo', arquivo.buffer, {
    filename: arquivo.originalname || 'audio.webm',
    contentType: arquivo.mimetype || 'audio/webm'
  });

  try {
    const { data } = await axios.post(`${BASE}/transcrever`, form, {
      headers: form.getHeaders(),
      timeout: TIMEOUT_MS,
      maxContentLength: 25 * 1024 * 1024
    });
    return data as ResultadoTranscricao;
  } catch (erro: any) {
    if (erro?.response?.status === 400) {
      throw new ErroTranscricao(erro.response.data?.detail || 'Áudio inválido', 400);
    }
    throw new ErroTranscricao('Serviço de transcrição indisponível no momento', 503);
  }
}
