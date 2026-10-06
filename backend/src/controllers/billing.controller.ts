import type { Request, Response } from 'express';
import type { PaymentMethod, Prisma, StatusTransacao, TipoTransacao, Transacao } from '@prisma/client';
import prisma from '../config/database';
import {
  AppError,
  asyncHandler,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
  ConflictError
} from '../middleware/error.middleware';
import PaymentGatewayService from '../services/payment-gateway.service';
import paymentService from '../services/payment/payment.service';
import cryptoService from '../services/crypto.service';
import AuditService from '../services/audit.service';
import { enviarParaUsuario } from '../services/push.service';

// Todas as rotas passam pelo `authMiddleware`; sem `req.user` o JavaScript
// estourava TypeError (500) ao ler `tenant_id`. Aqui o erro é nomeado.
const usuarioDe = (req: Request) => {
  if (!req.user) throw new UnauthorizedError();
  return req.user;
};

/** Primeiro valor de um parâmetro de query, como string; vazio vira undefined. */
const textoDaQuery = (valor: unknown): string | undefined => {
  if (valor === undefined || valor === null || valor === '') return undefined;
  return String(Array.isArray(valor) ? valor[0] : valor);
};

const ehString = (valor: unknown): valor is string => typeof valor === 'string';

/**
 * `Transacao` deixa tutor, veterinário e valores opcionais no schema, mas a
 * carteira precisa dos dois lados. Antes, uma linha incompleta chegava ao
 * Prisma com `null` e estourava erro de validação (500); o erro continua 500,
 * só que com nome.
 */
type TransacaoComVeterinario = Transacao & { veterinario_id: string; valor_veterinario: Prisma.Decimal };
type TransacaoComPartes = TransacaoComVeterinario & { tutor_id: string; valor_tutor: Prisma.Decimal };

function exigirVeterinario(transacao: Transacao): TransacaoComVeterinario {
  const { veterinario_id, valor_veterinario } = transacao;
  if (!veterinario_id || valor_veterinario === null) {
    throw new AppError(`Transação ${transacao.id} sem veterinário ou valor do veterinário`, 500);
  }
  return { ...transacao, veterinario_id, valor_veterinario };
}

function exigirPartes(transacao: Transacao): TransacaoComPartes {
  const comVeterinario = exigirVeterinario(transacao);
  const { tutor_id, valor_tutor } = comVeterinario;
  if (!tutor_id || valor_tutor === null) {
    throw new AppError(`Transação ${transacao.id} sem tutor ou valor do tutor`, 500);
  }
  return { ...comVeterinario, tutor_id, valor_tutor };
}

/** O que `criarPagamento` lê da resposta do gateway (o abstrato devolve `unknown`). */
type RespostaDoGateway = {
  success: boolean;
  error?: unknown;
  gateway_payment_id?: unknown;
  client_secret?: unknown;
  init_point?: unknown;
};

const lerRespostaDoGateway = (valor: unknown): RespostaDoGateway => {
  const objeto = typeof valor === 'object' && valor !== null ? (valor as Record<string, unknown>) : {};
  return {
    success: Boolean(objeto.success),
    error: objeto.error,
    gateway_payment_id: objeto.gateway_payment_id,
    client_secret: objeto.client_secret,
    init_point: objeto.init_point
  };
};

async function resolveVeterinarioId(usuarioId: string, tenantId: string): Promise<string> {
  const veterinario = await prisma.veterinario.findFirst({
    where: { usuario_id: usuarioId, tenant_id: tenantId },
    select: { id: true }
  });
  if (!veterinario) throw new NotFoundError('Veterinário não encontrado');
  return veterinario.id;
}

const formatarValor = (valor: unknown) =>
  Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// Aviso é best-effort: o repasse não pode falhar porque o push falhou.
async function notificarVeterinario(veterinarioId: string | null, tenantId: string, { titulo, corpo }: { titulo: string; corpo: string }) {
  if (!veterinarioId) return;
  try {
    const vet = await prisma.veterinario.findFirst({
      where: { id: veterinarioId, tenant_id: tenantId },
      select: { usuario_id: true }
    });
    if (vet && vet.usuario_id) {
      await enviarParaUsuario(vet.usuario_id, { title: titulo, body: corpo, url: '/veterinario/repasses' });
    }
  } catch {
    // silêncio proposital
  }
}

// ═══════════════════════════════════════════════════════
// SISTEMA DE BILLING E PAGAMENTOS
// ═══════════════════════════════════════════════════════

/**
 * Criar pagamento de atendimento
 * POST /api/v1/billing/pagamentos
 * Acesso: Tutor
 */
