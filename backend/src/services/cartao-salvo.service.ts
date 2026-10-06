import prisma from '../config/database';
import { ConflictError, NotFoundError, ValidationError } from '../middleware/error.middleware';

/**
 * O cartão que não precisa ser digitado de novo.
 *
 * Na segunda emergência, digitar dezesseis dígitos com o animal passando mal na
 * frente é atrito no pior momento possível. Guardado o cartão, o checkout pede
 * só o código de segurança.
 *
 * O que guardamos é REFERÊNCIA, nunca cartão: o identificador que o gateway
 * devolve, mais o que serve para a pessoa reconhecer qual é — bandeira, quatro
 * últimos dígitos, validade. Número e código de segurança nunca passam por este
 * servidor: quem os recebe é o SDK do gateway, direto do navegador, e o que
 * chega aqui é um token de uso único.
 */

/** Mais que isso é carteira, não conveniência. */
const MAXIMO_POR_PESSOA = 5;

type Gateway = {
  ensureCustomer: (dados: { email: string; nome?: string | null; cpf?: string | null }) => Promise<string>;
  saveCard: (dados: { customerId: string; cardToken: string }) => Promise<{
    cardId: string;
    bandeira: string | null;
    ultimosDigitos: string;
    validadeMes: number | null;
    validadeAno: number | null;
  }>;
  deleteCard: (dados: { customerId: string; cardId: string }) => Promise<void>;
};

export type CartaoParaLeitura = {
  id: string;
  bandeira: string | null;
  ultimos_digitos: string;
  validade_mes: number | null;
  validade_ano: number | null;
  apelido: string | null;
  principal: boolean;
  /** O identificador que o navegador usa para gerar o token com o CVV. */
  card_id: string;
};

export async function listarCartoes(usuarioId: string, tenantId: string): Promise<CartaoParaLeitura[]> {
  const cartoes = await prisma.cartaoSalvo.findMany({
    where: { usuario_id: usuarioId, tenant_id: tenantId },
    orderBy: [{ principal: 'desc' }, { criado_em: 'desc' }],
    select: {
      id: true,
      bandeira: true,
      ultimos_digitos: true,
      validade_mes: true,
      validade_ano: true,
      apelido: true,
      principal: true,
      card_id: true
    }
  });

  return Array.isArray(cartoes) ? cartoes : [];
}

export async function salvarCartao({
  usuarioId,
  tenantId,
  cardToken,
  apelido,
  gateway
}: {
  usuarioId: string;
  tenantId: string;
  cardToken: string;
  apelido?: string;
  gateway: Gateway;
}) {
  if (!cardToken) {
    throw new ValidationError('Envie o token gerado pelo navegador — o número do cartão não passa por aqui.');
  }

  const usuario = await prisma.usuario.findFirst({
    where: { id: usuarioId, tenant_id: tenantId },
    select: { id: true, email: true, nome: true, cpf: true }
  });
  if (!usuario) throw new NotFoundError('Usuário não encontrado');

  const quantos = await prisma.cartaoSalvo.count({ where: { usuario_id: usuarioId } });
  if (quantos >= MAXIMO_POR_PESSOA) {
    throw new ConflictError(`Você já tem ${MAXIMO_POR_PESSOA} cartões guardados. Remova um para adicionar outro.`);
  }

  const customerId = await gateway.ensureCustomer({
    email: usuario.email,
    nome: usuario.nome,
    cpf: usuario.cpf
  });

  const cartao = await gateway.saveCard({ customerId, cardToken });

  // O mesmo cartão salvo duas vezes não é erro do tutor: é ele tentando de novo
  // porque a primeira parecia não ter funcionado. Atualiza em vez de recusar.
  return prisma.cartaoSalvo.upsert({
    where: {
      usuario_id_gateway_card_id: {
        usuario_id: usuarioId,
        gateway: 'mercadopago',
        card_id: cartao.cardId
      }
    },
    update: {
      customer_id: customerId,
      bandeira: cartao.bandeira,
      ultimos_digitos: cartao.ultimosDigitos,
      validade_mes: cartao.validadeMes,
      validade_ano: cartao.validadeAno,
      ...(apelido?.trim() ? { apelido: apelido.trim().slice(0, 40) } : {})
    },
    create: {
      tenant_id: tenantId,
      usuario_id: usuarioId,
      gateway: 'mercadopago',
      customer_id: customerId,
      card_id: cartao.cardId,
      bandeira: cartao.bandeira,
      ultimos_digitos: cartao.ultimosDigitos,
      validade_mes: cartao.validadeMes,
      validade_ano: cartao.validadeAno,
      apelido: apelido?.trim() ? apelido.trim().slice(0, 40) : null,
      // O primeiro vira o principal sozinho: ninguém quer escolher padrão numa
      // carteira de um cartão só.
      principal: quantos === 0
    },
    select: {
      id: true,
      bandeira: true,
      ultimos_digitos: true,
      validade_mes: true,
      validade_ano: true,
      apelido: true,
      principal: true,
      card_id: true
    }
  });
}

export async function removerCartao({
  cartaoId,
  usuarioId,
  tenantId,
  gateway
}: {
  cartaoId: string;
  usuarioId: string;
  tenantId: string;
  gateway: Gateway;
}) {
  const cartao = await prisma.cartaoSalvo.findFirst({
    where: { id: cartaoId, usuario_id: usuarioId, tenant_id: tenantId },
    select: { id: true, customer_id: true, card_id: true, principal: true }
  });
  if (!cartao) throw new NotFoundError('Cartão não encontrado');

  // Apagar no gateway é o que de fato remove o cartão. Se falhar lá, a linha
  // fica: some da tela um cartão que continuaria cobrável, e isso é pior.
  await gateway.deleteCard({ customerId: cartao.customer_id, cardId: cartao.card_id });
  await prisma.cartaoSalvo.delete({ where: { id: cartao.id } });

  // Carteira não pode ficar sem principal: o checkout deixaria de pré-escolher.
  if (cartao.principal) {
    const proximo = await prisma.cartaoSalvo.findFirst({
      where: { usuario_id: usuarioId },
      orderBy: { criado_em: 'desc' },
      select: { id: true }
    });
    if (proximo) {
      await prisma.cartaoSalvo.update({ where: { id: proximo.id }, data: { principal: true } });
    }
  }

  return { id: cartaoId };
}

export async function definirPrincipal({
  cartaoId,
  usuarioId,
  tenantId
}: {
  cartaoId: string;
  usuarioId: string;
  tenantId: string;
}) {
  const cartao = await prisma.cartaoSalvo.findFirst({
    where: { id: cartaoId, usuario_id: usuarioId, tenant_id: tenantId },
    select: { id: true }
  });
  if (!cartao) throw new NotFoundError('Cartão não encontrado');

  // Os dois na mesma transação: uma carteira com dois principais, ou nenhum,
  // faria o checkout escolher sozinho o cartão errado.
  await prisma.$transaction([
    prisma.cartaoSalvo.updateMany({ where: { usuario_id: usuarioId }, data: { principal: false } }),
    prisma.cartaoSalvo.update({ where: { id: cartaoId }, data: { principal: true } })
  ]);

  return { id: cartaoId, principal: true };
}

export { MAXIMO_POR_PESSOA };
