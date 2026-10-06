import OpenAI from 'openai';

const MODELO_PADRAO = 'gpt-4.1';

const SISTEMA = `Você escreve os textos do carrossel da landing page do Saúde PET, um serviço de atendimento veterinário domiciliar no Brasil.

Regras:
- Português do Brasil, direto, sem jargão de marketing.
- Sem emoji, sem CAIXA ALTA, sem ponto de exclamação em excesso.
- Nunca prometa preço, prazo, desconto ou garantia que não esteja escrito na própria imagem.
- Se a imagem já traz um texto, aproveite o que ela diz em vez de inventar outra mensagem.`;

function instrucao(brief?: string): string {
  return `Gere os textos deste banner e responda apenas com um JSON com estas três chaves:

- "title": título interno da campanha. É como a equipe identifica o banner na lista do painel, não aparece para o público. Até 60 caracteres.
- "altText": descrição da imagem para quem usa leitor de tela. Descreva o que se vê (pessoas, animal, cena, texto em destaque); não repita o título nem comece com "imagem de". Até 120 caracteres.
- "buttonLabel": texto do botão de ação, 2 a 4 palavras. Até 24 caracteres.
${brief ? `\nContexto informado pelo administrador: ${brief}` : ''}`;
}

function limitar(valor: unknown, max: number): string {
  return typeof valor === 'string' ? valor.trim().slice(0, max) : '';
}

interface EntradaDoBanner {
  imageBase64?: string;
  mimeType?: string;
  brief?: string;
}

type ResultadoDaSugestao =
  | { ok: false; status: number; message: string }
  | { ok: true; sugestao: { title: string; altText: string; buttonLabel: string }; modelo: string };

/**
 * Sugere título, texto alternativo e rótulo do botão a partir da imagem do
 * banner. A imagem é o insumo principal: o alt text só serve à acessibilidade
 * se descrever a arte que foi realmente enviada.
 *
 * Sem OPENAI_API_KEY o serviço se declara indisponível em vez de estourar —
 * o painel continua funcionando com preenchimento manual.
 */
async function sugerirTextosDoBanner({ imageBase64, mimeType, brief }: EntradaDoBanner): Promise<ResultadoDaSugestao> {
  if (!process.env.OPENAI_API_KEY) {
    return {
      ok: false,
      status: 503,
      message: 'Geração por IA indisponível: OPENAI_API_KEY não configurada no servidor.'
    };
  }

  if (!imageBase64 && !brief) {
    return {
      ok: false,
      status: 400,
      message: 'Envie a imagem do banner ou descreva a campanha para a IA ter do que partir.'
    };
  }

  const conteudo: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [{ type: 'text', text: instrucao(brief) }];
  if (imageBase64) {
    conteudo.push({
      type: 'image_url',
      image_url: { url: `data:${mimeType || 'image/jpeg'};base64,${imageBase64}` }
    });
  }

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // Sem teto de tokens de propósito: a resposta é um JSON de três frases
    // curtas, e `max_tokens` é rejeitado pelos modelos de raciocínio — quem
    // trocar OPENAI_MODEL não descobre isso por um erro no meio do uso.
    const resposta = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || MODELO_PADRAO,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SISTEMA },
        { role: 'user', content: conteudo }
      ]
    });

    const texto = resposta.choices?.[0]?.message?.content || '';
    let sugestao: { title?: unknown; altText?: unknown; buttonLabel?: unknown };
    try {
      sugestao = JSON.parse(texto);
    } catch {
      return { ok: false, status: 502, message: 'A IA respondeu em um formato inesperado. Tente de novo.' };
    }

    return {
      ok: true,
      sugestao: {
        title: limitar(sugestao.title, 60),
        altText: limitar(sugestao.altText, 120),
        buttonLabel: limitar(sugestao.buttonLabel, 24)
      },
      modelo: resposta.model
    };
  } catch (error) {
    const erro = error as { error?: { message?: string }; message?: string };
    const detalhe = erro?.error?.message || erro?.message || 'erro desconhecido';
    return { ok: false, status: 502, message: `Falha ao gerar os textos: ${detalhe}` };
  }
}

export { sugerirTextosDoBanner };