const criarPagamento = asyncHandler(async (req: Request, res: Response) => {
  const {
    atendimento_id,
    valor_total,
    metodo_pagamento,
    dados_pagamento,
    gateway = 'mercado_pago' // Único gateway do Saúde Pet
  } = req.body;
  void dados_pagamento;

  const usuario = usuarioDe(req);
  const tenant_id = String(usuario.tenant_id);
  const tutor_id = usuario.id;
  const atendimentoId = String(atendimento_id);

  // Verificar se atendimento existe e pertence ao tutor
  const atendimento = await prisma.solicitacao.findFirst({
    where: { id: atendimentoId, tenant_id, tutor_id },
    include: {
      veterinario: {
        include: {
          usuario: true
        }
      },
      // A cidade do tutor decide o percentual da plataforma.
      tutor: { select: { cidade: true } }
    }
  });

  if (!atendimento) {
    throw new NotFoundError('Atendimento não encontrado');
  }

  if (!atendimento.veterinario_id) {
    throw new ValidationError('Atendimento ainda não tem veterinário atribuído');
  }

  // O percentual era constante aqui (15%) enquanto o plano do produto diz 20 —
  // cinco pontos sobre todo o faturamento decididos por uma linha de código.
  // Agora vem da cidade do atendimento, e mudar comissão não exige deploy.
  const cidadeDoAtendimento = atendimento.tutor?.cidade || null;
  const cidade = cidadeDoAtendimento
    ? await prisma.cidadeCobertura.findFirst({
        where: {
          tenant_id: atendimento.tenant_id,
          nome: { equals: cidadeDoAtendimento, mode: 'insensitive' },
          ativo: true
        },
        select: { percentual_plataforma: true }
      })
    : null;

  const percentualPlataforma = Number(cidade?.percentual_plataforma ?? 20);
  const valorPlataforma = (valor_total * percentualPlataforma) / 100;
  const valorVeterinario = valor_total - valorPlataforma;

  // INTEGRAÇÃO COM GATEWAY DE PAGAMENTO
  let gateway_transacao_id: string | null = null;
  let gateway_resposta: string | null = null;
  let status_inicial: StatusTransacao = 'pendente';

  try {
    // Obter instância do gateway configurado para o tenant
    const gatewayInstance = await PaymentGatewayService.getGateway(tenant_id, String(gateway));

    // Criar pagamento no gateway
    const resultado = lerRespostaDoGateway(await gatewayInstance.createPaymentIntent(
      valor_total,
      'BRL',
      {
        descricao: `Atendimento Saúde Pet - ${atendimentoId.substring(0, 8)}`,
        external_reference: atendimentoId,
        tutor_email: usuario.email,
        tutor_nome: usuario.nome,
        veterinario_nome: atendimento.veterinario?.usuario.nome
      }
    ));

    if (!resultado.success) {
      throw new ValidationError(`Erro ao criar pagamento: ${resultado.error}`);
    }

    gateway_transacao_id = resultado.gateway_payment_id === undefined || resultado.gateway_payment_id === null
      ? null
      : String(resultado.gateway_payment_id);
    gateway_resposta = JSON.stringify(resultado);

    // Se tem client_secret, significa que precisa de confirmação do cliente
    if (resultado.client_secret) {
      status_inicial = 'processando';
    }

  } catch (error) {
    // Se falhar a integração com gateway, logar mas ainda criar transação
    console.error('❌ Erro ao integrar com gateway:', error instanceof Error ? error.message : String(error));

    throw new ValidationError('Não foi possível iniciar o pagamento no gateway configurado.');
  }

  // Criar transação no banco
  const transacao = await prisma.transacao.create({
    data: {
      tenant_id,
      tipo: 'pagamento_atendimento',
      status: status_inicial,
      valor_total,
      valor_tutor: valor_total,
      valor_veterinario: valorVeterinario,
      valor_plataforma: valorPlataforma,
      percentual_plataforma: percentualPlataforma,
      atendimento_id: atendimentoId,
      tutor_id,
      veterinario_id: atendimento.veterinario_id,
      metodo_pagamento,
      gateway_transacao_id,
      gateway_resposta,
      descricao: `Pagamento do atendimento ${atendimentoId.substring(0, 8)}`
    }
  });

  // Parsear resposta do gateway para retornar dados úteis
  let payment_details: { init_point: unknown; gateway_payment_id: unknown } | null = null;
  if (gateway_resposta) {
    try {
      const parsed = lerRespostaDoGateway(JSON.parse(gateway_resposta));
      payment_details = {
        init_point: parsed.init_point, // Checkout do Mercado Pago
        gateway_payment_id: parsed.gateway_payment_id
      };
    } catch {
      // Ignorar erro de parse
    }
  }

  return res.status(201).json({
    message: 'Pagamento iniciado com sucesso',
    transacao: {
      ...transacao,
      valor_total: Number(transacao.valor_total),
      valor_tutor: Number(transacao.valor_tutor),
      valor_veterinario: Number(transacao.valor_veterinario),
      valor_plataforma: Number(transacao.valor_plataforma),
      gateway_resposta: undefined // Não expor resposta completa
    },
    payment_details
  });
});

/**
 * Processar aprovação de pagamento (webhook do gateway)
 * POST /api/v1/billing/pagamentos/:id/aprovar
 * Acesso: Sistema/Admin
 */
const aprovarPagamento = asyncHandler(async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const { gateway_transacao_id, gateway_resposta } = req.body;
  const tenantId = String(req.tenantId);

  const transacao = await prisma.transacao.findFirst({
    where: { id, tenant_id: tenantId }
  });

  if (!transacao) {
    throw new NotFoundError('Transação não encontrada');
  }

  if (['aprovada', 'concluida'].includes(transacao.status)) {
    return res.json({ message: 'Pagamento já processado', transacao });
  }

  if (!['pendente', 'processando'].includes(transacao.status)) {
    throw new ValidationError('Transação não pode ser aprovada no status atual');
  }

  // Reivindicar o processamento de forma idempotente antes de alterar carteiras.
  const claimed = await prisma.transacao.updateMany({
    where: { id, tenant_id: tenantId, status: { in: ['pendente', 'processando'] } },
    data: {
      status: 'aprovada',
      gateway_transacao_id,
      gateway_resposta: JSON.stringify(gateway_resposta),
      processado_em: new Date()
    }
  });

  if (claimed.count !== 1) {
    const current = await prisma.transacao.findFirst({ where: { id, tenant_id: tenantId } });
    return res.json({ message: 'Pagamento já processado', transacao: current });
  }

  const partes = exigirPartes(transacao);

  // Atualizar carteira do veterinário (saldo pendente)
  await prisma.carteiraVeterinario.upsert({
    where: { veterinario_id: partes.veterinario_id },
    create: {
      tenant_id: partes.tenant_id,
      veterinario_id: partes.veterinario_id,
      saldo_pendente: partes.valor_veterinario
    },
    update: {
      saldo_pendente: {
        increment: partes.valor_veterinario
      }
    }
  });

  // Atualizar carteira do tutor
  await prisma.carteiraTutor.upsert({
    where: { tutor_id: partes.tutor_id },
    create: {
      tenant_id: partes.tenant_id,
      tutor_id: partes.tutor_id,
      total_gasto: partes.valor_tutor
    },
    update: {
      total_gasto: {
        increment: partes.valor_tutor
      }
    }
  });

  return res.json({
    message: 'Pagamento aprovado com sucesso',
    transacao: await prisma.transacao.findFirst({ where: { id, tenant_id: tenantId } })
  });
});

/**
 * Confirmar pagamento (após compensação)
 * POST /api/v1/billing/pagamentos/:id/confirmar
 * Acesso: Sistema/Admin
 */
