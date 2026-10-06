import prisma from '../../config/database';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../middleware/error.middleware';
import { comissaoDaLoja } from './loja.service';
import { verCarrinho } from './carrinho.service';
import { cotarEntregaDaLoja } from './entrega.service';
import { cotarTransportadoras, escolherServico, type PacoteDoPedido } from './frete-transportadora.service';
import type { EntregaMercado, Prisma, StatusPedidoMercado } from '@prisma/client';

/**
 * O pedido do Saúde Pet Mercado.
 *
 * Aqui mora a única parte do módulo que mexe com dinheiro e com estoque ao mesmo
 * tempo, e por isso é a que mais precisa ser explícita:
 *
 * **O estoque baixa no fechamento, não no pagamento.** Entre gerar o Pix e o
 * dinheiro cair passam minutos; se o estoque só baixasse na confirmação, dois
 * tutores pagariam pelo mesmo último saco de ração e um dos dois receberia um
 * pedido impossível de separar. A baixa acontece num UPDATE condicional dentro
 * da transação — quem chegar depois do último item recebe "acabou" antes de
 * pagar, não depois.
 *
 * **O que reserva também devolve.** Pedido cancelado, recusado ou vencido sem
 * pagamento devolve cada item para a prateleira. É o `expira_em` que fecha esse
 * ciclo quando ninguém cancela nada: o carrinho abandonado não pode prender o
 * estoque da loja para sempre.
 */

/** Quanto tempo o pedido segura o estoque esperando o pagamento. */
export const MINUTOS_ATE_EXPIRAR = 60;

/** Estados em que o estoque está reservado e precisa voltar se o pedido morrer. */
const ESTOQUE_RESERVADO: StatusPedidoMercado[] = [
  'aguardando_pagamento',
  'pago',
  'em_separacao',
  'pronto'
];

/** O que a loja ainda pode cancelar, e o que o tutor ainda pode cancelar. */
const CANCELAVEL_PELA_LOJA: StatusPedidoMercado[] = ['aguardando_pagamento', 'pago', 'em_separacao', 'pronto'];
const CANCELAVEL_PELO_TUTOR: StatusPedidoMercado[] = ['aguardando_pagamento', 'pago'];

/**
 * As transições que a loja pode fazer, e só elas.
 *
 * Sem uma tabela como esta, "avançar o pedido" vira um `update` livre e um
 * pedido volta de `concluido` para `em_separacao` por causa de um toque duplo.
 */
const AVANCO_DA_LOJA: Partial<Record<StatusPedidoMercado, StatusPedidoMercado>> = {
  pago: 'em_separacao',
  em_separacao: 'pronto',
  pronto: 'concluido'
};

const SELECAO_PEDIDO = {
  id: true,
  codigo: true,
  status: true,
  entrega_tipo: true,
  entrega_endereco: true,
  entrega_cep: true,
  entrega_numero: true,
  entrega_complemento: true,
  entrega_cidade: true,
  entrega_distancia_km: true,
  frete_servico: true,
  frete_transportadora: true,
  frete_prazo: true,
  frete_peso_gramas: true,
  frete_altura_cm: true,
  frete_largura_cm: true,
  frete_comprimento_cm: true,
  rastreio_codigo: true,
  etiqueta_url: true,
  declaracao_url: true,
  etiqueta_emitida_em: true,
  subtotal: true,
  desconto: true,
  frete: true,
  total: true,
  comissao_pct: true,
  comissao_valor: true,
  repasse_loja: true,
  payment_id: true,
  assinatura_id: true,
  exige_receita: true,
  observacao: true,
  cancelado_motivo: true,
  expira_em: true,
  pago_em: true,
  separado_em: true,
  pronto_em: true,
  concluido_em: true,
  cancelado_em: true,
  criado_em: true,
  loja: {
    select: {
      id: true,
      nome_fantasia: true,
      slug: true,
      telefone: true,
      whatsapp: true,
      endereco: true,
      complemento: true,
      bairro: true,
      cidade: true,
      estado: true,
      cep: true,
      numero: true,
      prazo_preparo_min: true,
      entrega_prazo_horas: true
    }
  },
  itens: {
    select: {
      id: true,
      produto_id: true,
      nome: true,
      sku: true,
      unidade: true,
      preco_unitario: true,
      quantidade: true,
      subtotal: true,
      exige_receita: true,
      variacao: true,
      prazo_encomenda_dias: true,
      peso_gramas: true
    }
  }
} satisfies Prisma.PedidoMercadoSelect;

