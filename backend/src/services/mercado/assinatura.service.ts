import prisma from '../../config/database';
import { ConflictError, NotFoundError, ValidationError } from '../../middleware/error.middleware';
import { adicionarItem } from './carrinho.service';
import { LOJA_PUBLICA } from './comum';
import { cotarEntregaDaLoja } from './entrega.service';
import { fecharPedido } from './pedido.service';
import { avisarCicloDaAssinatura, avisarAssinaturaPausada } from './notificacao-mercado.service';
import type { EntregaMercado, Prisma, StatusAssinaturaMercado } from '@prisma/client';

/**
 * Assinatura de ração com entrega programada — a terceira fatia do mercado.
 *
 * O que ela é: o tutor escolhe o saco, a cada quantos dias quer receber e como
 * recebe. No dia, nasce um pedido igual a qualquer outro (mesmo estoque, mesma
 * comissão, mesma fila da loja), com o desconto e o frete grátis que a loja
 * prometeu para quem assina, e o tutor recebe o aviso com o Pix pronto.
 *
 * O que ela NÃO é: cobrança automática. O checkout não guarda cartão sem CVV
 * (decisão de 24/08) e o preapproval do Mercado Pago não está contratado.
 * Então o ciclo é um lembrete com o pedido já montado — honesto, e já mede a
 * recorrência que o plano comercial quer ver. Quando a cobrança automática
 * existir, `gerarCiclo` passa a chamar o gateway depois de fechar o pedido e o
 * resto continua igual.
 *
 * Três regras que vieram da operação e não da tela:
 *
 * 1. **O desconto é congelado no ato de assinar.** A loja muda a política
 *    quando quiser; quem já assinou tem o que leu.
 * 2. **Três ciclos vencidos seguidos pausam a assinatura.** Cada ciclo reserva
 *    estoque por 24 h; gerar pedido para quem parou de pagar só prende a
 *    prateleira da loja.
 * 3. **Transportadora fica de fora.** A cotação depende de CPF e de uma
 *    chamada à CepCerto por ciclo; entrega programada é coisa de loja perto.
 */

/** Quanto tempo o pedido do ciclo espera o pagamento antes de devolver o estoque. */
export const HORAS_PARA_PAGAR_O_CICLO = 24;
/** Ciclos vencidos seguidos que pausam a assinatura. */
export const CICLOS_PERDIDOS_PARA_PAUSAR = 3;
export const FREQUENCIA_MINIMA_DIAS = 7;
export const FREQUENCIA_MAXIMA_DIAS = 90;
const QUANTIDADE_MAXIMA_POR_ITEM = 10;

const ENTREGAS_DA_ASSINATURA: EntregaMercado[] = ['retirada', 'combinar', 'loja'];

const texto = (valor: unknown): string => String(valor ?? '').trim();
const arredondar = (valor: number): number => Math.round(valor * 100) / 100;

// ── Frequência sugerida ───────────────────────────────────────────────────────

/**
 * Consumo diário aproximado, em gramas, por porte. São médias de tabela de
 * fabricante para adulto — servem para SUGERIR a frequência, e o tutor ajusta.
 * Gato não tem porte no cadastro; vai pela espécie.
 */
const CONSUMO_DIARIO_GRAMAS: Record<string, number> = {
  gato: 60,
  pequeno: 150,
  medio: 300,
  grande: 450
};

export function frequenciaSugerida(params: {
  especie?: string | null;
  porte?: string | null;
  pesoGramas?: number | null;
  quantidade?: number;
}): { dias: number; consumo_diario_gramas: number | null } {
  const quantidade = Math.max(1, Math.trunc(Number(params.quantidade ?? 1)) || 1);
  const especie = texto(params.especie).toLowerCase();
  const porte = texto(params.porte).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  const consumo = especie === 'gato' ? CONSUMO_DIARIO_GRAMAS.gato : CONSUMO_DIARIO_GRAMAS[porte] ?? null;
  const pesoGramas = Number(params.pesoGramas || 0);

  if (!consumo || !pesoGramas) {
    // Sem peso do saco ou sem porte não há conta — 30 dias é o intervalo que
    // a maioria das lojas já pratica e que o tutor entende sem explicação.
    return { dias: 30, consumo_diario_gramas: consumo };
  }

  const dias = Math.floor((pesoGramas * quantidade) / consumo);
  return {
    dias: Math.max(FREQUENCIA_MINIMA_DIAS, Math.min(FREQUENCIA_MAXIMA_DIAS, dias)),
    consumo_diario_gramas: consumo
  };
}