const confirmarPagamento = asyncHandler(async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const tenantId = String(req.tenantId);

  const transacao = await prisma.transacao.findFirst({
    where: { id, tenant_id: tenantId }
  });

  if (!transacao) {
    throw new NotFoundError('Transação não encontrada');
  }

  if (transacao.status !== 'aprovada') {
    throw new ValidationError('Apenas transações aprovadas podem ser confirmadas');
  }

  const claimed = await prisma.transacao.updateMany({
    where: { id, tenant_id: tenantId, status: 'aprovada' },
    data: {
      status: 'concluida',
      concluido_em: new Date()
    }
  });

  if (claimed.count !== 1) {
    const current = await prisma.transacao.findFirst({ where: { id, tenant_id: tenantId } });
    return res.json({ message: 'Pagamento já confirmado', transacao: current });
  }

  const comVeterinario = exigirVeterinario(transacao);

  // Mover saldo de pendente para disponível
  await prisma.carteiraVeterinario.update({
    where: { veterinario_id: comVeterinario.veterinario_id },
    data: {
      saldo_pendente: {
        decrement: comVeterinario.valor_veterinario
      },
      saldo_disponivel: {
        increment: comVeterinario.valor_veterinario
      },
      total_recebido: {
        increment: comVeterinario.valor_veterinario
      }
    }
  });

  return res.json({
    message: 'Pagamento confirmado com sucesso',
    transacao: await prisma.transacao.findFirst({ where: { id, tenant_id: tenantId } })
  });
});

/**
 * Solicitar transferência (veterinário)
 * POST /api/v1/billing/transferencias
 * Acesso: Veterinário
 */
const solicitarTransferencia = asyncHandler(async (req: Request, res: Response) => {
  const { valor, dados_bancarios } = req.body;
  const usuario = usuarioDe(req);
  const tenant_id = String(usuario.tenant_id);
  const veterinario_id = await resolveVeterinarioId(usuario.id, tenant_id);

  const carteira = await prisma.carteiraVeterinario.findFirst({
    where: { veterinario_id, tenant_id }
  });

  if (!carteira) {
    throw new NotFoundError('Carteira não encontrada');
  }

  if (Number(carteira.saldo_disponivel) < valor) {
    throw new ValidationError('Saldo insuficiente para transferência');
  }

  // Um pedido aberto por vez. Sem isto, dois toques no botão (ou a tela lenta
  // na rede do celular) geravam duas solicitações e DOIS débitos do saldo.
  const emAberto = await prisma.transacao.findFirst({
    where: {
      tenant_id,
      veterinario_id,
      tipo: 'transferencia_vet',
      status: { in: ['pendente', 'processando', 'aprovada'] }
    },
    select: { id: true }
  });

  if (emAberto) {
    throw new ConflictError(
      'Você já tem um pedido de transferência em andamento. Aguarde a confirmação antes de solicitar outro.'
    );
  }

  const transacao = await prisma.$transaction(async (tx) => {
    // Débito condicional: o `updateMany` com `gte` só atinge a linha se o saldo
    // ainda cobrir o valor NA HORA da escrita. A versão anterior decrementava
    // sem condição, então duas requisições concorrentes deixavam o saldo
    // negativo — e o vet via dinheiro que não existia mais.
    const debitado = await tx.carteiraVeterinario.updateMany({
      where: { veterinario_id, tenant_id, saldo_disponivel: { gte: valor } },
      data: {
        saldo_disponivel: { decrement: valor },
        // Dado bancário é dado sensível: ia em JSON puro aqui, enquanto o mesmo
        // dado em `Veterinario.dados_bancarios` já era criptografado.
        dados_bancarios: cryptoService.encrypt(JSON.stringify(dados_bancarios))
      }
    });

    if (debitado.count === 0) {
      throw new ValidationError('Saldo insuficiente para transferência');
    }

    return tx.transacao.create({
      data: {
        tenant_id,
        tipo: 'transferencia_vet',
        status: 'pendente',
        valor_total: valor,
        valor_veterinario: valor,
        veterinario_id,
        descricao: 'Solicitação de transferência bancária'
      }
    });
  });

  return res.status(201).json({
    // O texto anterior prometia "será processada em até 2 dias úteis" e NADA no
    // sistema processava: a transação nascia pendente e morria pendente,
    // enquanto o saldo já tinha sumido da tela. Agora o pedido cai numa fila que
    // o admin vê e liquida em `/admin/repasses`.
    message: 'Pedido de transferência registrado. Você recebe a confirmação assim que o repasse for feito.',
    transacao: {
      ...transacao,
      valor_total: Number(transacao.valor_total)
    }
  });
});

// ═══════════════════════════════════════════════════════
// FILA DE REPASSES (ADMIN)
//
// O pedido do veterinário debitava o saldo e criava uma transação pendente que
// nenhum ponto do sistema lia: não havia rota, worker nem tela que pagasse
// aquilo. O dinheiro saía da tela do profissional e não chegava a lugar nenhum.
// ═══════════════════════════════════════════════════════

/**
 * Listar pedidos de transferência
 * GET /api/v1/billing/admin/transferencias
 * Acesso: Admin
 */