/**
 * Código curto para o balcão.
 *
 * Sem I, O, 0 e 1: quem lê o código em voz alta no telefone não deveria ter de
 * explicar se é a letra ou o número.
 */
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function codigoAleatorio(): string {
  let saida = '';
  for (let i = 0; i < 6; i += 1) {
    saida += ALFABETO[Math.floor(Math.random() * ALFABETO.length)];
  }
  return `MER-${saida}`;
}

const texto = (valor: unknown): string => String(valor ?? '').trim();

export async function registrarEvento(
  tx: Prisma.TransactionClient,
  dados: {
    pedidoId: string;
    status: StatusPedidoMercado;
    statusAnterior?: StatusPedidoMercado | null;
    atorId?: string | null;
    atorPapel?: string | null;
    origem: string;
    motivo?: string | null;
  }
) {
  return tx.eventoPedidoMercado.create({
    data: {
      pedido_id: dados.pedidoId,
      status: dados.status,
      status_anterior: dados.statusAnterior ?? null,
      ator_id: dados.atorId ?? null,
      ator_papel: dados.atorPapel ?? null,
      origem: dados.origem,
      motivo: dados.motivo ?? null
    }
  });
}

/**
 * Devolve para a prateleira o que o pedido tinha reservado.
 *
 * O `where` com `controla_estoque` não é zelo: item de loja que não faz contagem
 * NUNCA reservou nada no fechamento, e incrementar a coluna dele aqui criaria
 * estoque do nada — número inventado numa coluna que ninguém alimenta.
 */
async function devolverEstoque(tx: Prisma.TransactionClient, pedidoId: string) {
  const itens = await tx.itemPedidoMercado.findMany({
    where: { pedido_id: pedidoId, produto_id: { not: null } },
    select: { produto_id: true, quantidade: true }
  });

  for (const item of itens) {
    if (!item.produto_id) continue;
    await tx.produtoMercado.updateMany({
      where: { id: item.produto_id, controla_estoque: true, sob_encomenda: false },
      data: { estoque: { increment: item.quantidade } }
    });
  }
}

// ── Fechamento ────────────────────────────────────────────────────────────────

