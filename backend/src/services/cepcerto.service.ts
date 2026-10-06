/**
 * Cliente servidor-servidor da CepCerto.
 *
 * O token operacional nunca atravessa uma resposta HTTP do Saúde Pet. Toda
 * chamada sai daqui e usa timeout curto: o checkout pode pedir para tentar de
 * novo, mas não pode ficar pendurado quando uma transportadora está instável.
 */

const BASE = (process.env.CEP_CERTO_API_URL || 'https://cepcerto.com').replace(/\/$/, '');
const TIMEOUT_MS = Math.max(3000, Number(process.env.CEP_CERTO_TIMEOUT_MS || 12000));

export type ServicoCepCerto = 'pac' | 'sedex' | 'jadlog-package' | 'jadlog-dotcom' | 'loggi';

export type CotacaoCepCerto = {
  servico: ServicoCepCerto;
  transportadora: string;
  nome: string;
  valor: number;
  prazo: string;
};

type Json = Record<string, unknown>;

export class ErroCepCerto extends Error {
  constructor(message: string, public readonly status = 502) {
    super(message);
    this.name = 'ErroCepCerto';
  }
}

const token = (): string => {
  const valor = process.env.CEP_CERTO_POSTAGEM_API_KEY?.trim();
  if (!valor) throw new ErroCepCerto('O frete por transportadora está temporariamente indisponível.', 503);
  return valor;
};

export const cepCertoConfigurada = (): boolean => Boolean(process.env.CEP_CERTO_POSTAGEM_API_KEY?.trim());

const dinheiro = (valor: unknown): number | null => {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;
  const texto = String(valor ?? '').replace(/R\$\s?/i, '').trim();
  if (!texto) return null;
  const normalizado = texto.includes(',') ? texto.replace(/\./g, '').replace(',', '.') : texto;
  const numero = Number(normalizado);
  return Number.isFinite(numero) ? Math.round(numero * 100) / 100 : null;
};

async function post(caminho: string, dados: Json): Promise<Json> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const resposta = await fetch(`${BASE}${caminho}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token()}`
      },
      body: JSON.stringify({ ...dados, token_cliente_postagem: token() }),
      signal: controller.signal
    });
    const corpo = await resposta.json().catch(() => ({})) as Json;
    if (!resposta.ok || corpo.status === 'erro' || corpo.sucesso === false) {
      const mensagem = String(corpo.mensagem || corpo.erro || corpo.error || '').trim();
      console.error('[cepcerto] chamada recusada', { caminho, status: resposta.status, mensagem });
      throw new ErroCepCerto(
        resposta.status === 401
          ? 'A integração de frete precisa ser reconfigurada pela equipe.'
          : mensagem || 'A transportadora não respondeu à solicitação.',
        resposta.status >= 400 && resposta.status < 500 ? 400 : 502
      );
    }
    return corpo;
  } catch (erro) {
    if (erro instanceof ErroCepCerto) throw erro;
    const timeout = (erro as Error).name === 'AbortError';
    console.error('[cepcerto] falha de rede', { caminho, erro: (erro as Error).message });
    throw new ErroCepCerto(timeout ? 'A cotação demorou demais. Tente novamente.' : 'Não foi possível falar com a transportadora.');
  } finally {
    clearTimeout(timeout);
  }
}