const listarTransferencias = asyncHandler(async (req: Request, res: Response) => {
  const status = textoDaQuery(req.query.status) ?? 'pendente';
  const tenant_id = String(usuarioDe(req).tenant_id);

  const transferencias = await prisma.transacao.findMany({
    where: {
      tenant_id,
      tipo: 'transferencia_vet',
      // O valor vai ao Prisma como veio da URL; fora do enum ele recusa a consulta.
      ...(status && status !== 'todos' ? { status: status as StatusTransacao } : {})
    },
    orderBy: { criado_em: 'asc' },
    take: 200
  });

  // Os dados bancários vivem na carteira, não na transação. Buscamos as
  // carteiras envolvidas de uma vez em vez de uma consulta por linha.
  const veterinarioIds = [...new Set(transferencias.map((t) => t.veterinario_id).filter(ehString))];

  const [carteiras, veterinarios] = await Promise.all([
    prisma.carteiraVeterinario.findMany({
      where: { tenant_id, veterinario_id: { in: veterinarioIds } }
    }),
    prisma.veterinario.findMany({
      where: { tenant_id, id: { in: veterinarioIds } },
      select: { id: true, crmv: true, usuario: { select: { nome: true, email: true, telefone: true } } }
    })
  ]);

  const carteiraPorVet = new Map(carteiras.map((c) => [c.veterinario_id, c]));
  const vetPorId = new Map(veterinarios.map((v) => [v.id, v]));

  const lista = transferencias.map((transferencia) => {
    const carteira = transferencia.veterinario_id ? carteiraPorVet.get(transferencia.veterinario_id) : undefined;
    let dadosBancarios: unknown = null;

    if (carteira && carteira.dados_bancarios) {
      try {
        dadosBancarios = JSON.parse(String(cryptoService.decrypt(carteira.dados_bancarios)));
      } catch {
        // Carteira gravada antes da criptografia: o JSON ainda está em claro.
        // Ler assim mesmo é melhor do que esconder do admin um repasse pendente.
        try { dadosBancarios = JSON.parse(carteira.dados_bancarios); } catch { dadosBancarios = null; }
      }
    }

    const vet = transferencia.veterinario_id ? vetPorId.get(transferencia.veterinario_id) : undefined;

    return {
      id: transferencia.id,
      status: transferencia.status,
      valor: Number(transferencia.valor_total),
      criado_em: transferencia.criado_em,
      concluido_em: transferencia.concluido_em,
      notas: transferencia.notas,
      veterinario: vet
        ? { id: vet.id, nome: vet.usuario?.nome, email: vet.usuario?.email, telefone: vet.usuario?.telefone, crmv: vet.crmv }
        : null,
      dados_bancarios: dadosBancarios,
      saldo_disponivel: carteira ? Number(carteira.saldo_disponivel) : null
    };
  });

  return res.json({
    transferencias: lista,
    total_pendente: lista
      .filter((item) => item.status === 'pendente')
      .reduce((soma, item) => soma + item.valor, 0)
  });
});

/**
 * Confirmar que o repasse foi feito
 * POST /api/v1/billing/admin/transferencias/:id/pagar
 * Acesso: Admin
 */
const confirmarTransferencia = asyncHandler(async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const { comprovante } = req.body || {};
  const tenant_id = String(usuarioDe(req).tenant_id);

  const transferencia = await prisma.transacao.findFirst({
    where: { id, tenant_id, tipo: 'transferencia_vet' }
  });

  if (!transferencia) {
    throw new NotFoundError('Pedido de transferência não encontrado');
  }

  if (!['pendente', 'processando', 'aprovada'].includes(transferencia.status)) {
    throw new ConflictError('Este pedido já foi encerrado.');
  }

  const pedido = exigirVeterinario(transferencia);
  const agora = new Date();

  const atualizada = await prisma.$transaction(async (tx) => {
    const registro = await tx.transacao.update({
      where: { id },
      data: {
        status: 'concluida',
        processado_em: agora,
        concluido_em: agora,
        notas: comprovante ? String(comprovante).trim().slice(0, 500) : pedido.notas
      }
    });

    // O saldo já foi debitado quando o vet pediu. O que falta aqui é registrar
    // o total repassado, que é o número que ele vê como "Total transferido".
    await tx.carteiraVeterinario.updateMany({
      where: { tenant_id, veterinario_id: pedido.veterinario_id },
      data: { total_transferido: { increment: pedido.valor_total } }
    });

    return registro;
  });

  await AuditService.logForensicEvent({
    req,
    tenantId: tenant_id,
    entityType: 'Transacao',
    entityId: id,
    action: 'billing.transferencia_confirmada',
    estadoAnterior: { status: pedido.status },
    estadoPosterior: { status: 'concluida', concluido_em: agora },
    detalhes: {
      veterinario_id: pedido.veterinario_id,
      valor: Number(pedido.valor_total),
      comprovante: comprovante || null
    }
  });

  await notificarVeterinario(pedido.veterinario_id, tenant_id, {
    titulo: 'Repasse confirmado',
    corpo: `Sua transferência de ${formatarValor(pedido.valor_total)} foi enviada para a sua conta.`
  });

  return res.json({
    message: 'Repasse confirmado.',
    transacao: { ...atualizada, valor_total: Number(atualizada.valor_total) }
  });
});

/**
 * Recusar o pedido e devolver o saldo
 * POST /api/v1/billing/admin/transferencias/:id/recusar
 * Acesso: Admin
 */
const recusarTransferencia = asyncHandler(async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const { motivo } = req.body || {};
  const tenant_id = String(usuarioDe(req).tenant_id);

  if (!motivo || String(motivo).trim().length < 5) {
    throw new ValidationError('Explique o motivo da recusa — o veterinário precisa saber o que corrigir.');
  }

  const transferencia = await prisma.transacao.findFirst({
    where: { id, tenant_id, tipo: 'transferencia_vet' }
  });

  if (!transferencia) {
    throw new NotFoundError('Pedido de transferência não encontrado');
  }

  if (!['pendente', 'processando', 'aprovada'].includes(transferencia.status)) {
    throw new ConflictError('Este pedido já foi encerrado.');
  }

  const pedido = exigirVeterinario(transferencia);

  const atualizada = await prisma.$transaction(async (tx) => {
    const registro = await tx.transacao.update({
      where: { id },
      data: {
        status: 'cancelada',
        processado_em: new Date(),
        notas: String(motivo).trim().slice(0, 500)
      }
    });

    // Recusar sem devolver o saldo seria confiscar o dinheiro do veterinário.
    await tx.carteiraVeterinario.updateMany({
      where: { tenant_id, veterinario_id: pedido.veterinario_id },
      data: { saldo_disponivel: { increment: pedido.valor_total } }
    });

    return registro;
  });

  await AuditService.logForensicEvent({
    req,
    tenantId: tenant_id,
    entityType: 'Transacao',
    entityId: id,
    action: 'billing.transferencia_recusada',
    estadoAnterior: { status: pedido.status },
    estadoPosterior: { status: 'cancelada', saldo_devolvido: Number(pedido.valor_total) },
    motivo: String(motivo).trim(),
    detalhes: { veterinario_id: pedido.veterinario_id }
  });

  await notificarVeterinario(pedido.veterinario_id, tenant_id, {
    titulo: 'Pedido de transferência recusado',
    corpo: `${formatarValor(pedido.valor_total)} voltou para o seu saldo. Motivo: ${String(motivo).trim()}`
  });

  return res.json({
    message: 'Pedido recusado e saldo devolvido ao veterinário.',
    transacao: { ...atualizada, valor_total: Number(atualizada.valor_total) }
  });
});