export async function fecharPedido(params: {
  tenantId: string;
  tutorId: string;
  lojaId: string;
  entregaTipo: string;
  endereco?: {
    endereco?: unknown;
    cep?: unknown;
    numero?: unknown;
    complemento?: unknown;
    cidade?: unknown;
    latitude?: unknown;
    longitude?: unknown;
  } | null;
  freteServico?: unknown;
  observacao?: string | null;
  /**
   * Pedido de um ciclo de assinatura. O desconto e o frete grátis são os que
   * a loja prometeu a quem assina (congelados na assinatura); o prazo para
   * pagar é maior porque ninguém está na tela esperando o Pix — é um aviso.
   */
  assinatura?: { id: string; descontoPct: number; freteGratis: boolean; horasParaPagar: number } | null;
}) {
  const carrinho = await verCarrinho({
    tenantId: params.tenantId,
    tutorId: params.tutorId,
    lojaId: params.lojaId
  });
  if (!carrinho) throw new NotFoundError('Carrinho não encontrado.');
  if (carrinho.impedimentos.length > 0) {
    // A tela lista todos, mas o erro precisa caber numa frase: o primeiro
    // impedimento é o que a pessoa tem de resolver antes dos outros.
    throw new ConflictError(carrinho.impedimentos.join(' '));
  }

  const entregaTipo = texto(params.entregaTipo) as EntregaMercado;
  if (entregaTipo !== 'retirada' && entregaTipo !== 'combinar' && entregaTipo !== 'loja' && entregaTipo !== 'transportadora') {
    // `entregador` existe no enum e ainda não tem quem entregue. Aceitar aqui
    // seria vender uma entrega que não sai.
    throw new ValidationError('Escolha uma forma de entrega disponível para esta loja.');
  }

  if (entregaTipo === 'retirada' && !carrinho.loja.aceita_retirada) {
    throw new ValidationError('Esta loja não faz retirada no balcão.');
  }
  if (entregaTipo === 'combinar' && !carrinho.loja.aceita_combinar) {
    throw new ValidationError('Esta loja não combina entrega no momento.');
  }
  if (entregaTipo === 'loja' && !carrinho.loja.aceita_entrega) {
    throw new ValidationError('Esta loja não entrega em casa.');
  }
  if (entregaTipo === 'transportadora' && !carrinho.loja.aceita_transportadora) {
    throw new ValidationError('Esta loja não envia por transportadora.');
  }

  type EnderecoDoPedido = {
    entrega_endereco: string | null;
    entrega_cep: string | null;
    entrega_numero: string | null;
    entrega_complemento: string | null;
    entrega_cidade: string | null;
    entrega_latitude: number | null;
    entrega_longitude: number | null;
  };

  let entrega: EnderecoDoPedido = {
    entrega_endereco: null,
    entrega_cep: null,
    entrega_numero: null,
    entrega_complemento: null,
    entrega_cidade: null,
    entrega_latitude: null,
    entrega_longitude: null
  };

  if (entregaTipo === 'combinar' || entregaTipo === 'loja' || entregaTipo === 'transportadora') {
    const informado = params.endereco || {};
    if (texto(informado.endereco).length < 5) {
      throw new ValidationError('Informe o endereço de entrega.');
    }
    const cep = texto(informado.cep).replace(/\D/g, '');
    const numero = texto(informado.numero);
    if (entregaTipo === 'transportadora' && cep.length !== 8) {
      throw new ValidationError('Informe o CEP de entrega com 8 dígitos.');
    }
    if (entregaTipo === 'transportadora' && !numero) {
      throw new ValidationError('Informe o número do endereço de entrega.');
    }
    const coordenada = (valor: unknown): number | null =>
      valor === null || valor === undefined || valor === '' || !Number.isFinite(Number(valor)) ? null : Number(valor);
    // Cópia, não referência: mudar o endereço salvo amanhã não pode reescrever
    // para onde este pedido foi hoje.
    entrega = {
      entrega_endereco: texto(informado.endereco),
      entrega_cep: cep || null,
      entrega_numero: numero || null,
      entrega_complemento: texto(informado.complemento) || null,
      entrega_cidade: texto(informado.cidade) || carrinho.loja.cidade,
      entrega_latitude: coordenada(informado.latitude),
      entrega_longitude: coordenada(informado.longitude)
    };
  }

  const loja = await prisma.lojaMercado.findFirst({
    where: { id: params.lojaId, tenant_id: params.tenantId },
    select: { id: true, comissao_pct: true }
  });
  if (!loja) throw new NotFoundError('Loja não encontrada.');

  const subtotal = carrinho.subtotal;

  // Entrega pela loja: o frete é calculado AQUI, de novo, pela mesma função da
  // cotação do carrinho. O que a tela mostrou é uma cotação; o que vale é o que
  // o fechamento calcula — e os dois saem da mesma conta, então não divergem.
  let frete = 0;
  let distanciaKm: number | null = null;
  let freteServico: string | null = null;
  let freteTransportadora: string | null = null;
  let fretePrazo: string | null = null;
  let pacote: PacoteDoPedido | null = null;
  if (entregaTipo === 'loja') {
    if (entrega.entrega_latitude === null || entrega.entrega_longitude === null) {
      throw new ValidationError('Confirme o endereço de entrega no mapa para a loja calcular o frete.');
    }
    const cotacao = await cotarEntregaDaLoja({
      tenantId: params.tenantId,
      lojaId: params.lojaId,
      latitude: entrega.entrega_latitude,
      longitude: entrega.entrega_longitude,
      subtotal
    });
    if (!cotacao.disponivel) {
      throw new ValidationError(cotacao.motivo || 'Esta loja não entrega neste endereço.');
    }
    frete = cotacao.frete;
    distanciaKm = cotacao.distancia_km;
  }
  if (entregaTipo === 'transportadora') {
    const { opcoes, pacote: pacoteCotado } = await cotarTransportadoras({
      carrinho,
      cepDestino: entrega.entrega_cep
    });
    const opcao = escolherServico(opcoes, params.freteServico);
    frete = opcao.valor;
    freteServico = opcao.servico;
    freteTransportadora = opcao.transportadora;
    fretePrazo = opcao.prazo;
    pacote = pacoteCotado;

    const tutor = await prisma.usuario.findFirst({
      where: { id: params.tutorId, tenant_id: params.tenantId },
      select: { cpf: true, telefone: true }
    });
    if (!tutor?.cpf || tutor.cpf.replace(/\D/g, '').length !== 11 || !tutor.telefone || tutor.telefone.replace(/\D/g, '').length < 10) {
      throw new ValidationError('Complete CPF e telefone no seu perfil antes de escolher transportadora.');
    }
  }

  // Assinatura: o desconto sai dos produtos e é da loja (é ela quem o
  // oferece), e o frete grátis só faz sentido onde há frete — na entrega
  // pela própria loja.
  const assinatura = params.assinatura || null;
  const descontoPct = assinatura ? Math.max(0, Math.min(50, Number(assinatura.descontoPct) || 0)) : 0;
  const desconto = Math.round(subtotal * (descontoPct / 100) * 100) / 100;
  if (assinatura?.freteGratis && entregaTipo === 'loja') {
    frete = 0;
  }
  const subtotalComDesconto = Math.round((subtotal - desconto) * 100) / 100;

  const comissaoPct = await comissaoDaLoja({ tenantId: params.tenantId, comissaoDaLoja: loja.comissao_pct });
  // A comissão incide sobre os PRODUTOS (já com o desconto da assinatura: a
  // plataforma não cobra comissão sobre o que a loja abriu mão). O frete é da
  // loja inteiro: é ela quem põe a moto na rua, e cobrar comissão sobre
  // gasolina seria cobrar duas vezes.
  const comissaoValor = Math.round(subtotalComDesconto * (comissaoPct / 100) * 100) / 100;
  const total = Math.round((subtotalComDesconto + frete) * 100) / 100;
  // O frete da CepCerto repõe a carteira operacional da plataforma; ele não é
  // repasse da loja. Na entrega própria, continua indo inteiro para a loja.
  const repasseLoja = Math.round(((entregaTipo === 'transportadora' ? subtotalComDesconto : total) - comissaoValor) * 100) / 100;

  const expiraEm = assinatura
    ? new Date(Date.now() + Math.max(1, assinatura.horasParaPagar) * 60 * 60 * 1000)
    : new Date(Date.now() + MINUTOS_ATE_EXPIRAR * 60 * 1000);

  const pedido = await prisma.$transaction(async (tx) => {
    // Quem conta estoque, baixa; quem não conta, não. Ler os produtos aqui
    // dentro (e não confiar no que o carrinho leu segundos atrás) é o que faz
    // duas compras simultâneas do último item se excluírem.
    const produtos = await tx.produtoMercado.findMany({
      where: { id: { in: carrinho.itens.map((item) => item.produto_id) } },
      select: { id: true, nome: true, ativo: true, controla_estoque: true, sob_encomenda: true }
    });
    const porId = new Map(produtos.map((produto) => [produto.id, produto]));

    for (const item of carrinho.itens) {
      const produto = porId.get(item.produto_id);
      if (!produto || !produto.ativo) {
        throw new ConflictError(`"${item.nome}" saiu do catálogo. Revise o carrinho.`);
      }

      // Loja que não faz contagem vende enquanto tem e confere na separação —
      // não há número para reservar. Item sob encomenda também não: ele nem
      // está na loja ainda.
      if (!produto.controla_estoque || produto.sob_encomenda) continue;

      // O `estoque >= n` no WHERE é a trava real: a segunda compra do último
      // item atualiza zero linhas e cai aqui, ANTES de existir cobrança.
      const baixa = await tx.produtoMercado.updateMany({
        where: { id: item.produto_id, ativo: true, estoque: { gte: item.quantidade_disponivel } },
        data: { estoque: { decrement: item.quantidade_disponivel } }
      });
      if (baixa.count !== 1) {
        throw new ConflictError(`"${item.nome}" acabou de sair de estoque. Revise o carrinho.`);
      }
    }

    // Colisão de código é remota (32^6), mas não impossível — e um índice único
    // transformaria isso num erro 500 no meio do checkout.
    let criado = null as Prisma.PedidoMercadoGetPayload<{ select: typeof SELECAO_PEDIDO }> | null;
    for (let tentativa = 0; tentativa < 5 && !criado; tentativa += 1) {
      try {
        criado = await tx.pedidoMercado.create({
          data: {
            tenant_id: params.tenantId,
            loja_id: params.lojaId,
            tutor_id: params.tutorId,
            codigo: codigoAleatorio(),
            status: 'aguardando_pagamento',
            entrega_tipo: entregaTipo,
            ...entrega,
            subtotal,
            desconto,
            frete,
            assinatura_id: assinatura?.id ?? null,
            entrega_distancia_km: distanciaKm,
            frete_servico: freteServico,
            frete_transportadora: freteTransportadora,
            frete_prazo: fretePrazo,
            frete_peso_gramas: pacote?.pesoGramas ?? null,
            frete_altura_cm: pacote?.alturaCm ?? null,
            frete_largura_cm: pacote?.larguraCm ?? null,
            frete_comprimento_cm: pacote?.comprimentoCm ?? null,
            total,
            comissao_pct: comissaoPct,
            comissao_valor: comissaoValor,
            repasse_loja: repasseLoja,
            exige_receita: carrinho.exige_receita,
            observacao: texto(params.observacao) || null,
            expira_em: expiraEm,
            itens: {
              create: carrinho.itens.map((item) => ({
                produto_id: item.produto_id,
                nome: item.nome,
                sku: null,
                variacao: item.variacao,
                unidade: item.unidade,
                preco_unitario: item.preco,
                quantidade: item.quantidade_disponivel,
                subtotal: item.subtotal,
                exige_receita: item.exige_receita,
                prazo_encomenda_dias: item.sob_encomenda ? item.prazo_reposicao_dias : null,
                peso_gramas: item.peso_gramas
              }))
            }
          },
          select: SELECAO_PEDIDO
        });
      } catch (erro) {
        const codigoPrisma = (erro as { code?: string })?.code;
        if (codigoPrisma !== 'P2002') throw erro;
      }
    }
    if (!criado) throw new ConflictError('Não foi possível gerar o código do pedido. Tente de novo.');

    await registrarEvento(tx, {
      pedidoId: criado.id,
      status: 'aguardando_pagamento',
      origem: assinatura ? 'assinatura' : 'tutor',
      atorId: params.tutorId,
      atorPapel: 'tutor',
      motivo: assinatura ? 'Pedido gerado pelo ciclo da assinatura' : null
    });

    // O carrinho vira pedido: mantê-lo aberto faria o tutor comprar duas vezes
    // ao voltar para a tela anterior.
    await tx.carrinhoMercado.deleteMany({
      where: { tenant_id: params.tenantId, tutor_id: params.tutorId, loja_id: params.lojaId }
    });

    return criado;
  });

  return pedido;
}

