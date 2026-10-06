import OpenAI from 'openai';

/**
 * Serviço de IA para estruturação pericial de prontuário veterinário por voz.
 *
 * Recebe o texto livre falado pelo veterinário e extrai os blocos clínicos:
 * - Queixa Principal
 * - Exame Físico (mucosas, ausculta, palpação, temperatura, hidratação)
 * - Hipótese Diagnóstica e Diagnóstico Definitivo
 * - Prescrições estruturadas (medicamento, concentração, forma, posologia, duração)
 * - Exames complementares solicitados com justificativa
 * - Alergias relatadas
 * - Orientações ao tutor
 * - Retorno sugerido (dias/data)
 */

const MODELO_PADRAO = process.env.OPENAI_MODEL || 'gpt-4o-mini';

const SISTEMA_PROMPT = `Você é um assistente pericial de medicina veterinária brasileira especializado em estruturar relatos clínicos falados/ditados por médicos veterinários em prontuários e receitas técnicas formais.

Seu objetivo é transformar o texto transcrito da fala do veterinário em um JSON clínico rigoroso, correto e pronto para preencher a ficha de atendimento e emissão de receita oficial.

Regras de Extração:
1. "queixa_principal": Motivo central da consulta e sintomas descritos pelo tutor/vet.
2. "exame_fisico": Achados objetivos (mucosas, FC, FR, TPC, temperatura °C, palpação abdominal, ausculta, hidratação, escore corporal).
3. "hipotese_diagnostica": Hipótese clínica provável (obrigatória).
4. "diagnostico_definitivo": Conclusão diagnóstica fechada (ou null se for apenas hipótese).
5. "prescricoes": Array de itens prescritos com:
   - medicamento: Nome comercial ou genérico (ex: "Cerenia", "Dipirona", "Amoxicilina + Clavulanato", "Gaviz V")
   - concentracao: Concentração quando informada (ex: "16mg", "500mg", "20mg/ml", null)
   - forma_farmaceutica: "comprimido" | "cápsula" | "xarope" | "suspensão" | "pomada" | "colírio" | "injetável" | "spray" | "pasta"
   - posologia: Instruções claras de dosagem e intervalo (ex: "Administrar 1 comprimido por via oral a cada 24 horas")
   - duracao_dias: Número de dias de tratamento como número inteiro (ex: 4, 7, 10, null)
6. "exames": Array com exames solicitados:
   - nome_exame: ex: "Hemograma completo", "Ultrassonografia abdominal", "Bioquímico renal e hepático"
   - justificativa: Motivo do pedido
7. "alergias": Array de alergias citadas:
   - alergia: substância
   - gravidade: "leve" | "moderada" | "grave"
   - observacoes: detalhes
8. "orientacoes_tutor": Cuidados de suporte, repouso, dieta, hidratação e sinais de alarme para pronto-socorro.
9. "retorno_dias": Número de dias sugerido para retorno clínico (ex: 5, 7, 15, null).

Responda ESTRITAMENTE com o JSON válido sem markdown ou blocos de código extras.`;

export type ProntuarioIaOutput = {
  queixa_principal: string | null;
  exame_fisico: string | null;
  hipotese_diagnostica: string;
  diagnostico_definitivo: string | null;
  prescricoes: Array<{
    medicamento: string;
    concentracao?: string | null;
    forma_farmaceutica?: string | null;
    posologia: string;
    duracao_dias?: number | null;
  }>;
  exames: Array<{
    nome_exame: string;
    justificativa?: string | null;
  }>;
  alergias: Array<{
    alergia: string;
    gravidade: 'leve' | 'moderada' | 'grave';
    observacoes?: string | null;
  }>;
  orientacoes_tutor: string | null;
  retorno_dias?: number | null;
};

/**
 * Parser heurístico local determinístico (fallback seguro quando sem internet/API key)
 */