/**
 * Listar transações (extrato)
 * GET /api/v1/billing/extrato
 * Acesso: Autenticado
 */
const extrato = asyncHandler(async (req: Request, res: Response) => {
  const tipo = textoDaQuery(req.query.tipo);
  const status = textoDaQuery(req.query.status);
  const data_inicio = textoDaQuery(req.query.data_inicio);
  const data_fim = textoDaQuery(req.query.data_fim);
  const page = req.query.page ?? 1;
  const limit = req.query.limit ?? 20;
  const usuario = usuarioDe(req);
  const tenant_id = String(usuario.tenant_id);
  const usuario_id = usuario.id;
  const tipo_usuario = usuario.tipo_usuario;

  // Filtro baseado no tipo de usuário
  const where: Prisma.TransacaoWhereInput = { tenant_id };

  if (tipo_usuario === 'tutor') {
    where.tutor_id = usuario_id;
  } else if (tipo_usuario === 'veterinario') {
    where.veterinario_id = await resolveVeterinarioId(usuario_id, tenant_id);
  }

  // Os filtros vão ao Prisma como vieram da URL; fora do enum ele recusa a consulta.
  if (tipo) where.tipo = tipo as TipoTransacao;
  if (status) where.status = status as StatusTransacao;
  if (data_inicio && data_fim) {
    where.criado_em = {
      gte: new Date(data_inicio),
      lte: new Date(data_fim)
    };
  }

  // A aritmética abaixo é a que o JavaScript fazia com a string da query
  // (`(page - 1) * limit` coage os dois para número; `parseInt` para o take).
  const [transacoes, total] = await Promise.all([
    prisma.transacao.findMany({
      where,
      skip: (Number(page) - 1) * Number(limit),
      take: parseInt(String(limit)),
      orderBy: { criado_em: 'desc' }
    }),
    prisma.transacao.count({ where })
  ]);

  // Converter Decimals para números
  const transacoesFormatadas = transacoes.map(t => ({
    ...t,
    valor_total: Number(t.valor_total),
    valor_tutor: t.valor_tutor ? Number(t.valor_tutor) : null,
    valor_veterinario: t.valor_veterinario ? Number(t.valor_veterinario) : null,
    valor_plataforma: t.valor_plataforma ? Number(t.valor_plataforma) : null
  }));

  return res.json({
    transacoes: transacoesFormatadas,
    paginacao: {
      total,
      pagina: parseInt(String(page)),
      limite: parseInt(String(limit)),
      total_paginas: Math.ceil(total / Number(limit))
    }
  });
});

/**
 * Consultar saldo (carteira)
 * GET /api/v1/billing/saldo
 * Acesso: Autenticado
 */
const consultarSaldo = asyncHandler(async (req: Request, res: Response) => {
  const usuario = usuarioDe(req);
  const usuario_id = usuario.id;
  const tipo_usuario = usuario.tipo_usuario;
  const tenantId = String(req.tenantId);

  if (tipo_usuario === 'tutor') {
    const carteira = await prisma.carteiraTutor.findFirst({
      where: { tutor_id: usuario_id, tenant_id: tenantId }
    });

    return res.json({
      carteira: carteira ? {
        ...carteira,
        saldo: Number(carteira.saldo),
        total_gasto: Number(carteira.total_gasto)
      } : {
        saldo: 0,
        total_gasto: 0
      }
    });
  } else if (tipo_usuario === 'veterinario') {
    const veterinarioId = await resolveVeterinarioId(usuario_id, tenantId);
    const carteira = await prisma.carteiraVeterinario.findFirst({
      where: { veterinario_id: veterinarioId, tenant_id: tenantId }
    });

    return res.json({
      carteira: carteira ? {
        ...carteira,
        saldo_disponivel: Number(carteira.saldo_disponivel),
        saldo_pendente: Number(carteira.saldo_pendente),
        total_recebido: Number(carteira.total_recebido),
        total_transferido: Number(carteira.total_transferido),
        dados_bancarios: carteira.dados_bancarios ? JSON.parse(carteira.dados_bancarios) : null
      } : {
        saldo_disponivel: 0,
        saldo_pendente: 0,
        total_recebido: 0,
        total_transferido: 0
      }
    });
  }

  return res.json({ carteira: null });
});

// ═══════════════════════════════════════════════════════
// PLANOS E ASSINATURAS
// ═══════════════════════════════════════════════════════

/**
 * Criar plano de assinatura
 * POST /api/v1/billing/planos
 * Acesso: Admin
 */
const criarPlano = asyncHandler(async (req: Request, res: Response) => {
  const { nome, descricao, tipo_usuario, valor_mensal, desconto_pct, limite_atendimentos, beneficios } = req.body;
  const tenant_id = String(usuarioDe(req).tenant_id);

  const plano = await prisma.planoAssinatura.create({
    data: {
      tenant_id,
      nome,
      descricao,
      tipo_usuario,
      valor_mensal,
      desconto_pct: desconto_pct ?? 0,
      limite_atendimentos,
      beneficios: JSON.stringify(beneficios)
    }
  });

  return res.status(201).json({
    message: 'Plano criado com sucesso',
    plano: {
      ...plano,
      valor_mensal: Number(plano.valor_mensal),
      beneficios: JSON.parse(plano.beneficios)
    }
  });
});

/**
 * Atualizar plano (inclusive ativar/desativar)
 * PUT /api/v1/billing/planos/:id
 * Acesso: Admin
 */