function frequenciaValida(valor: unknown): number {
  const dias = Math.trunc(Number(valor));
  if (!Number.isInteger(dias) || dias < FREQUENCIA_MINIMA_DIAS || dias > FREQUENCIA_MAXIMA_DIAS) {
    throw new ValidationError(`A frequência precisa ficar entre ${FREQUENCIA_MINIMA_DIAS} e ${FREQUENCIA_MAXIMA_DIAS} dias.`);
  }
  return dias;
}

// ── Leitura ───────────────────────────────────────────────────────────────────

const SELECAO_ASSINATURA = {
  id: true,
  status: true,
  frequencia_dias: true,
  proximo_ciclo_em: true,
  entrega_tipo: true,
  entrega_endereco: true,
  entrega_cep: true,
  entrega_numero: true,
  entrega_complemento: true,
  entrega_cidade: true,
  entrega_latitude: true,
  entrega_longitude: true,
  desconto_pct: true,
  frete_gratis: true,
  ciclos_gerados: true,
  ciclos_pagos: true,
  ciclos_perdidos_seguidos: true,
  ultimo_pedido_id: true,
  ultimo_erro: true,
  observacao: true,
  pausada_em: true,
  cancelada_em: true,
  cancelado_motivo: true,
  criado_em: true,
  loja: {
    select: { id: true, nome_fantasia: true, slug: true, cidade: true, telefone: true, whatsapp: true, aceita_assinatura: true }
  },
  pet: { select: { id: true, nome: true, porte: true, tipo: true, especie: true } },
  itens: {
    select: {
      id: true,
      produto_id: true,
      quantidade: true,
      produto: {
        select: {
          id: true,
          nome: true,
          variacao: true,
          tamanho: true,
          unidade: true,
          peso_gramas: true,
          preco: true,
          preco_promocional: true,
          imagem_url: true,
          ativo: true,
          loja_id: true
        }
      }
    }
  }
} satisfies Prisma.AssinaturaMercadoSelect;

export type AssinaturaLida = Prisma.AssinaturaMercadoGetPayload<{ select: typeof SELECAO_ASSINATURA }>;

export async function listarAssinaturasDoTutor(params: { tenantId: string; tutorId: string }) {
  return prisma.assinaturaMercado.findMany({
    where: { tenant_id: params.tenantId, tutor_id: params.tutorId },
    select: SELECAO_ASSINATURA,
    orderBy: [{ status: 'asc' }, { proximo_ciclo_em: 'asc' }]
  });
}

export async function assinaturaDoTutor(params: { tenantId: string; tutorId: string; assinaturaId: string }) {
  const assinatura = await prisma.assinaturaMercado.findFirst({
    where: { id: params.assinaturaId, tenant_id: params.tenantId, tutor_id: params.tutorId },
    select: SELECAO_ASSINATURA
  });
  if (!assinatura) throw new NotFoundError('Assinatura não encontrada.');
  return assinatura;
}

/** O que a loja vê dos seus assinantes: quem, o quê, quando vem o próximo. */
export async function listarAssinaturasDaLoja(params: { tenantId: string; lojaId: string }) {
  return prisma.assinaturaMercado.findMany({
    where: { tenant_id: params.tenantId, loja_id: params.lojaId },
    select: {
      ...SELECAO_ASSINATURA,
      tutor: { select: { id: true, nome: true, telefone: true } }
    },
    orderBy: [{ status: 'asc' }, { proximo_ciclo_em: 'asc' }]
  });
}

// ── Criação ───────────────────────────────────────────────────────────────────

type EnderecoInformado = {
  endereco?: unknown;
  cep?: unknown;
  numero?: unknown;
  complemento?: unknown;
  cidade?: unknown;
  latitude?: unknown;
  longitude?: unknown;
};

type EnderecoDaAssinatura = {
  entrega_endereco: string | null;
  entrega_cep: string | null;
  entrega_numero: string | null;
  entrega_complemento: string | null;
  entrega_cidade: string | null;
  entrega_latitude: number | null;
  entrega_longitude: number | null;
};