// ── Leitura ───────────────────────────────────────────────────────────────────

export async function pedidoDoTutor(params: { tenantId: string; tutorId: string; pedidoId: string }) {
  const pedido = await prisma.pedidoMercado.findFirst({
    where: { id: params.pedidoId, tenant_id: params.tenantId, tutor_id: params.tutorId },
    select: SELECAO_PEDIDO
  });
  if (!pedido) throw new NotFoundError('Pedido não encontrado.');
  return pedido;
}

export async function listarPedidosDoTutor(params: { tenantId: string; tutorId: string; limite?: number }) {
  return prisma.pedidoMercado.findMany({
    where: { tenant_id: params.tenantId, tutor_id: params.tutorId },
    select: SELECAO_PEDIDO,
    orderBy: { criado_em: 'desc' },
    take: Math.min(Math.max(Number(params.limite) || 30, 1), 60)
  });
}

export async function listarPedidosDaLoja(params: {
  tenantId: string;
  lojaId: string;
  status?: string | null;
  limite?: number;
}) {
  const where: Prisma.PedidoMercadoWhereInput = { tenant_id: params.tenantId, loja_id: params.lojaId };

  if (params.status === 'abertos') {
    // A fila de trabalho da loja: o que está pago e ainda não saiu. Pedido
    // esperando pagamento não é trabalho dela — é do tutor.
    where.status = { in: ['pago', 'em_separacao', 'pronto'] };
  } else if (params.status) {
    where.status = params.status as StatusPedidoMercado;
  }

  return prisma.pedidoMercado.findMany({
    where,
    select: {
      ...SELECAO_PEDIDO,
      tutor: { select: { id: true, nome: true, telefone: true } }
    },
    orderBy: [{ criado_em: 'desc' }],
    take: Math.min(Math.max(Number(params.limite) || 50, 1), 100)
  });
}