const atualizarPlano = asyncHandler(async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const tenant_id = String(usuarioDe(req).tenant_id);

  const existente = await prisma.planoAssinatura.findFirst({ where: { id, tenant_id } });
  if (!existente) {
    throw new NotFoundError('Plano não encontrado');
  }

  const { nome, descricao, valor_mensal, desconto_pct, limite_atendimentos, beneficios, ativo } = req.body;
  const plano = await prisma.planoAssinatura.update({
    where: { id },
    data: {
      ...(nome !== undefined && { nome }),
      ...(descricao !== undefined && { descricao }),
      ...(valor_mensal !== undefined && { valor_mensal }),
      ...(desconto_pct !== undefined && { desconto_pct }),
      ...(limite_atendimentos !== undefined && { limite_atendimentos }),
      ...(beneficios !== undefined && { beneficios: JSON.stringify(beneficios) }),
      ...(ativo !== undefined && { ativo })
    }
  });

  return res.json({
    message: 'Plano atualizado com sucesso',
    plano: {
      ...plano,
      valor_mensal: Number(plano.valor_mensal),
      beneficios: JSON.parse(plano.beneficios)
    }
  });
});

/**
 * Listar todos os planos do tenant, inclusive inativos
 * GET /api/v1/billing/admin/planos
 * Acesso: Admin — a vitrine pública continua só com os ativos.
 */
const listarPlanosAdmin = asyncHandler(async (req: Request, res: Response) => {
  const tenant_id = String(usuarioDe(req).tenant_id);

  const planos = await prisma.planoAssinatura.findMany({
    where: { tenant_id },
    orderBy: [{ tipo_usuario: 'asc' }, { valor_mensal: 'asc' }]
  });

  // O modelo é `assinaturaUsuario`; `prisma.assinatura` não existe. O
  // `.catch(() => [])` engolia o erro em silêncio, então a coluna "assinantes"
  // do painel mostrava ZERO para todo plano, sempre — inclusive para planos com
  // gente pagando.
  const contagens = await prisma.assinaturaUsuario.groupBy({
    by: ['plano_id'],
    where: { tenant_id, status: 'ativa' },
    _count: { _all: true }
  });
  const assinantesPorPlano: Record<string, number> = Object.fromEntries(contagens.map(c => [c.plano_id, c._count._all]));

  return res.json({
    planos: planos.map(p => ({
      ...p,
      valor_mensal: Number(p.valor_mensal),
      desconto_pct: Number(p.desconto_pct || 0),
      beneficios: JSON.parse(p.beneficios),
      assinantes_ativos: assinantesPorPlano[p.id] || 0
    }))
  });
});

/**
 * Listar planos disponíveis
 * GET /api/v1/billing/planos
 * Acesso: Público
 */
const listarPlanos = asyncHandler(async (req: Request, res: Response) => {
  const tipo_usuario = textoDaQuery(req.query.tipo_usuario);
  // Mesmo fallback de todos os outros controllers públicos: sem a env
  // configurada, a vitrine de planos sumia com "Organização não encontrada".
  const tenantSlug = textoDaQuery(req.query.tenant_slug) || process.env.PUBLIC_TENANT_SLUG || 'saudepet';
  const tenant = tenantSlug
    ? await prisma.tenant.findFirst({ where: { slug: tenantSlug, status: { in: ['ativo', 'trial'] } }, select: { id: true } })
    : null;
  if (!tenant) throw new NotFoundError('Organização não encontrada');
  const tenant_id = tenant.id;

  const where: Prisma.PlanoAssinaturaWhereInput = {
    tenant_id,
    ativo: true,
    ...(tipo_usuario && { tipo_usuario })
  };

  const planos = await prisma.planoAssinatura.findMany({
    where,
    orderBy: { valor_mensal: 'asc' }
  });

  const planosFormatados = planos.map(p => ({
    ...p,
    valor_mensal: Number(p.valor_mensal),
    desconto_pct: Number(p.desconto_pct || 0),
    beneficios: JSON.parse(p.beneficios)
  }));

  return res.json({ planos: planosFormatados });
});

/**
 * Assinar plano
 * POST /api/v1/billing/assinaturas
 * Acesso: Autenticado
 */
const assinarPlano = asyncHandler(async (req: Request, res: Response) => {
  const { plano_id, metodo_pagamento = 'PIX', cardToken, parcelas } = req.body;
  const usuario = usuarioDe(req);
  const tenant_id = String(usuario.tenant_id);
  const usuario_id = usuario.id;
  const planoId = String(plano_id);

  const plano = await prisma.planoAssinatura.findFirst({
    where: { id: planoId, tenant_id, ativo: true }
  });

  if (!plano) {
    throw new NotFoundError('Plano não encontrado');
  }

  // Uma assinatura por vez — contando também a que está esperando pagamento,
  // senão cada toque no botão abriria uma cobrança nova.
  const assinaturaExistente = await prisma.assinaturaUsuario.findFirst({
    where: { tenant_id, usuario_id, status: { in: ['ativa', 'pendente'] } }
  });

  if (assinaturaExistente) {
    throw new ValidationError(
      assinaturaExistente.status === 'ativa'
        ? 'Você já possui uma assinatura ativa'
        : 'Você já tem uma assinatura aguardando pagamento. Conclua ou cancele antes de assinar outro plano.'
    );
  }

  const valorMensal = Number(plano.valor_mensal);
  const proximaCobranca = new Date();
  proximaCobranca.setDate(proximaCobranca.getDate() + 30);

  // Plano gratuito não tem o que cobrar: entra ativo direto.
  if (valorMensal <= 0) {
    const assinatura = await prisma.assinaturaUsuario.create({
      data: {
        tenant_id,
        usuario_id,
        plano_id: planoId,
        valor_mensal: plano.valor_mensal,
        status: 'ativa',
        proxima_cobranca: proximaCobranca
      },
      include: { plano: true }
    });

    return res.status(201).json({
      message: 'Assinatura ativada.',
      assinatura: { ...assinatura, valor_mensal: 0 },
      pagamento: null
    });
  }

  // A partir daqui é plano pago. A versão anterior criava a assinatura já como
  // 'ativa' e uma `Transacao` pendente que NADA no sistema processava: o plano
  // pago do tutor e o CRM pago do veterinário eram liberados de graça, para
  // sempre. Agora a assinatura nasce 'pendente' e só o webhook do gateway,
  // quando o dinheiro entra, a torna ativa.
  // O schema da assinatura fala em português minúsculo ('pix', 'cartao_credito')
  // e o gateway espera 'PIX' / 'CREDIT_CARD'. Mandar o valor cru fazia a
  // cobrança nascer com método errado.
  const METODO_DO_GATEWAY: Record<string, PaymentMethod> = {
    pix: 'PIX',
    cartao_credito: 'CREDIT_CARD',
    cartao_debito: 'CREDIT_CARD',
    boleto: 'BOLETO',
    PIX: 'PIX',
    CREDIT_CARD: 'CREDIT_CARD'
  };
  const metodoGateway: PaymentMethod = METODO_DO_GATEWAY[String(metodo_pagamento)] || 'PIX';

  if (metodoGateway === 'CREDIT_CARD' && !cardToken) {
    throw new ValidationError('Pagamento com cartão exige o token gerado no navegador.');
  }

  const assinatura = await prisma.assinaturaUsuario.create({
    data: {
      tenant_id,
      usuario_id,
      plano_id: planoId,
      valor_mensal: plano.valor_mensal,
      status: 'pendente',
      proxima_cobranca: proximaCobranca
    },
    include: { plano: true }
  });

  let pagamento;
  try {
    pagamento = await paymentService.createPaymentIntent({
      tenantId: tenant_id,
      atendimentoId: null,
      assinaturaId: assinatura.id,
      tutorId: usuario_id,
      method: metodoGateway,
      amount: valorMensal,
      cardToken: typeof cardToken === 'string' ? cardToken : undefined,
      cardDetails: parcelas ? { installments: Number(parcelas) } : undefined,
      descricao: `Assinatura ${plano.nome} — Saúde PET`
    });
  } catch (erro) {
    // Sem cobrança não pode sobrar assinatura pendente travando o usuário:
    // ele tentaria de novo e ouviria "você já tem uma assinatura aguardando".
    await prisma.assinaturaUsuario.delete({ where: { id: assinatura.id } }).catch(() => {});
    throw erro;
  }

  return res.status(201).json({
    message: 'Assinatura criada. Conclua o pagamento para ativá-la.',
    assinatura: {
      ...assinatura,
      valor_mensal: Number(assinatura.valor_mensal)
    },
    pagamento
  });
});