function normalizarEndereco(informado: EnderecoInformado | null | undefined, cidadeDaLoja: string): EnderecoDaAssinatura {
  const dados = informado || {};
  if (texto(dados.endereco).length < 5) {
    throw new ValidationError('Informe o endereço de entrega da assinatura.');
  }
  const coordenada = (valor: unknown): number | null =>
    valor === null || valor === undefined || valor === '' || !Number.isFinite(Number(valor)) ? null : Number(valor);
  return {
    entrega_endereco: texto(dados.endereco),
    entrega_cep: texto(dados.cep).replace(/\D/g, '') || null,
    entrega_numero: texto(dados.numero) || null,
    entrega_complemento: texto(dados.complemento) || null,
    entrega_cidade: texto(dados.cidade) || cidadeDaLoja,
    entrega_latitude: coordenada(dados.latitude),
    entrega_longitude: coordenada(dados.longitude)
  };
}

async function validarEntrega(params: {
  tenantId: string;
  loja: { id: string; cidade: string; aceita_retirada: boolean; aceita_combinar: boolean; aceita_entrega: boolean };
  entregaTipo: string;
  endereco?: EnderecoInformado | null;
  subtotal: number;
}): Promise<{ entregaTipo: EntregaMercado; endereco: EnderecoDaAssinatura }> {
  const entregaTipo = texto(params.entregaTipo || 'retirada') as EntregaMercado;
  if (!ENTREGAS_DA_ASSINATURA.includes(entregaTipo)) {
    throw new ValidationError('A assinatura pode ser retirada, combinada com a loja ou entregue pela loja.');
  }
  if (entregaTipo === 'retirada' && !params.loja.aceita_retirada) {
    throw new ValidationError('Esta loja não faz retirada no balcão.');
  }
  if (entregaTipo === 'combinar' && !params.loja.aceita_combinar) {
    throw new ValidationError('Esta loja não combina entrega no momento.');
  }
  if (entregaTipo === 'loja' && !params.loja.aceita_entrega) {
    throw new ValidationError('Esta loja não entrega em casa.');
  }

  const vazio: EnderecoDaAssinatura = {
    entrega_endereco: null,
    entrega_cep: null,
    entrega_numero: null,
    entrega_complemento: null,
    entrega_cidade: null,
    entrega_latitude: null,
    entrega_longitude: null
  };
  if (entregaTipo === 'retirada') return { entregaTipo, endereco: vazio };

  const endereco = normalizarEndereco(params.endereco, params.loja.cidade);
  if (entregaTipo === 'loja') {
    if (endereco.entrega_latitude === null || endereco.entrega_longitude === null) {
      throw new ValidationError('Confirme o endereço no mapa para a loja calcular a entrega.');
    }
    // A mesma conta do fechamento: assinar para um endereço fora do raio
    // geraria um pedido impossível todo mês.
    const cotacao = await cotarEntregaDaLoja({
      tenantId: params.tenantId,
      lojaId: params.loja.id,
      latitude: endereco.entrega_latitude,
      longitude: endereco.entrega_longitude,
      subtotal: params.subtotal
    });
    if (!cotacao.disponivel) {
      throw new ValidationError(cotacao.motivo || 'Esta loja não entrega neste endereço.');
    }
  }
  return { entregaTipo, endereco };
}