export async function cotarCepCerto(params: {
  cepOrigem: string;
  cepDestino: string;
  pesoKg: number;
  alturaCm: number;
  larguraCm: number;
  comprimentoCm: number;
  valorEncomenda: number;
}): Promise<CotacaoCepCerto[]> {
  const corpo = await post('/api-cotacao-frete/', {
    cep_remetente: params.cepOrigem,
    cep_destinatario: params.cepDestino,
    peso: params.pesoKg.toFixed(3),
    altura: String(params.alturaCm),
    largura: String(params.larguraCm),
    comprimento: String(params.comprimentoCm),
    valor_encomenda: Math.max(50, params.valorEncomenda).toFixed(2)
  });
  const frete = (corpo.frete || corpo) as Json;
  const definicoes: Array<[ServicoCepCerto, string, string, string, string]> = [
    ['pac', 'Correios', 'PAC', 'valor_pac', 'prazo_pac'],
    ['sedex', 'Correios', 'SEDEX', 'valor_sedex', 'prazo_sedex'],
    ['jadlog-package', 'Jadlog', 'Package', 'valor_jadlog_package', 'prazo_jadlog_package'],
    ['jadlog-dotcom', 'Jadlog', '.COM', 'valor_jadlog_dotcom', 'prazo_jadlog_dotcom'],
    ['loggi', 'Loggi', 'Loggi', 'valor_loggi', 'prazo_loggi']
  ];

  return definicoes.flatMap(([servico, transportadora, nome, campoValor, campoPrazo]) => {
    const valor = dinheiro(frete[campoValor]);
    if (valor === null || valor <= 0) return [];
    return [{ servico, transportadora, nome, valor, prazo: String(frete[campoPrazo] || 'prazo sob consulta') }];
  });
}

export async function saldoCepCerto(): Promise<number> {
  const corpo = await post('/api-saldo/', {});
  const saldo = dinheiro(corpo.saldo_atual);
  if (saldo === null) throw new ErroCepCerto('Não foi possível confirmar o saldo para emitir a etiqueta.');
  return saldo;
}

export async function emitirEtiquetaCepCerto(params: {
  requestId: string;
  servico: ServicoCepCerto;
  cepRemetente: string;
  cepDestinatario: string;
  pesoKg: number;
  alturaCm: number;
  larguraCm: number;
  comprimentoCm: number;
  valorEncomenda: number;
  remetente: { nome: string; cpfCnpj: string; whatsapp: string; email: string; numero: string; complemento?: string | null };
  destinatario: { nome: string; cpfCnpj: string; whatsapp: string; email: string; numero: string; complemento?: string | null };
  produtos: Array<{ descricao: string; valor: number; quantidade: number }>;
}) {
  const corpo = await post('/api-postagem-frete/', {
    request_id: params.requestId,
    tipo_entrega: params.servico,
    logistica_reversa: 'N',
    cep_remetente: params.cepRemetente,
    cep_destinatario: params.cepDestinatario,
    peso: params.pesoKg.toFixed(3),
    altura: String(params.alturaCm),
    largura: String(params.larguraCm),
    comprimento: String(params.comprimentoCm),
    valor_encomenda: Math.max(50, params.valorEncomenda).toFixed(2),
    nome_remetente: params.remetente.nome,
    cpf_cnpj_remetente: params.remetente.cpfCnpj,
    whatsapp_remetente: params.remetente.whatsapp,
    email_remetente: params.remetente.email,
    numero_endereco_remetente: params.remetente.numero,
    complemento_remetente: params.remetente.complemento || '',
    nome_destinatario: params.destinatario.nome,
    cpf_cnpj_destinatario: params.destinatario.cpfCnpj,
    whatsapp_destinatario: params.destinatario.whatsapp,
    email_destinatario: params.destinatario.email,
    numero_endereco_destinatario: params.destinatario.numero,
    complemento_destinatario: params.destinatario.complemento || '',
    tipo_doc_fiscal: 'declaracao',
    produtos: params.produtos.map((item) => ({
      descricao: item.descricao.slice(0, 100),
      valor: item.valor.toFixed(2),
      quantidade: item.quantidade
    }))
  });
  const frete = (corpo.frete || corpo) as Json;
  const codigo = String(frete.codigoObjeto || corpo.codigoObjeto || '').trim();
  const etiquetaUrl = String(frete.pdfUrlEtiqueta || corpo.pdfUrlEtiqueta || '').trim();
  if (!codigo || !etiquetaUrl) throw new ErroCepCerto('A etiqueta foi processada, mas a CepCerto não devolveu o arquivo. Fale com o suporte antes de tentar outra vez.');
  return {
    codigo,
    etiquetaUrl,
    declaracaoUrl: String(frete.pdfUrlDCE || corpo.pdfUrlDCE || '').trim() || null,
    valor: dinheiro(frete.valor) ?? null
  };
}

export async function cancelarEtiquetaCepCerto(codigoObjeto: string) {
  return post('/api-cancela-postagem/', { codigo_objeto: codigoObjeto });
}