/**
 * 👥 ADMIN: Quem assina cada plano
 * GET /api/v1/billing/admin/assinaturas
 *
 * `/admin/planos` mostrava um número de assinantes (que nem funcionava) e não
 * permitia abrir a lista, ver quem é, nem cancelar nada. Assinatura é receita
 * recorrente: não poder olhar quem está dentro é operar no escuro.
 */
const listarAssinaturasAdmin = asyncHandler(async (req: Request, res: Response) => {
  const tenant_id = String(usuarioDe(req).tenant_id);
  const status = textoDaQuery(req.query.status) ?? 'ativa';
  const plano_id = textoDaQuery(req.query.plano_id);

  const where: Prisma.AssinaturaUsuarioWhereInput = { tenant_id };
  if (status && status !== 'todos') where.status = status;
  if (plano_id) where.plano_id = plano_id;

  const assinaturas = await prisma.assinaturaUsuario.findMany({
    where,
    include: { plano: { select: { id: true, nome: true, tipo_usuario: true } } },
    orderBy: { criado_em: 'desc' },
    take: 200
  });

  // `AssinaturaUsuario` não tem relação com `Usuario` no schema, então o nome
  // vem numa consulta separada — melhor do que devolver uma lista de UUIDs.
  const usuarioIds = [...new Set(assinaturas.map((item) => item.usuario_id))];
  const usuarios = await prisma.usuario.findMany({
    where: { id: { in: usuarioIds }, tenant_id },
    select: { id: true, nome: true, email: true, telefone: true, tipo_usuario: true }
  });
  const usuarioPorId = new Map(usuarios.map((item) => [item.id, item]));

  // Cobrança da assinatura, para o admin chegar ao estorno sem caçar no
  // financeiro.
  const pagamentos = await prisma.payment.findMany({
    where: { tenant_id, assinatura_id: { in: assinaturas.map((item) => item.id) } },
    select: { id: true, assinatura_id: true, status: true, amount: true, paid_at: true },
    orderBy: { criado_em: 'desc' }
  });
  const pagamentoPorAssinatura = new Map<string | null, (typeof pagamentos)[number]>();
  for (const pagamento of pagamentos) {
    if (!pagamentoPorAssinatura.has(pagamento.assinatura_id)) {
      pagamentoPorAssinatura.set(pagamento.assinatura_id, pagamento);
    }
  }

  const lista = assinaturas.map((item) => {
    const pagamento = pagamentoPorAssinatura.get(item.id);
    return {
      id: item.id,
      status: item.status,
      valor_mensal: Number(item.valor_mensal),
      inicio_em: item.inicio_em,
      proxima_cobranca: item.proxima_cobranca,
      cancelada_em: item.cancelada_em,
      plano: item.plano,
      assinante: usuarioPorId.get(item.usuario_id) || { id: item.usuario_id, nome: 'Usuário removido' },
      pagamento: pagamento
        ? {
            ...pagamento,
            amount: Number(pagamento.amount)
          }
        : null
    };
  });

  return res.json({
    assinaturas: lista,
    receita_mensal: lista
      .filter((item) => item.status === 'ativa')
      .reduce((soma, item) => soma + item.valor_mensal, 0)
  });
});

/**
 * 🛑 ADMIN: Cancelar a assinatura de alguém
 * POST /api/v1/billing/admin/assinaturas/:id/cancelar
 */
