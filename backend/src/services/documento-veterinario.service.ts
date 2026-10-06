import axios from 'axios';

const OpenAI = require('openai');

/**
 * Confere a foto do documento profissional contra o que a pessoa digitou.
 *
 * Quando um veterinário envia a carteira do CRMV ou o diploma, isto lê o
 * documento e compara nome e número com o formulário. Não é a decisão — quem
 * aprova é o admin, na fila de credenciamento. É o pré-exame que faz a
 * divergência saltar aos olhos: "o CRMV do documento é SP-12345, o digitado
 * foi SP-12354".
 *
 * Roda no **OpenAI**, que é a chave que a casa tem no servidor. Até 26/08/2026
 * o código chamava a API da Anthropic com `ANTHROPIC_API_KEY`, que NUNCA
 * esteve configurada em produção — ou seja, a análise nunca aconteceu uma vez
 * sequer e todo documento chegava ao admin sem conferência, com um status
 * dizendo exatamente isso. Trocado para o mesmo caminho de `banner-copy`:
 * mesmo SDK, mesmo `OPENAI_MODEL`, mesma degradação sem chave.
 *
 * Sem `OPENAI_API_KEY` a análise não acontece e o cadastro segue com
 * `status: 'nao_configurado'` — deliberado: barrar credenciamento porque uma
 * integração opcional está desligada seria pior do que revisar à mão.
 */

const MODELO_PADRAO = 'gpt-4.1';

/** Baixar o arquivo é rápido; a leitura pode demorar. Daí os dois tempos. */
const TIMEOUT_DOWNLOAD_MS = 20_000;
const TIMEOUT_ANALISE_MS = 45_000;

const SISTEMA = `Você confere documentos profissionais de medicina veterinária no Brasil (carteira do CRMV e diploma) num cadastro.

Regras:
- Leia o que está no documento. Não invente nem complete dado que não está visível.
- Compare com o que a pessoa digitou e aponte divergência, mesmo pequena (um dígito trocado importa).
- Se a imagem estiver ilegível, diga que está ilegível em vez de arriscar um palpite.
- Responda em português do Brasil.`;

function instrucao(nomeDigitado?: string | null, crmvDigitado?: string | null): string {
  return `Analise o documento e compare com os dados informados no cadastro.

Dados informados:
- Nome: "${nomeDigitado || '(não informado)'}"
- CRMV: "${crmvDigitado || '(não informado)'}"

Responda com um JSON com exatamente estas chaves:
{
  "documento_legivel": true ou false,
  "tipo_documento_detectado": "carteira_crmv" | "diploma" | "outro" | "indeterminado",
  "nome_extraido": "nome como aparece no documento, ou null",
  "crmv_extraido": "número do CRMV como aparece no documento, ou null",
  "nome_consistente": true ou false ou null (null se não deu pra comparar),
  "crmv_consistente": true ou false ou null,
  "observacoes": "nota curta sobre a análise, citando a divergência se houver"
}`;
}

const TIPOS_DE_DOCUMENTO = ['carteira_crmv', 'diploma', 'outro', 'indeterminado'] as const;
type TipoDeDocumento = (typeof TIPOS_DE_DOCUMENTO)[number];

/**
 * O modelo devolve texto livre mesmo quando o prompt pede um valor de lista.
 *
 * Num teste real ele respondeu `"Carteira de Identidade Profissional - CRMV"`
 * em vez de `"carteira_crmv"` — plausível para uma pessoa ler, inútil para a
 * tela que compara com um valor fixo. A tradução acontece aqui, e o que não
 * casar vira `indeterminado`: melhor o admin ver "indeterminado" e olhar o
 * documento do que ver uma frase que nenhum código entende.
 */
function normalizarTipo(valor: unknown): TipoDeDocumento {
  if (typeof valor !== 'string') return 'indeterminado';

  const texto = valor.toLowerCase();
  if (TIPOS_DE_DOCUMENTO.includes(texto as TipoDeDocumento)) return texto as TipoDeDocumento;
  if (texto.includes('crmv') || texto.includes('carteira')) return 'carteira_crmv';
  if (texto.includes('diploma')) return 'diploma';
  return 'indeterminado';
}

export type PedidoDeAnalise = {
  imageUrl: string;
  contentType?: string | null;
  crmvDigitado?: string | null;
  nomeDigitado?: string | null;
};

export type ResultadoDaAnalise = {
  status: 'analisado' | 'nao_configurado' | 'erro';
  observacoes?: string;
  documento_legivel?: boolean;
  tipo_documento_detectado?: TipoDeDocumento;
  nome_extraido?: string | null;
  crmv_extraido?: string | null;
  nome_consistente?: boolean | null;
  crmv_consistente?: boolean | null;
  modelo?: string;
};

export async function analisarDocumento(
  { imageUrl, contentType, crmvDigitado, nomeDigitado }: PedidoDeAnalise
): Promise<ResultadoDaAnalise> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return {
      status: 'nao_configurado',
      observacoes: 'Análise automática desativada (OPENAI_API_KEY não configurada). Revise o documento manualmente.'
    };
  }

  try {
    const arquivo = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: TIMEOUT_DOWNLOAD_MS
    });
    const base64 = Buffer.from(arquivo.data).toString('base64');
    const mediaType = contentType || 'image/jpeg';
    const ehPdf = mediaType === 'application/pdf';

    // O upload aceita imagem OU PDF (diploma escaneado costuma vir em PDF), e
    // as duas formas entram por partes de conteúdo diferentes.
    const conteudo: any[] = [{ type: 'text', text: instrucao(nomeDigitado, crmvDigitado) }];

    if (ehPdf) {
      conteudo.push({
        type: 'file',
        file: { filename: 'documento.pdf', file_data: `data:application/pdf;base64,${base64}` }
      });
    } else {
      conteudo.push({
        type: 'image_url',
        image_url: { url: `data:${mediaType};base64,${base64}` }
      });
    }

    const client = new OpenAI({ apiKey, timeout: TIMEOUT_ANALISE_MS });

    // `response_format: json_object` dispensa a extração por regex que a versão
    // anterior fazia (`texto.match(/\{[\s\S]*\}/)`) — o modelo devolve JSON e
    // pronto. Sem teto de tokens, pelo mesmo motivo de `banner-copy`: a
    // resposta é curta e `max_tokens` é recusado por modelos de raciocínio.
    const resposta = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || MODELO_PADRAO,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SISTEMA },
        { role: 'user', content: conteudo }
      ]
    });

    const texto = resposta.choices?.[0]?.message?.content || '';

    let analise: Record<string, unknown>;
    try {
      analise = JSON.parse(texto);
    } catch {
      return { status: 'erro', observacoes: 'A IA respondeu num formato inesperado. Revise o documento manualmente.' };
    }

    return {
      status: 'analisado',
      ...analise,
      tipo_documento_detectado: normalizarTipo(analise.tipo_documento_detectado),
      modelo: resposta.model
    };
  } catch (erro) {
    const detalhe =
      (erro as any)?.response?.data?.error?.message ||
      (erro as any)?.error?.message ||
      (erro instanceof Error ? erro.message : String(erro));

    // Falhar aqui NÃO reprova o veterinário: devolve o motivo para o admin ler
    // e decidir com o documento na mão.
    return { status: 'erro', observacoes: `Falha ao analisar documento: ${detalhe}` };
  }
}

module.exports = { analisarDocumento };