export async function linhaDoTempo(params: { tenantId: string; pedidoId: string }) {
  const pedido = await prisma.pedidoMercado.findFirst({
    where: { id: params.pedidoId, tenant_id: params.tenantId },
    select: { id: true }
  });
  if (!pedido) throw new NotFoundError('Pedido não encontrado.');

  return prisma.eventoPedidoMercado.findMany({
    where: { pedido_id: pedido.id },
    orderBy: { criado_em: 'asc' }
  });
}

// ── Transições ────────────────────────────────────────────────────────────────

/**
 * Pagamento confirmado.
 *
 * Chamado pelo webhook do gateway, que pode repetir o mesmo evento — por isso a
 * transição é condicionada ao estado atual em vez de escrever direto: reprocessar
 * um webhook não pode empurrar de novo um pedido que a loja já separou.
 */
export async function marcarComoPago(params: {
  pedidoId: string;
  paymentId?: string | null;
  origem?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const pedido = await tx.pedidoMercado.findUnique({
      where: { id: params.pedidoId },
      select: { id: true, status: true, loja_id: true, tutor_id: true, codigo: true, assinatura_id: true }
    });
    if (!pedido) return null;
    if (pedido.status !== 'aguardando_pagamento' && pedido.status !== 'pagamento_falhou') {
      return pedido;
    }

    if (pedido.assinatura_id) {
      const { registrarCicloPago } = await import('./assinatura.service');
      await registrarCicloPago(tx, pedido.assinatura_id);
    }

    const atualizado = await tx.pedidoMercado.update({
      where: { id: pedido.id },
      data: {
        status: 'pago',
        pago_em: new Date(),
        // Pago é pago: o prazo que devolvia o estoque não vale mais.
        expira_em: null,
        ...(params.paymentId ? { payment_id: params.paymentId } : {})
      },
      select: { id: true, status: true, loja_id: true, tutor_id: true, codigo: true }
    });

    await registrarEvento(tx, {
      pedidoId: pedido.id,
      status: 'pago',
      statusAnterior: pedido.status,
      origem: params.origem || 'webhook'
    });

    return atualizado;
  });
}