export async function criarAssinatura(params: {
  tenantId: string;
  tutorId: string;
  itens: Array<{ produto_id?: unknown; quantidade?: unknown }>;
  frequenciaDias?: unknown;
  petId?: unknown;
  entregaTipo?: unknown;
  endereco?: EnderecoInformado | null;
  observacao?: unknown;
  /** Gera o primeiro pedido na hora (padrão). `false` só agenda. */
  gerarPrimeiroCiclo?: boolean;
}) {
  const itensPedidos = (params.itens || [])
    .map((item) => ({
      produto_id: texto(item.produto_id),
      quantidade: Math.trunc(Number(item.quantidade ?? 1))
    }))
    .filter((item) => item.produto_id);
  if (itensPedidos.length === 0) {
    throw new ValidationError('Escolha pelo menos um produto para assinar.');
  }
  for (const item of itensPedidos) {
    if (!Number.isInteger(item.quantidade) || item.quantidade < 1 || item.quantidade > QUANTIDADE_MAXIMA_POR_ITEM) {
      throw new ValidationError(`Escolha uma quantidade entre 1 e ${QUANTIDADE_MAXIMA_POR_ITEM} por produto.`);
    }
  }

  const produtos = await prisma.produtoMercado.findMany({
    where: {
      id: { in: itensPedidos.map((item) => item.produto_id) },
      tenant_id: params.tenantId,
      ativo: true,
      loja: LOJA_PUBLICA
    },
    select: {
      id: true,
      nome: true,
      preco: true,
      preco_promocional: true,
      peso_gramas: true,
      sob_encomenda: true,
      exige_receita: true,
      loja: {
        select: {
          id: true,
          cidade: true,
          aceita_assinatura: true,
          assinatura_desconto_pct: true,
          assinatura_frete_gratis: true,
          aceita_retirada: true,
          aceita_combinar: true,
          aceita_entrega: true
        }
      }
    }
  });
  if (produtos.length !== itensPedidos.length) {
    throw new NotFoundError('Algum dos produtos não está mais disponível.');
  }

  const lojas = new Set(produtos.map((produto) => produto.loja.id));
  if (lojas.size !== 1) {
    throw new ValidationError('Uma assinatura é de uma loja só. Assine os produtos de cada loja separadamente.');
  }
  const loja = produtos[0].loja;
  if (!loja.aceita_assinatura) {
    throw new ConflictError('Esta loja ainda não vende por assinatura.');
  }
  if (produtos.some((produto) => produto.exige_receita)) {
    throw new ValidationError('Produto que exige receita não entra em assinatura — a receita precisa ser conferida a cada compra.');
  }

  const subtotal = arredondar(
    produtos.reduce((total, produto) => {
      const item = itensPedidos.find((candidato) => candidato.produto_id === produto.id);
      const promocional = produto.preco_promocional === null ? null : Number(produto.preco_promocional);
      const preco = promocional && promocional > 0 && promocional < Number(produto.preco) ? promocional : Number(produto.preco);
      return total + preco * (item?.quantidade || 1);
    }, 0)
  );

  const { entregaTipo, endereco } = await validarEntrega({
    tenantId: params.tenantId,
    loja,
    entregaTipo: texto(params.entregaTipo || 'retirada'),
    endereco: params.endereco,
    subtotal
  });

  // Pet é opcional, mas quando vem precisa ser do tutor — id adivinhado não
  // pode pendurar assinatura no animal de outra pessoa.
  let pet: { id: string; porte: string | null; tipo: string | null; especie: string | null } | null = null;
  const petId = texto(params.petId);
  if (petId) {
    pet = await prisma.pet.findFirst({
      where: { id: petId, tenant_id: params.tenantId, tutor_id: params.tutorId },
      select: { id: true, porte: true, tipo: true, especie: true }
    });
    if (!pet) throw new NotFoundError('Pet não encontrado.');
  }

  const principal = produtos[0];
  const quantidadePrincipal = itensPedidos.find((item) => item.produto_id === principal.id)?.quantidade || 1;
  const frequenciaDias =
    params.frequenciaDias === undefined || params.frequenciaDias === null || params.frequenciaDias === ''
      ? frequenciaSugerida({
          especie: pet?.especie || pet?.tipo,
          porte: pet?.porte,
          pesoGramas: principal.peso_gramas,
          quantidade: quantidadePrincipal
        }).dias
      : frequenciaValida(params.frequenciaDias);

  const gerarAgora = params.gerarPrimeiroCiclo !== false;
  const agora = new Date();

  const assinatura = await prisma.assinaturaMercado.create({
    data: {
      tenant_id: params.tenantId,
      loja_id: loja.id,
      tutor_id: params.tutorId,
      pet_id: pet?.id ?? null,
      status: 'ativa',
      frequencia_dias: frequenciaDias,
      // O primeiro ciclo é agora (o tutor está comprando) ou daqui a um período
      // (já tem ração em casa e só quer programar a próxima).
      proximo_ciclo_em: gerarAgora ? agora : new Date(agora.getTime() + frequenciaDias * 86_400_000),
      entrega_tipo: entregaTipo,
      ...endereco,
      desconto_pct: Number(loja.assinatura_desconto_pct || 0),
      frete_gratis: Boolean(loja.assinatura_frete_gratis),
      observacao: texto(params.observacao) || null,
      itens: { create: itensPedidos.map((item) => ({ produto_id: item.produto_id, quantidade: item.quantidade })) }
    },
    select: SELECAO_ASSINATURA
  });

  if (!gerarAgora) return { assinatura, pedido: null };

  const ciclo = await gerarCiclo({ assinaturaId: assinatura.id, origem: 'tutor' });
  return { assinatura: await assinaturaDoTutor({ tenantId: params.tenantId, tutorId: params.tutorId, assinaturaId: assinatura.id }), pedido: ciclo.pedido };
}

