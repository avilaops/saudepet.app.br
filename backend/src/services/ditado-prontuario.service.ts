import { transcrever } from './transcricao.service';

/**
 * Ditado do prontuário: o veterinário grava um áudio contando o atendimento e
 * recebe de volta o texto transcrito para colar/ajustar nos campos de
 * `finalizarAtendimentoSchema` — não preenche nada sozinho, não fecha o
 * atendimento, não grava no banco.
 *
 * Por que não tentamos separar automaticamente em queixa/exame/diagnóstico: o
 * texto ditado não vem em seções — o veterinário fala de um jeito só, e uma
 * heurística de regex ia inventar uma divisão que erra mais do que ajuda,
 * competindo silenciosamente com o julgamento clínico de quem está lendo.
 * Devolvemos o texto inteiro e deixamos a divisão para quem sabe o que é o quê.
 */

export type RascunhoDitado = {
  texto: string;
  idioma: string;
  confianca_idioma: number;
  duracao_processamento_segundos: number;
};

export async function ditarProntuario(arquivo: {
  buffer: Buffer;
  originalname?: string;
  mimetype?: string;
}): Promise<RascunhoDitado> {
  const resultado = await transcrever(arquivo);

  return {
    texto: resultado.texto,
    idioma: resultado.idioma,
    confianca_idioma: resultado.confianca_idioma,
    duracao_processamento_segundos: resultado.duracao_processamento_segundos
  };
}