export async function marcarPagamentoFalhou(params: { pedidoId: string; motivo?: string | null }) {
  return prisma.$transaction(async (tx) => {
    const pedido = await tx.pedidoMercado.findUnique({
      where: { id: params.pedidoId },
      select: { id: true, status: true }
    });
    if (!pedido || pedido.status !== 'aguardando_pagamento') return null;

    // O estoque volta na hora. Manter reservado um pedido que o cartão recusou
    // é tirar da prateleira o que ninguém comprou — e o tutor pode tentar de
    // novo montando o carrinho, que é o caminho que o app já oferece.
    await devolverEstoque(tx, pedido.id);

    const atualizado = await tx.pedidoMercado.update({
      where: { id: pedido.id },
      data: { status: 'pagamento_falhou' },
      select: { id: true, status: true }
    });

    await registrarEvento(tx, {
      pedidoId: pedido.id,
      status: 'pagamento_falhou',
      statusAnterior: pedido.status,
      origem: 'webhook',
      motivo: params.motivo || null
    });

    return atualizado;
  });
}

/** A loja empurra o pedido um passo: pago → em separação → pronto → concluído. */
export async function avancarPelaLoja(params: {
  tenantId: string;
  lojaId: string;
  pedidoId: string;
  atorId: string;
}) {
  return prisma.$transaction(async (tx) => {
    const pedido = await tx.pedidoMercado.findFirst({
      where: { id: params.pedidoId, tenant_id: params.tenantId, loja_id: params.lojaId },
      select: { id: true, status: true, exige_receita: true, entrega_tipo: true, rastreio_codigo: true }
    });
    if (!pedido) throw new NotFoundError('Pedido não encontrado.');

    const proximo = AVANCO_DA_LOJA[pedido.status];
    if (!proximo) {
      throw new ConflictError(`Não há próximo passo para um pedido ${pedido.status}.`);
    }
    if (pedido.entrega_tipo === 'transportadora' && pedido.status === 'em_separacao' && !pedido.rastreio_codigo) {
      throw new ValidationError('Emita a etiqueta antes de marcar o pedido como despachado.');
    }

    const agora = new Date();
    const carimbo: Prisma.PedidoMercadoUpdateInput = { status: proximo };
    if (proximo === 'em_separacao') carimbo.separado_em = agora;
    if (proximo === 'pronto') carimbo.pronto_em = agora;
    if (proximo === 'concluido') carimbo.concluido_em = agora;

    const atualizado = await tx.pedidoMercado.update({
      where: { id: pedido.id },
      data: carimbo,
      select: SELECAO_PEDIDO
    });

    await registrarEvento(tx, {
      pedidoId: pedido.id,
      status: proximo,
      statusAnterior: pedido.status,
      origem: 'loja',
      atorId: params.atorId,
      atorPapel: 'loja',
      // O item sob prescrição precisa deixar rastro de que alguém conferiu a
      // receita antes de separar — é obrigação legal da loja, não zelo nosso.
      motivo: pedido.exige_receita && proximo === 'em_separacao'
        ? 'Separação iniciada com item sob prescrição veterinária'
        : null
    });

    return atualizado;
  });
}