const cancelarAssinaturaAdmin = asyncHandler(async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const { motivo } = req.body || {};
  const tenant_id = String(usuarioDe(req).tenant_id);

  if (!motivo || String(motivo).trim().length < 5) {
    throw new ValidationError('Explique o motivo — cancelar a assinatura de alguém precisa de justificativa na trilha.');
  }

  const assinatura = await prisma.assinaturaUsuario.findFirst({ where: { id, tenant_id } });

  if (!assinatura) {
    throw new NotFoundError('Assinatura não encontrada');
  }

  if (assinatura.status === 'cancelada') {
    throw new ConflictError('Esta assinatura já está cancelada.');
  }

  const atualizada = await prisma.assinaturaUsuario.update({
    where: { id },
    data: { status: 'cancelada', cancelada_em: new Date() }
  });

  await AuditService.logForensicEvent({
    req,
    tenantId: tenant_id,
    entityType: 'AssinaturaUsuario',
    entityId: id,
    action: 'billing.assinatura_cancelada_pelo_admin',
    estadoAnterior: { status: assinatura.status },
    estadoPosterior: { status: 'cancelada' },
    motivo: String(motivo).trim(),
    detalhes: { usuario_id: assinatura.usuario_id, valor_mensal: Number(assinatura.valor_mensal) }
  });

  // O estorno, quando cabe, é feito no financeiro sobre a cobrança da
  // assinatura — não se duplica a lógica de dinheiro aqui.
  try {
    void enviarParaUsuario(assinatura.usuario_id, {
      title: 'Sua assinatura foi cancelada',
      body: String(motivo).trim(),
      url: '/tutor/planos'
    });
  } catch {
    // best-effort
  }

  return res.json({
    message: 'Assinatura cancelada.',
    assinatura: { ...atualizada, valor_mensal: Number(atualizada.valor_mensal) }
  });
});

/**
 * Cancelar assinatura
 * POST /api/v1/billing/assinaturas/:id/cancelar
 * Acesso: Autenticado
 */
const cancelarAssinatura = asyncHandler(async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const usuario_id = usuarioDe(req).id;

  const assinatura = await prisma.assinaturaUsuario.findFirst({
    where: { id, usuario_id, tenant_id: String(req.tenantId) }
  });

  if (!assinatura) {
    throw new NotFoundError('Assinatura não encontrada');
  }

  const assinaturaAtualizada = await prisma.assinaturaUsuario.update({
    where: { id },
    data: {
      status: 'cancelada',
      cancelada_em: new Date()
    }
  });

  return res.json({
    message: 'Assinatura cancelada com sucesso',
    assinatura: assinaturaAtualizada
  });
});

/**
 * Assinatura ativa do usuário autenticado (tutor ou veterinário).
 * GET /api/v1/billing/minha-assinatura
 *
 * A tela de planos precisa saber o que a pessoa já assina para marcar o plano
 * atual e oferecer o cancelamento — descobrir por tentativa de assinatura
 * duplicada seria um 400 disfarçado de fluxo.
 */
const minhaAssinatura = asyncHandler(async (req: Request, res: Response) => {
  const usuario = usuarioDe(req);
  const assinatura = await prisma.assinaturaUsuario.findFirst({
    where: {
      tenant_id: String(req.tenantId || usuario.tenant_id),
      usuario_id: usuario.id,
      status: 'ativa'
    },
    orderBy: { criado_em: 'desc' },
    include: { plano: true }
  });

  if (!assinatura) {
    return res.json({ assinatura: null });
  }

  return res.json({
    assinatura: {
      ...assinatura,
      valor_mensal: Number(assinatura.valor_mensal),
      plano: assinatura.plano
        ? {
            ...assinatura.plano,
            valor_mensal: Number(assinatura.plano.valor_mensal),
            beneficios: (() => {
              try {
                return JSON.parse(assinatura.plano.beneficios);
              } catch {
                return [];
              }
            })()
          }
        : null
    }
  });
});

/**
 * Estatísticas financeiras
 * GET /api/v1/billing/estatisticas
 * Acesso: Admin
 */
const estatisticasFinanceiras = asyncHandler(async (req: Request, res: Response) => {
  const tenant_id = String(usuarioDe(req).tenant_id);
  const mes = textoDaQuery(req.query.mes);

  const mesReferencia = mes || new Date().toISOString().substring(0, 7); // YYYY-MM

  const dataInicio = new Date(mesReferencia + '-01');
  const dataFim = new Date(dataInicio);
  dataFim.setMonth(dataFim.getMonth() + 1);

  const transacoes = await prisma.transacao.findMany({
    where: {
      tenant_id,
      criado_em: {
        gte: dataInicio,
        lt: dataFim
      }
    }
  });

  const totalFaturado = transacoes
    .filter(t => t.status === 'concluida')
    .reduce((sum, t) => sum + Number(t.valor_total), 0);

  const totalComissao = transacoes
    .filter(t => t.status === 'concluida' && t.valor_plataforma)
    .reduce((sum, t) => sum + Number(t.valor_plataforma), 0);

  const totalTransferido = transacoes
    .filter(t => t.tipo === 'transferencia_vet' && t.status === 'concluida')
    .reduce((sum, t) => sum + Number(t.valor_total), 0);

  return res.json({
    estatisticas: {
      mes_referencia: mesReferencia,
      total_transacoes: transacoes.length,
      total_faturado: totalFaturado.toFixed(2),
      total_comissao: totalComissao.toFixed(2),
      total_transferido_vets: totalTransferido.toFixed(2),
      transacoes_por_status: transacoes.reduce<Record<string, number>>((acc, t) => {
        acc[t.status] = (acc[t.status] || 0) + 1;
        return acc;
      }, {})
    }
  });
});

const billingController = {
  criarPagamento,
  aprovarPagamento,
  confirmarPagamento,
  solicitarTransferencia,
  listarTransferencias,
  confirmarTransferencia,
  recusarTransferencia,
  extrato,
  consultarSaldo,
  criarPlano,
  atualizarPlano,
  listarPlanosAdmin,
  listarAssinaturasAdmin,
  cancelarAssinaturaAdmin,
  listarPlanos,
  assinarPlano,
  cancelarAssinatura,
  minhaAssinatura,
  estatisticasFinanceiras
};

module.exports = billingController;

export default billingController;
export {
  criarPagamento,
  aprovarPagamento,
  confirmarPagamento,
  solicitarTransferencia,
  listarTransferencias,
  confirmarTransferencia,
  recusarTransferencia,
  extrato,
  consultarSaldo,
  criarPlano,
  atualizarPlano,
  listarPlanosAdmin,
  listarAssinaturasAdmin,
  cancelarAssinaturaAdmin,
  listarPlanos,
  assinarPlano,
  cancelarAssinatura,
  minhaAssinatura,
  estatisticasFinanceiras
};