// ── Ciclo ─────────────────────────────────────────────────────────────────────

/**
 * Gera o pedido de um ciclo.
 *
 * Monta o carrinho com os itens da assinatura e fecha pelo MESMO `fecharPedido`
 * da compra avulsa — estoque, comissão, código e eventos iguais. O que muda é
 * o desconto, o frete grátis e o prazo maior para pagar, que o fechamento
 * aplica quando recebe `assinatura`.
 *
 * Falhou (item saiu do catálogo, estoque zerado, fora do raio)? A assinatura
 * não morre: guarda o motivo, tenta de novo amanhã e avisa o tutor. Quem
 * decide cancelar é a pessoa, não um `catch`.
 */
export async function gerarCiclo(params: { assinaturaId: string; origem: 'tutor' | 'worker' }) {
  const assinatura = await prisma.assinaturaMercado.findUnique({
    where: { id: params.assinaturaId },
    select: {
      id: true,
      tenant_id: true,
      tutor_id: true,
      loja_id: true,
      status: true,
      frequencia_dias: true,
      proximo_ciclo_em: true,
      entrega_tipo: true,
      entrega_endereco: true,
      entrega_cep: true,
      entrega_numero: true,
      entrega_complemento: true,
      entrega_cidade: true,
      entrega_latitude: true,
      entrega_longitude: true,
      desconto_pct: true,
      frete_gratis: true,
      ciclos_gerados: true,
      itens: { select: { produto_id: true, quantidade: true } }
    }
  });
  if (!assinatura) throw new NotFoundError('Assinatura não encontrada.');
  if (assinatura.status !== 'ativa') {
    throw new ConflictError(`A assinatura está ${assinatura.status} e não gera pedido.`);
  }

  const proximo = new Date(Date.now() + assinatura.frequencia_dias * 86_400_000);

  try {
    // Carrinho da loja vira o carrinho do ciclo: o que estava lá seria
    // misturado ao pedido da assinatura, e o tutor pagaria por engano.
    // `deleteMany`, e não `esvaziarCarrinho`: não ter carrinho é o caso comum
    // do ciclo, não um erro.
    await prisma.carrinhoMercado.deleteMany({
      where: { tenant_id: assinatura.tenant_id, tutor_id: assinatura.tutor_id, loja_id: assinatura.loja_id }
    });
    for (const item of assinatura.itens) {
      await adicionarItem({
        tenantId: assinatura.tenant_id,
        tutorId: assinatura.tutor_id,
        produtoId: item.produto_id,
        quantidade: item.quantidade
      });
    }

    const pedido = await fecharPedido({
      tenantId: assinatura.tenant_id,
      tutorId: assinatura.tutor_id,
      lojaId: assinatura.loja_id,
      entregaTipo: assinatura.entrega_tipo,
      endereco:
        assinatura.entrega_tipo === 'retirada'
          ? null
          : {
              endereco: assinatura.entrega_endereco,
              cep: assinatura.entrega_cep,
              numero: assinatura.entrega_numero,
              complemento: assinatura.entrega_complemento,
              cidade: assinatura.entrega_cidade,
              latitude: assinatura.entrega_latitude,
              longitude: assinatura.entrega_longitude
            },
      observacao: `Assinatura — ciclo ${assinatura.ciclos_gerados + 1}`,
      assinatura: {
        id: assinatura.id,
        descontoPct: Number(assinatura.desconto_pct || 0),
        freteGratis: assinatura.frete_gratis,
        horasParaPagar: HORAS_PARA_PAGAR_O_CICLO
      }
    });

    await prisma.assinaturaMercado.update({
      where: { id: assinatura.id },
      data: {
        proximo_ciclo_em: proximo,
        ciclos_gerados: { increment: 1 },
        ultimo_pedido_id: pedido.id,
        ultimo_erro: null
      }
    });

    avisarCicloDaAssinatura(pedido.id).catch(() => {});

    return { gerado: true as const, pedido, proximoCicloEm: proximo };
  } catch (erro) {
    const motivo = (erro as Error).message || 'Não foi possível gerar o pedido.';
    // Amanhã de novo, não daqui a um ciclo inteiro: o problema costuma ser
    // estoque, e a loja repõe em dias, não em meses.
    const amanha = new Date(Date.now() + 86_400_000);
    await prisma.assinaturaMercado.update({
      where: { id: assinatura.id },
      data: { proximo_ciclo_em: amanha, ultimo_erro: motivo }
    });
    if (params.origem === 'tutor') throw erro;
    return { gerado: false as const, motivo, proximoCicloEm: amanha };
  }
}