export async function cancelarPedido(params: {
  tenantId: string;
  pedidoId: string;
  motivo: string;
  atorId: string;
  atorPapel: 'tutor' | 'loja' | 'admin';
  lojaId?: string | null;
  tutorId?: string | null;
}) {
  const motivo = texto(params.motivo);
  if (motivo.length < 3) {
    throw new ValidationError('Escreva o motivo do cancelamento.');
  }

  return prisma.$transaction(async (tx) => {
    const where: Prisma.PedidoMercadoWhereInput = { id: params.pedidoId, tenant_id: params.tenantId };
    if (params.atorPapel === 'loja') where.loja_id = String(params.lojaId);
    if (params.atorPapel === 'tutor') where.tutor_id = String(params.tutorId);

    const pedido = await tx.pedidoMercado.findFirst({
      where,
      select: { id: true, status: true, payment_id: true, codigo: true, loja_id: true, tutor_id: true, rastreio_codigo: true }
    });
    if (!pedido) throw new NotFoundError('Pedido não encontrado.');

    const permitidos = params.atorPapel === 'tutor' ? CANCELAVEL_PELO_TUTOR : CANCELAVEL_PELA_LOJA;
    if (!permitidos.includes(pedido.status)) {
      throw new ForbiddenError(
        params.atorPapel === 'tutor'
          ? 'Este pedido já entrou em separação. Fale com a loja pelo telefone dela.'
          : `Não dá para cancelar um pedido ${pedido.status}.`
      );
    }
    if (pedido.rastreio_codigo) {
      throw new ConflictError('Cancele a postagem com a equipe antes de cancelar este pedido.');
    }

    if (ESTOQUE_RESERVADO.includes(pedido.status)) {
      await devolverEstoque(tx, pedido.id);
    }

    const atualizado = await tx.pedidoMercado.update({
      where: { id: pedido.id },
      data: {
        status: 'cancelado',
        cancelado_em: new Date(),
        cancelado_motivo: motivo,
        cancelado_por: params.atorId,
        expira_em: null
      },
      select: SELECAO_PEDIDO
    });

    await registrarEvento(tx, {
      pedidoId: pedido.id,
      status: 'cancelado',
      statusAnterior: pedido.status,
      origem: params.atorPapel,
      atorId: params.atorId,
      atorPapel: params.atorPapel,
      motivo
    });

    // Cancelar pedido pago sem devolver o dinheiro seria ficar com o que não é
    // nosso. O estorno é executado por quem cancela (controller), porque
    // depende do gateway; aqui só dizemos que ele é devido.
    return { pedido: atualizado, estornoDevido: pedido.status === 'pago' && Boolean(pedido.payment_id), paymentId: pedido.payment_id };
  });
}

