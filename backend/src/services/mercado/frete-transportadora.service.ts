import { cotarCepCerto, type CotacaoCepCerto, type ServicoCepCerto } from '../cepcerto.service';
import { ValidationError } from '../../middleware/error.middleware';
import type { CarrinhoLido } from './carrinho.service';

const digitos = (valor: unknown): string => String(valor ?? '').replace(/\D/g, '');

export type PacoteDoPedido = {
  pesoGramas: number;
  alturaCm: number;
  larguraCm: number;
  comprimentoCm: number;
};

export function pacoteDoCarrinho(carrinho: CarrinhoLido): PacoteDoPedido {
  if (!carrinho.loja.aceita_transportadora) {
    throw new ValidationError('Esta loja não envia por transportadora.');
  }
  if (digitos(carrinho.loja.cep).length !== 8) {
    throw new ValidationError('A loja precisa completar o CEP de origem antes de oferecer transportadora.');
  }
  const semPeso = carrinho.itens.find((item) => !item.peso_gramas || item.peso_gramas <= 0);
  if (semPeso) {
    throw new ValidationError(`A loja precisa informar o peso de "${semPeso.nome}" antes de enviar por transportadora.`);
  }
  const pesoGramas = carrinho.itens.reduce(
    (total, item) => total + Number(item.peso_gramas || 0) * item.quantidade_disponivel,
    0
  );
  if (pesoGramas <= 0 || pesoGramas > 30000) {
    throw new ValidationError('A transportadora aceita pedidos com até 30 kg por pacote.');
  }
  const alturaCm = Number(carrinho.loja.embalagem_altura_cm || 0);
  const larguraCm = Number(carrinho.loja.embalagem_largura_cm || 0);
  const comprimentoCm = Number(carrinho.loja.embalagem_comprimento_cm || 0);
  if (alturaCm < 2 || larguraCm < 11 || comprimentoCm < 16 || alturaCm + larguraCm + comprimentoCm > 200) {
    throw new ValidationError('A loja precisa revisar as medidas da caixa padrão antes de oferecer transportadora.');
  }
  return { pesoGramas, alturaCm, larguraCm, comprimentoCm };
}

export async function cotarTransportadoras(params: {
  carrinho: CarrinhoLido;
  cepDestino: unknown;
}): Promise<{ opcoes: CotacaoCepCerto[]; pacote: PacoteDoPedido }> {
  const cepDestino = digitos(params.cepDestino);
  if (cepDestino.length !== 8) throw new ValidationError('Informe um CEP de entrega com 8 dígitos.');
  const pacote = pacoteDoCarrinho(params.carrinho);
  const opcoes = await cotarCepCerto({
    cepOrigem: digitos(params.carrinho.loja.cep),
    cepDestino,
    pesoKg: pacote.pesoGramas / 1000,
    alturaCm: pacote.alturaCm,
    larguraCm: pacote.larguraCm,
    comprimentoCm: pacote.comprimentoCm,
    valorEncomenda: params.carrinho.subtotal
  });
  if (opcoes.length === 0) throw new ValidationError('Nenhuma transportadora atende este pacote e CEP agora.');
  return { opcoes, pacote };
}

export function escolherServico(opcoes: CotacaoCepCerto[], solicitado: unknown): CotacaoCepCerto {
  const servico = String(solicitado || '') as ServicoCepCerto;
  const opcao = opcoes.find((item) => item.servico === servico);
  if (!opcao) throw new ValidationError('Escolha uma das opções de frete disponíveis.');
  return opcao;
}
