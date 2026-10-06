import prisma from '../../config/database';
import { ConflictError, NotFoundError, ValidationError } from '../../middleware/error.middleware';
import { emitirEtiquetaCepCerto, saldoCepCerto, type ServicoCepCerto } from '../cepcerto.service';
import { registrarEvento } from './pedido.service';

const digitos = (valor: unknown): string => String(valor ?? '').replace(/\D/g, '');
const numero = (valor: unknown): number => Number(valor || 0);

/**
 * Emite uma única etiqueta para um pedido pago.
 *
 * `pedido-<uuid>` é a chave idempotente: dois cliques, retry de rede ou dois
 * processos concorrentes recebem a mesma postagem da CepCerto e não duas
 * cobranças na carteira.
 */
export async function emitirEtiquetaDoPedido(params: { tenantId: string; lojaId: string; pedidoId: string }) {
  const pedido = await prisma.pedidoMercado.findFirst({
    where: { id: params.pedidoId, tenant_id: params.tenantId, loja_id: params.lojaId },
    include: {
      loja: true,
      tutor: { select: { nome: true, cpf: true, telefone: true, email: true } },
      itens: true
    }
  });
  if (!pedido) throw new NotFoundError('Pedido não encontrado.');
  if (pedido.entrega_tipo !== 'transportadora') throw new ValidationError('Este pedido não usa transportadora.');
  if (pedido.etiqueta_url && pedido.rastreio_codigo) return pedido;
  if (pedido.status !== 'pago' && pedido.status !== 'em_separacao') {
    throw new ConflictError('A etiqueta só pode ser emitida depois do pagamento e antes do despacho.');
  }

  const cepRemetente = digitos(pedido.loja.cep);
  const cepDestinatario = digitos(pedido.entrega_cep);
  const cnpj = digitos(pedido.loja.cnpj);
  const cpf = digitos(pedido.tutor.cpf);
  const telefoneLoja = digitos(pedido.loja.whatsapp || pedido.loja.telefone);
  const telefoneTutor = digitos(pedido.tutor.telefone);
  if (cepRemetente.length !== 8 || !pedido.loja.numero || cnpj.length !== 14 || telefoneLoja.length < 10) {
    throw new ValidationError('Complete CEP, número, CNPJ e telefone no cadastro da loja antes de emitir.');
  }
  if (cepDestinatario.length !== 8 || !pedido.entrega_numero || cpf.length !== 11 || telefoneTutor.length < 10) {
    throw new ValidationError('O endereço, CPF ou telefone do cliente está incompleto.');
  }
  if (!pedido.frete_servico || !pedido.frete_peso_gramas || !pedido.frete_altura_cm || !pedido.frete_largura_cm || !pedido.frete_comprimento_cm) {
    throw new ValidationError('Os dados do pacote não foram gravados neste pedido.');
  }

  const saldo = await saldoCepCerto();
  const custoPrevisto = numero(pedido.frete);
  if (saldo < custoPrevisto) {
    throw new ConflictError(`Saldo de postagem insuficiente. Disponível: ${saldo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}.`);
  }

  const etiqueta = await emitirEtiquetaCepCerto({
    requestId: `pedido-${pedido.id}`,
    servico: pedido.frete_servico as ServicoCepCerto,
    cepRemetente,
    cepDestinatario,
    pesoKg: pedido.frete_peso_gramas / 1000,
    alturaCm: numero(pedido.frete_altura_cm),
    larguraCm: numero(pedido.frete_largura_cm),
    comprimentoCm: numero(pedido.frete_comprimento_cm),
    valorEncomenda: numero(pedido.subtotal),
    remetente: {
      nome: pedido.loja.razao_social || pedido.loja.nome_fantasia,
      cpfCnpj: cnpj,
      whatsapp: telefoneLoja,
      email: pedido.loja.email,
      numero: pedido.loja.numero,
      complemento: pedido.loja.complemento
    },
    destinatario: {
      nome: pedido.tutor.nome,
      cpfCnpj: cpf,
      whatsapp: telefoneTutor,
      email: pedido.tutor.email,
      numero: pedido.entrega_numero,
      complemento: pedido.entrega_complemento
    },
    produtos: pedido.itens.map((item) => ({
      descricao: [item.nome, item.variacao].filter(Boolean).join(' - '),
      valor: numero(item.preco_unitario),
      quantidade: item.quantidade
    }))
  });

  return prisma.$transaction(async (tx) => {
    const atualizado = await tx.pedidoMercado.update({
      where: { id: pedido.id },
      data: {
        rastreio_codigo: etiqueta.codigo,
        etiqueta_url: etiqueta.etiquetaUrl,
        declaracao_url: etiqueta.declaracaoUrl,
        etiqueta_emitida_em: new Date()
      },
      include: { itens: true, tutor: { select: { id: true, nome: true, telefone: true, email: true } } }
    });
    await registrarEvento(tx, {
      pedidoId: pedido.id,
      status: pedido.status,
      statusAnterior: pedido.status,
      origem: 'loja',
      motivo: `Etiqueta emitida: ${etiqueta.codigo}`
    });
    return atualizado;
  });
}