export async function marcarComoReembolsado(params: { pedidoId: string; motivo?: string | null }) {
  return prisma.$transaction(async (tx) => {
    const pedido = await tx.pedidoMercado.findUnique({
      where: { id: params.pedidoId },
      select: { id: true, status: true }
    });
    if (!pedido) return null;

    const atualizado = await tx.pedidoMercado.update({
      where: { id: pedido.id },
      data: { status: 'reembolsado' },
      select: { id: true, status: true }
    });

    await registrarEvento(tx, {
      pedidoId: pedido.id,
      status: 'reembolsado',
      statusAnterior: pedido.status,
      origem: 'admin',
      motivo: params.motivo || null
    });

    return atualizado;
  });
}

/**
 * Pedido que venceu esperando pagamento.
 *
 * Devolve o estoque e fecha o pedido. Sem isto, um Pix gerado e esquecido
 * prenderia o último item do catálogo da loja indefinidamente — e a loja veria
 * "sem estoque" numa prateleira cheia.
 */
export async function expirarPedidosVencidos(agora = new Date()) {
  const vencidos = await prisma.pedidoMercado.findMany({
    where: { status: 'aguardando_pagamento', expira_em: { not: null, lt: agora } },
    select: { id: true },
    take: 200
  });

  let expirados = 0;
  for (const vencido of vencidos) {
    try {
      await prisma.$transaction(async (tx) => {
        // Reler dentro da transação: o webhook do pagamento pode ter chegado
        // entre a busca e agora, e expirar um pedido já pago seria devolver ao
        // estoque o que a loja precisa separar.
        const pedido = await tx.pedidoMercado.findFirst({
          where: { id: vencido.id, status: 'aguardando_pagamento' },
          select: { id: true, status: true, assinatura_id: true }
        });
        if (!pedido) return;

        await devolverEstoque(tx, pedido.id);
        if (pedido.assinatura_id) {
          const { registrarCicloPerdido } = await import('./assinatura.service');
          await registrarCicloPerdido(tx, pedido.assinatura_id);
        }
        await tx.pedidoMercado.update({
          where: { id: pedido.id },
          data: {
            status: 'cancelado',
            cancelado_em: new Date(),
            cancelado_motivo: 'Pagamento não confirmado no prazo',
            expira_em: null
          }
        });
        await registrarEvento(tx, {
          pedidoId: pedido.id,
          status: 'cancelado',
          statusAnterior: 'aguardando_pagamento',
          origem: 'worker',
          motivo: 'Pagamento não confirmado no prazo'
        });
        expirados += 1;
      });
    } catch (erro) {
      console.error('[mercado] falha ao expirar pedido', vencido.id, (erro as Error).message);
    }
  }

  return { verificados: vencidos.length, expirados };
}

export { SELECAO_PEDIDO, AVANCO_DA_LOJA, CANCELAVEL_PELA_LOJA, CANCELAVEL_PELO_TUTOR };