/** Ciclos vencidos: gera o pedido de cada assinatura ativa cuja hora chegou. */
export async function processarCiclosVencidos(agora = new Date()) {
  const vencidas = await prisma.assinaturaMercado.findMany({
    where: { status: 'ativa', proximo_ciclo_em: { lte: agora } },
    select: { id: true },
    orderBy: { proximo_ciclo_em: 'asc' },
    take: 100
  });

  let gerados = 0;
  let adiados = 0;
  for (const assinatura of vencidas) {
    try {
      const resultado = await gerarCiclo({ assinaturaId: assinatura.id, origem: 'worker' });
      if (resultado.gerado) gerados += 1;
      else adiados += 1;
    } catch (erro) {
      adiados += 1;
      console.error('[mercado] ciclo da assinatura falhou', assinatura.id, (erro as Error).message);
    }
  }
  return { verificadas: vencidas.length, gerados, adiados };
}

// ── Pagamento e vencimento do ciclo (chamados por pedido.service) ─────────────

/** O pedido do ciclo foi pago: zera a contagem de perdidos. */
export async function registrarCicloPago(tx: Prisma.TransactionClient, assinaturaId: string) {
  await tx.assinaturaMercado.updateMany({
    where: { id: assinaturaId },
    data: { ciclos_pagos: { increment: 1 }, ciclos_perdidos_seguidos: 0 }
  });
}

/**
 * O pedido do ciclo venceu sem pagamento. Três seguidos pausam a assinatura —
 * e avisam o tutor, que pode retomar quando quiser.
 */
export async function registrarCicloPerdido(tx: Prisma.TransactionClient, assinaturaId: string) {
  const assinatura = await tx.assinaturaMercado.findUnique({
    where: { id: assinaturaId },
    select: { id: true, status: true, ciclos_perdidos_seguidos: true }
  });
  if (!assinatura || assinatura.status !== 'ativa') return { pausou: false };

  const perdidos = assinatura.ciclos_perdidos_seguidos + 1;
  const pausar = perdidos >= CICLOS_PERDIDOS_PARA_PAUSAR;
  await tx.assinaturaMercado.update({
    where: { id: assinatura.id },
    data: {
      ciclos_perdidos_seguidos: perdidos,
      ...(pausar
        ? {
            status: 'pausada' as StatusAssinaturaMercado,
            pausada_em: new Date(),
            ultimo_erro: `${CICLOS_PERDIDOS_PARA_PAUSAR} pedidos seguidos venceram sem pagamento`
          }
        : {})
    }
  });
  if (pausar) avisarAssinaturaPausada(assinatura.id).catch(() => {});
  return { pausou: pausar };
}

// ── Gestão pelo tutor ─────────────────────────────────────────────────────────

async function assinaturaGerenciavel(params: { tenantId: string; tutorId: string; assinaturaId: string }) {
  const assinatura = await prisma.assinaturaMercado.findFirst({
    where: { id: params.assinaturaId, tenant_id: params.tenantId, tutor_id: params.tutorId },
    select: { id: true, status: true, frequencia_dias: true, proximo_ciclo_em: true }
  });
  if (!assinatura) throw new NotFoundError('Assinatura não encontrada.');
  return assinatura;
}

export async function pausarAssinatura(params: { tenantId: string; tutorId: string; assinaturaId: string }) {
  const assinatura = await assinaturaGerenciavel(params);
  if (assinatura.status === 'cancelada') throw new ConflictError('Assinatura cancelada não pode ser pausada.');
  if (assinatura.status === 'pausada') return assinaturaDoTutor(params);
  await prisma.assinaturaMercado.update({
    where: { id: assinatura.id },
    data: { status: 'pausada', pausada_em: new Date() }
  });
  return assinaturaDoTutor(params);
}

