/**
 * Tokenização do cartão no navegador.
 *
 * O checkout capturava número e CVV em estado do React e enviava tudo para a
 * NOSSA API. Dois problemas ao mesmo tempo: o gateway exige o token gerado
 * pelo SDK e recusa o pagamento sem ele (ou seja, o cartão nunca funcionou),
 * e os dados do cartão viajavam para o nosso servidor à toa, podendo parar
 * num log de requisição.
 *
 * Com o SDK, os campos sensíveis vão do navegador direto para o Mercado Pago,
 * que devolve um token de uso único. É só o token que chega até nós.
 */

const SDK_URL = 'https://sdk.mercadopago.com/js/v2';

type DadosDoCartao = {
  cardNumber?: string
  cardholderName?: string
  cardExpirationMonth?: string
  cardExpirationYear?: string
  securityCode: string
  identificationType?: 'CPF'
  identificationNumber?: string
  cardId?: string
}

type RespostaTokenCartao = { id?: string }

interface InstanciaMercadoPago {
  createCardToken(dados: DadosDoCartao): Promise<RespostaTokenCartao>
}

interface ConstrutorMercadoPago {
  new (chavePublica: string): InstanciaMercadoPago
}

declare global {
  interface Window {
    MercadoPago?: ConstrutorMercadoPago
  }
}

let carregando: Promise<ConstrutorMercadoPago> | null = null;

/** Carrega o SDK uma vez só, mesmo com várias chamadas simultâneas. */
function carregarSdk(): Promise<ConstrutorMercadoPago> {
  if (window.MercadoPago) return Promise.resolve(window.MercadoPago)
  if (carregando) return carregando

  carregando = new Promise<ConstrutorMercadoPago>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SDK_URL
    script.async = true
    script.onload = () => window.MercadoPago
      ? resolve(window.MercadoPago)
      : reject(new Error('SDK do Mercado Pago carregou sem expor a API.'))
    script.onerror = () => {
      carregando = null
      reject(new Error('Não foi possível carregar o serviço de pagamento. Verifique sua conexão.'))
    }
    document.head.appendChild(script)
  })

  return carregando
}

/** Só dígitos — o SDK recusa número formatado com espaço. */
const digitos = (valor: string | number | null | undefined) => String(valor || '').replace(/\D/g, '')

type CartaoDigitado = {
  chavePublica: string
  numero: string
  nome: string
  mes: string
  ano: string
  cvv: string
  cpf?: string | null
}

/**
 * Gera o token do cartão.
 * @returns {Promise<string>} token de uso único
 */
export async function tokenizarCartao({ chavePublica, numero, nome, mes, ano, cvv, cpf = null }: CartaoDigitado): Promise<string> {
  const MercadoPago = await carregarSdk()
  const mp = new MercadoPago(chavePublica)

  const resposta = await mp.createCardToken({
    cardNumber: digitos(numero),
    cardholderName: (nome || '').trim(),
    cardExpirationMonth: digitos(mes),
    // O SDK aceita ano com 2 ou 4 dígitos; normalizamos para 4.
    cardExpirationYear: digitos(ano).length === 2 ? `20${digitos(ano)}` : digitos(ano),
    securityCode: digitos(cvv),
    ...(cpf ? { identificationType: 'CPF', identificationNumber: digitos(cpf) } : {})
  })

  if (!resposta?.id) {
    throw new Error('Não foi possível validar o cartão. Confira os dados e tente novamente.')
  }

  return resposta.id
}

/** Formata o número em grupos de 4 enquanto a pessoa digita. */
export function formatarNumeroCartao(valor: string): string {
  return digitos(valor).slice(0, 19).replace(/(\d{4})(?=\d)/g, '$1 ').trim()
}

/**
 * Token de um cartão já guardado.
 *
 * A conveniência de guardar o cartão não pode custar segurança: o gateway
 * continua exigindo um token de uso único a cada cobrança, e ele é gerado aqui,
 * no navegador, a partir do identificador do cartão salvo mais o código de
 * segurança que a pessoa digita na hora. O número não é digitado de novo, e
 * também não é guardado em lugar nenhum nosso.
 *
 * @returns {Promise<string>} token de uso único
 */
export async function tokenizarCartaoSalvo({ chavePublica, cardId, cvv }: {
  chavePublica: string
  cardId: string
  cvv: string
}): Promise<string> {
  const MercadoPago = await carregarSdk()
  const mp = new MercadoPago(chavePublica)

  const resposta = await mp.createCardToken({
    cardId,
    securityCode: digitos(cvv)
  })

  if (!resposta?.id) {
    throw new Error('Não foi possível validar o cartão guardado. Confira o código de segurança.')
  }

  return resposta.id
}