export function parseLocalProntuarioHeuristico(texto: string): ProntuarioIaOutput {
  const t = texto || '';
  const linhas = t.split(/[.\n;]+/).map((l) => l.trim()).filter(Boolean);

  let queixa = '';
  let exame = '';
  let hipotese = '';
  let diagnostico = '';
  let orientacoes = '';
  let retornoDias: number | null = null;
  const prescricoes: ProntuarioIaOutput['prescricoes'] = [];
  const exames: ProntuarioIaOutput['exames'] = [];
  const alergias: ProntuarioIaOutput['alergias'] = [];

  // Detectar retorno (ex: "retorno em 5 dias", "retornar daqui 7 dias")
  const matchRetorno = t.match(/retorno\s*(?:em|de|daqui a|daqui)?\s*(\d+)\s*dias/i);
  if (matchRetorno) {
    retornoDias = Number.parseInt(matchRetorno[1], 10);
  }

  // Detectar termos clínicos linha a linha
  for (const linha of linhas) {
    const lLower = linha.toLowerCase();

    if (lLower.includes('alergia') || lLower.includes('alérgico')) {
      alergias.push({
        alergia: linha.replace(/alergia|alérgico a|alérgica a/gi, '').trim() || 'Alergia relatada',
        gravidade: 'moderada',
        observacoes: linha
      });
    } else if (lLower.includes('prescrev') || lLower.includes('receit') || lLower.includes('dar ') || lLower.includes('administrar') || lLower.includes('mg') || lLower.includes('comprimido') || lLower.includes('gotas')) {
      // Extrair medicamento
      const diasMatch = linha.match(/(\d+)\s*dias/i);
      const duracao = diasMatch ? Number.parseInt(diasMatch[1], 10) : null;
      const mgMatch = linha.match(/(\d+\s*(?:mg|ml|g|mcg|gotas))/i);
      const concentracao = mgMatch ? mgMatch[1] : null;

      let forma = 'comprimido';
      if (lLower.includes('gotas') || lLower.includes('solução')) forma = 'gotas';
      if (lLower.includes('xarope')) forma = 'xarope';
      if (lLower.includes('pomada')) forma = 'pomada';
      if (lLower.includes('pasta')) forma = 'pasta';
      if (lLower.includes('injet')) forma = 'injetável';
      if (lLower.includes('spray')) forma = 'spray';

      prescricoes.push({
        medicamento: linha.split(/,| a cada| por /i)[0].replace(/prescrevo|receito|tomar|administrar/gi, '').trim(),
        concentracao,
        forma_farmaceutica: forma,
        posologia: linha,
        duracao_dias: duracao
      });
    } else if (lLower.includes('exame') || lLower.includes('hemograma') || lLower.includes('ultrassom') || lLower.includes('raio-x') || lLower.includes('bioquímico')) {
      exames.push({
        nome_exame: linha.replace(/solicito|solicitar|pedir|exame de/gi, '').trim(),
        justificativa: 'Avaliação clínica complementar'
      });
    } else if (lLower.includes('exame físico') || lLower.includes('temperatura') || lLower.includes('mucosas') || lLower.includes('ausculta') || lLower.includes('palpação') || lLower.includes('graus')) {
      exame += (exame ? ' · ' : '') + linha;
    } else if (lLower.includes('hipótese') || lLower.includes('suspeita') || lLower.includes('diagnóstico')) {
      if (lLower.includes('definitivo') || lLower.includes('conclusão')) {
        diagnostico += (diagnostico ? ' · ' : '') + linha;
      } else {
        hipotese += (hipotese ? ' · ' : '') + linha;
      }
    } else if (lLower.includes('orient') || lLower.includes('dieta') || lLower.includes('repouso') || lLower.includes('água') || lLower.includes('cuidado')) {
      orientacoes += (orientacoes ? ' ' : '') + linha;
    } else {
      queixa += (queixa ? ' ' : '') + linha;
    }
  }

  return {
    queixa_principal: queixa.trim() || t.slice(0, 200),
    exame_fisico: exame.trim() || null,
    hipotese_diagnostica: hipotese.trim() || diagnostico.trim() || 'Avaliação clínica geral',
    diagnostico_definitivo: diagnostico.trim() || null,
    prescricoes: prescricoes.length > 0 ? prescricoes : [],
    exames: exames.length > 0 ? exames : [],
    alergias: alergias.length > 0 ? alergias : [],
    orientacoes_tutor: orientacoes.trim() || 'Manter animal em repouso e hidratação adequada.',
    retorno_dias: retornoDias
  };
}

export class ProntuarioIaService {
  /**
   * Processa texto falado do veterinário e retorna o prontuário estruturado
   */
  static async parseTextoVoz(textoTranscrito: string): Promise<ProntuarioIaOutput> {
    if (!textoTranscrito || !textoTranscrito.trim()) {
      throw new Error('Nenhum texto de áudio ou transcrição fornecido.');
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      // Degradação elegante com parser heurístico local
      return parseLocalProntuarioHeuristico(textoTranscrito);
    }

    try {
      const openai = new OpenAI({ apiKey });
      const response = await openai.chat.completions.create({
        model: MODELO_PADRAO,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SISTEMA_PROMPT },
          {
            role: 'user',
            content: `Estruture o seguinte relato clínico ditado por voz pelo médico veterinário:\n\n"${textoTranscrito}"`
          }
        ]
      });

      const conteudo = response.choices[0]?.message?.content;
      if (!conteudo) {
        return parseLocalProntuarioHeuristico(textoTranscrito);
      }

      const parsed = JSON.parse(conteudo);
      return {
        queixa_principal: parsed.queixa_principal || null,
        exame_fisico: parsed.exame_fisico || null,
        hipotese_diagnostica: parsed.hipotese_diagnostica || 'Avaliação clínica geral',
        diagnostico_definitivo: parsed.diagnostico_definitivo || null,
        prescricoes: Array.isArray(parsed.prescricoes) ? parsed.prescricoes : [],
        exames: Array.isArray(parsed.exames) ? parsed.exames : [],
        alergias: Array.isArray(parsed.alergias) ? parsed.alergias : [],
        orientacoes_tutor: parsed.orientacoes_tutor || null,
        retorno_dias: typeof parsed.retorno_dias === 'number' ? parsed.retorno_dias : null
      };
    } catch (err: any) {
      console.warn('⚠️ [PRONTUARIO IA]: Falha na OpenAI, usando fallback heurístico:', err.message);
      return parseLocalProntuarioHeuristico(textoTranscrito);
    }
  }
}