export async function retomarAssinatura(params: { tenantId: string; tutorId: string; assinaturaId: string }) {
  const assinatura = await assinaturaGerenciavel(params);
  if (assinatura.status === 'cancelada') throw new ConflictError('Assinatura cancelada não volta. Assine de novo.');
  if (assinatura.status === 'ativa') return assinaturaDoTutor(params);
  // Retomar depois de uma pausa longa não deve disparar pedido no mesmo
  // segundo: o próximo ciclo é daqui a um período — a pessoa decide se quer
  // um pedido agora pelo botão "pedir agora".
  await prisma.assinaturaMercado.update({
    where: { id: assinatura.id },
    data: {
      status: 'ativa',
      pausada_em: null,
      ciclos_perdidos_seguidos: 0,
      ultimo_erro: null,
      proximo_ciclo_em: new Date(Date.now() + assinatura.frequencia_dias * 86_400_000)
    }
  });
  return assinaturaDoTutor(params);
}

export async function cancelarAssinatura(params: { tenantId: string; tutorId: string; assinaturaId: string; motivo?: unknown }) {
  const assinatura = await assinaturaGerenciavel(params);
  if (assinatura.status === 'cancelada') return assinaturaDoTutor(params);
  await prisma.assinaturaMercado.update({
    where: { id: assinatura.id },
    data: { status: 'cancelada', cancelada_em: new Date(), cancelado_motivo: texto(params.motivo) || null }
  });
  return assinaturaDoTutor(params);
}

export async function alterarAssinatura(params: {
  tenantId: string;
  tutorId: string;
  assinaturaId: string;
  frequenciaDias?: unknown;
  quantidades?: Array<{ produto_id?: unknown; quantidade?: unknown }>;
}) {
  const assinatura = await assinaturaGerenciavel(params);
  if (assinatura.status === 'cancelada') throw new ConflictError('Assinatura cancelada não pode ser alterada.');

  const dados: Prisma.AssinaturaMercadoUpdateInput = {};
  if (params.frequenciaDias !== undefined && params.frequenciaDias !== null && params.frequenciaDias !== '') {
    const dias = frequenciaValida(params.frequenciaDias);
    dados.frequencia_dias = dias;
    // Mudar a frequência reprograma a partir do ÚLTIMO ciclo, não de hoje:
    // quem tinha um pedido há 20 dias e passa de 30 para 25 recebe em 5.
    const ultimo = new Date(assinatura.proximo_ciclo_em.getTime() - assinatura.frequencia_dias * 86_400_000);
    const proximo = new Date(ultimo.getTime() + dias * 86_400_000);
    dados.proximo_ciclo_em = proximo < new Date() ? new Date() : proximo;
  }

  await prisma.$transaction(async (tx) => {
    if (Object.keys(dados).length > 0) {
      await tx.assinaturaMercado.update({ where: { id: assinatura.id }, data: dados });
    }
    for (const item of params.quantidades || []) {
      const produtoId = texto(item.produto_id);
      const quantidade = Math.trunc(Number(item.quantidade));
      if (!produtoId) continue;
      if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > QUANTIDADE_MAXIMA_POR_ITEM) {
        throw new ValidationError(`Escolha uma quantidade entre 1 e ${QUANTIDADE_MAXIMA_POR_ITEM} por produto.`);
      }
      await tx.itemAssinaturaMercado.updateMany({
        where: { assinatura_id: assinatura.id, produto_id: produtoId },
        data: { quantidade }
      });
    }
  });

  return assinaturaDoTutor(params);
}

/** "Pedir agora": gera o ciclo hoje, e o próximo conta a partir de hoje. */
export async function pedirAgora(params: { tenantId: string; tutorId: string; assinaturaId: string }) {
  const assinatura = await assinaturaGerenciavel(params);
  if (assinatura.status !== 'ativa') throw new ConflictError('Retome a assinatura para pedir agora.');

  const aberto = await prisma.pedidoMercado.findFirst({
    where: { assinatura_id: assinatura.id, status: 'aguardando_pagamento' },
    select: { id: true }
  });
  if (aberto) throw new ConflictError('Já existe um pedido desta assinatura esperando pagamento.');

  const ciclo = await gerarCiclo({ assinaturaId: assinatura.id, origem: 'tutor' });
  return { assinatura: await assinaturaDoTutor(params), pedido: ciclo.gerado ? ciclo.pedido : null };
}

export { SELECAO_ASSINATURA, ENTREGAS_DA_ASSINATURA };
