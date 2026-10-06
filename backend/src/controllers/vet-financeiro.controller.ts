import type { Request, Response } from 'express';
import type { Prisma, StatusAtendimento, StatusPagamento, Veterinario } from '@prisma/client';
import type { Server as SocketServer } from 'socket.io';
import prisma from '../config/database';
import paymentService from '../services/payment/payment.service';
import CryptoService from '../services/crypto.service';
import MercadoPagoPaymentGateway from '../services/payment/mercadopago.gateway';
import AuditService from '../services/audit.service';
import {
  NotFoundError,
  ValidationError,
  ConflictError,
  asyncHandler
} from '../middleware/error.middleware';

// Status em que o atendimento já justifica cobrança: o vet chegou, está atendendo
// ou terminou. Antes disso não existe serviço prestado para cobrar.
const STATUS_COBRAVEIS: StatusAtendimento[] = ['chegou', 'atendimento_em_andamento', 'finalizado', 'concluido'];

// Status de pagamento que ainda podem virar "pago" — bloqueiam nova cobrança
// para o mesmo atendimento e evitam duas cobranças abertas para o mesmo tutor.
const STATUS_PAGAMENTO_ABERTO: StatusPagamento[] = ['CREATED', 'PENDING', 'PROCESSING', 'AUTHORIZED'];

const STATUS_PAGAMENTO_CANCELAVEL: StatusPagamento[] = ['CREATED', 'PENDING'];

const STATUS_PAGAMENTO_ENCERRADO: StatusPagamento[] = ['CANCELLED', 'EXPIRED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED'];

/** O JSON cifrado em `Veterinario.dados_bancarios`. */
type DadosBancarios = {
  chavePix?: string;
  tipoChavePix?: string;
  banco?: string;
  agencia?: string;
  conta?: string;
  tipoConta?: string;
  titular?: string | null;
  cpfCnpjTitular?: string | null;
  atualizado_em?: string;
};

const mensagemDe = (erro: unknown): string => (erro instanceof Error ? erro.message : String(erro));

// Mostra o suficiente para o veterinário reconhecer a própria conta sem devolver
// o dado bancário completo em toda listagem.
const mascarar = (valor: unknown, visiveis = 4): string | null => {
  const texto = String(valor || '');
  if (!texto) return null;
  if (texto.length <= visiveis) return '•'.repeat(texto.length);
  return `${'•'.repeat(Math.min(texto.length - visiveis, 8))}${texto.slice(-visiveis)}`;
};

const mascararChavePix = (chave: unknown, tipo: unknown): string | null => {
  const texto = String(chave || '');
  if (!texto) return null;
  if (tipo === 'EMAIL') {
    const [usuario, dominio] = texto.split('@');
    if (!dominio) return mascarar(texto);
    return `${usuario.slice(0, 2)}${'•'.repeat(Math.max(usuario.length - 2, 1))}@${dominio}`;
  }
  return mascarar(texto);
};

// Resolve o veterinário do usuário autenticado. usuario_id é único no schema,
// então esta busca já é intrinsecamente escopada ao próprio solicitante.
async function vetDoUsuario(usuarioId: string): Promise<Veterinario> {
  const vet = await prisma.veterinario.findFirst({
    where: { usuario_id: usuarioId }
  });

  if (!vet) {
    throw new NotFoundError('Perfil de veterinário não encontrado');
  }

  return vet;
}

type VeterinarioComUsuario = Prisma.VeterinarioGetPayload<{ include: { usuario: true } }>;

// Mesma busca, com o usuário junto — é o `include` que `salvarContaBancaria` pedia.
async function vetDoUsuarioComUsuario(usuarioId: string): Promise<VeterinarioComUsuario> {
  const vet = await prisma.veterinario.findFirst({
    where: { usuario_id: usuarioId },
    include: { usuario: true }
  });

  if (!vet) {
    throw new NotFoundError('Perfil de veterinário não encontrado');
  }

  return vet;
}

function lerDadosBancarios(vet: Veterinario): DadosBancarios | null {
  if (!vet.dados_bancarios) return null;
  try {
    // `decrypt` devolve null só para texto vazio (já barrado acima); `String()`
    // mantém o `JSON.parse(null)` → null que o JavaScript fazia.
    return JSON.parse(String(CryptoService.decrypt(vet.dados_bancarios)));
  } catch (error) {
    console.error('❌ [VET FINANCEIRO] Falha ao decriptar dados bancários:', mensagemDe(error));
    return null;
  }
}

const ehString = (valor: unknown): valor is string => typeof valor === 'string';

class VetFinanceiroController {
  // Consultar Status do Onboarding Financeiro do Veterinário
  getStatus = asyncHandler(async (req: Request, res: Response) => {
    const vet = await vetDoUsuario(String(req.userId));

    return res.json({
      success: true,
      veterinario: {
        id: vet.id,
        crmv: vet.crmv,
        status_credenciamento: vet.status_credenciamento,
        status_financeiro: vet.status_financeiro,
        habilita_split: vet.habilita_split,
        asaas_account_id: vet.asaas_account_id,
        asaas_wallet_id: vet.asaas_wallet_id,
        habilitado_em: vet.habilitado_em,
        tem_dados_bancarios: Boolean(vet.dados_bancarios)
      }
    });
  });

  // Conta bancária cadastrada, sempre mascarada — nunca devolvemos a chave PIX
  // nem o número da conta em claro, mesmo para o próprio dono.
  getContaBancaria = asyncHandler(async (req: Request, res: Response) => {
    const vet = await vetDoUsuario(String(req.userId));
    const dados = lerDadosBancarios(vet);

    return res.json({
      success: true,
      status_financeiro: vet.status_financeiro,
      status_credenciamento: vet.status_credenciamento,
      habilita_split: vet.habilita_split,
      habilitado_em: vet.habilitado_em,
      conta: dados
        ? {
          tipoChavePix: dados.tipoChavePix,
          chavePixMascarada: mascararChavePix(dados.chavePix, dados.tipoChavePix),
          banco: dados.banco,
          agencia: dados.agencia,
          contaMascarada: mascarar(dados.conta),
          tipoConta: dados.tipoConta || 'corrente',
          titular: dados.titular || null,
          atualizado_em: dados.atualizado_em || vet.habilitado_em || null
        }
        : null
    });
  });

  // Cadastrar ou atualizar a conta bancária de recebimento.
  // Primeira gravação também cria a subconta no Asaas (onboarding);
  // gravações seguintes só trocam os dados bancários, preservando a subconta.
  salvarContaBancaria = asyncHandler(async (req: Request, res: Response) => {
    const usuarioId = String(req.userId);
    const { chavePix, tipoChavePix, banco, agencia, conta, tipoConta, titular, cpfCnpjTitular } = req.body;

    const vet = await vetDoUsuarioComUsuario(usuarioId);

    if (vet.status_credenciamento !== 'APPROVED') {
      throw new ValidationError('O credenciamento do CRMV deve ser aprovado antes do cadastro financeiro.');
    }

    const anterior = lerDadosBancarios(vet);
    const dadosBancariosObj = {
      chavePix,
      tipoChavePix,
      banco,
      agencia,
      conta,
      tipoConta: tipoConta || 'corrente',
      titular: titular || vet.usuario.nome,
      cpfCnpjTitular: cpfCnpjTitular || vet.usuario.cpf || null,
      atualizado_em: new Date().toISOString()
    };
    const dadosBancariosEncrypted = CryptoService.encrypt(JSON.stringify(dadosBancariosObj));

    const jaTemSubconta = Boolean(vet.asaas_wallet_id);
    const data: Prisma.VeterinarioUpdateInput = {
      dados_bancarios: dadosBancariosEncrypted
    };

    if (!jaTemSubconta) {
      // Decisão MP-only: sem subconta no gateway. A "carteira" é interna —
      // o split 85/15 é calculado e registrado pela plataforma e o repasse
      // sai via PIX cadastrado aqui.
      const gateway = new MercadoPagoPaymentGateway({});
      const recipientRes = await gateway.createRecipient({
        nome: vet.usuario.nome
      });

      data.status_financeiro = 'ACTIVE';
      data.provider_financeiro = 'mercado_pago';
      data.asaas_account_id = recipientRes.accountId;
      data.asaas_wallet_id = recipientRes.walletId;
      data.habilita_split = true;
      data.habilitado_em = new Date();
    }

    const atualizado = await prisma.veterinario.update({
      where: { id: vet.id },
      data
    });

    // Auditoria: o "o quê" muda, o valor sensível não entra no log.
    await AuditService.logForensicEvent({
      req,
      entityType: 'veterinario_conta_bancaria',
      entityId: vet.id,
      action: jaTemSubconta ? 'conta_bancaria_atualizada' : 'conta_bancaria_cadastrada',
      detalhes: {
        banco: dadosBancariosObj.banco,
        tipoChavePix: dadosBancariosObj.tipoChavePix,
        tipoConta: dadosBancariosObj.tipoConta,
        substituiu_dados_anteriores: Boolean(anterior)
      }
    });

    return res.json({
      success: true,
      message: jaTemSubconta
        ? 'Conta bancária atualizada com sucesso!'
        : 'Conta bancária cadastrada e repasses habilitados!',
      veterinario: {
        id: atualizado.id,
        status_financeiro: atualizado.status_financeiro,
        habilita_split: atualizado.habilita_split,
        asaas_account_id: atualizado.asaas_account_id,
        asaas_wallet_id: atualizado.asaas_wallet_id
      },
      conta: {
        tipoChavePix: dadosBancariosObj.tipoChavePix,
        chavePixMascarada: mascararChavePix(dadosBancariosObj.chavePix, dadosBancariosObj.tipoChavePix),
        banco: dadosBancariosObj.banco,
        agencia: dadosBancariosObj.agencia,
        contaMascarada: mascarar(dadosBancariosObj.conta),
        tipoConta: dadosBancariosObj.tipoConta,
        titular: dadosBancariosObj.titular,
        atualizado_em: dadosBancariosObj.atualizado_em
      }
    });
  });

  // Mantido para o dashboard financeiro antigo, que ainda chama POST /onboarding
  solicitarOnboarding = asyncHandler(async (req, res, next) => {
    return this.salvarContaBancaria(req, res, next);
  });

  // Obter Extrato de Recebimentos e Splits do Veterinário
  getExtrato = asyncHandler(async (req: Request, res: Response) => {
    const vet = await vetDoUsuario(String(req.userId));

    const splits = await prisma.paymentSplit.findMany({
      where: { recipient_id: vet.id, recipient_type: 'VETERINARIAN' },
      include: {
        payment: {
          select: {
            id: true,
            atendimento_id: true,
            amount: true,
            status: true,
            method: true,
            paid_at: true,
            criado_em: true
          }
        }
      },
      orderBy: { criado_em: 'desc' }
    });

    const totalAcumulado = splits.reduce((sum, item) => sum + Number(item.recipient_amount), 0);
    const totalLiberado = splits
      .filter(item => item.status === 'PAID')
      .reduce((sum, item) => sum + Number(item.recipient_amount), 0);

    return res.json({
      success: true,
      resumo: {
        totalAcumulado,
        totalLiberado,
        totalPendentes: totalAcumulado - totalLiberado
      },
      extrato: splits
    });
  });

  // Cobranças dos atendimentos deste veterinário, com o atendimento e o tutor
  // que cada uma representa — é a tela de "controlar pagamento" do vet.
  listarCobrancas = asyncHandler(async (req: Request, res: Response) => {
    const vet = await vetDoUsuario(String(req.userId));
    const { status } = req.query;
    const tenantId = String(req.tenantId);

    const where: Prisma.PaymentWhereInput = { veterinario_id: vet.id, tenant_id: tenantId };
    if (status === 'abertas') where.status = { in: STATUS_PAGAMENTO_ABERTO };
    else if (status === 'pagas') where.status = 'PAID';
    else if (status === 'encerradas') where.status = { in: STATUS_PAGAMENTO_ENCERRADO };

    const payments = await prisma.payment.findMany({
      where,
      include: { splits: true },
      orderBy: { criado_em: 'desc' },
      take: 100
    });

    // Payment não tem relação Prisma com Solicitacao/Usuario; buscamos os dados
    // de apresentação em duas queries em lote em vez de N+1 dentro do map.
    const atendimentoIds = [...new Set(payments.map(p => p.atendimento_id).filter(ehString))];
    const tutorIds = [...new Set(payments.map(p => p.tutor_id).filter(ehString))];

    const [atendimentos, tutores] = await Promise.all([
      atendimentoIds.length
        ? prisma.solicitacao.findMany({
          where: { id: { in: atendimentoIds }, tenant_id: tenantId },
          select: {
            id: true,
            status: true,
            tipo_atendimento: true,
            valor_estimado: true,
            criado_em: true,
            finalizado_em: true,
            pet: { select: { id: true, nome: true, tipo: true } }
          }
        })
        : [],
      tutorIds.length
        ? prisma.usuario.findMany({
          where: { id: { in: tutorIds }, tenant_id: tenantId },
          select: { id: true, nome: true, telefone: true, foto_perfil: true }
        })
        : []
    ]);

    const porAtendimento = new Map(atendimentos.map(item => [item.id, item]));
    const porTutor = new Map(tutores.map(item => [item.id, item]));

    const cobrancas = payments.map((payment) => {
      const meuSplit = payment.splits.find(
        split => split.recipient_type === 'VETERINARIAN' && split.recipient_id === vet.id
      );

      return {
        id: payment.id,
        status: payment.status,
        metodo: payment.method,
        valor: Number(payment.amount),
        meu_repasse: meuSplit ? Number(meuSplit.recipient_amount) : null,
        taxa_plataforma: meuSplit ? Number(meuSplit.platform_fee) : null,
        status_repasse: meuSplit ? meuSplit.status : null,
        pix_copy_paste: payment.pix_copy_paste,
        pix_qr_code_ref: payment.pix_qr_code_ref,
        expires_at: payment.expires_at,
        paid_at: payment.paid_at,
        cancelled_at: payment.cancelled_at,
        criado_em: payment.criado_em,
        atendimento: (payment.atendimento_id && porAtendimento.get(payment.atendimento_id)) || null,
        tutor: porTutor.get(payment.tutor_id) || null
      };
    });

    const abertas = cobrancas.filter(item => STATUS_PAGAMENTO_ABERTO.includes(item.status));
    const pagas = cobrancas.filter(item => item.status === 'PAID');

    return res.json({
      success: true,
      resumo: {
        totalAberto: abertas.reduce((sum, item) => sum + item.valor, 0),
        totalPago: pagas.reduce((sum, item) => sum + item.valor, 0),
        quantidadeAberta: abertas.length,
        quantidadePaga: pagas.length
      },
      cobrancas
    });
  });

  // Atendimentos do veterinário que ainda podem ser cobrados — alimenta o seletor
  // da tela de cobranças sem exigir que o vet saiba o ID do atendimento.
  listarAtendimentosCobraveis = asyncHandler(async (req: Request, res: Response) => {
    const vet = await vetDoUsuario(String(req.userId));
    const tenantId = String(req.tenantId);

    const atendimentos = await prisma.solicitacao.findMany({
      where: {
        tenant_id: tenantId,
        veterinario_id: vet.id,
        status: { in: STATUS_COBRAVEIS }
      },
      include: {
        pet: { select: { id: true, nome: true, tipo: true } },
        tutor: { select: { id: true, nome: true, telefone: true } }
      },
      orderBy: { criado_em: 'desc' },
      take: 60
    });

    const pagamentos = atendimentos.length
      ? await prisma.payment.findMany({
        where: {
          tenant_id: tenantId,
          atendimento_id: { in: atendimentos.map(item => item.id) }
        },
        select: { atendimento_id: true, status: true, amount: true }
      })
      : [];

    const pagamentosPorAtendimento = pagamentos.reduce((mapa, pagamento) => {
      const lista = mapa.get(pagamento.atendimento_id) || [];
      lista.push(pagamento);
      mapa.set(pagamento.atendimento_id, lista);
      return mapa;
    }, new Map<string | null, typeof pagamentos>());

    return res.json({
      success: true,
      atendimentos: atendimentos.map((atendimento) => {
        const doAtendimento = pagamentosPorAtendimento.get(atendimento.id) || [];
        return {
          id: atendimento.id,
          status: atendimento.status,
          tipo_atendimento: atendimento.tipo_atendimento,
          valor_estimado: atendimento.valor_estimado,
          criado_em: atendimento.criado_em,
          finalizado_em: atendimento.finalizado_em,
          pet: atendimento.pet,
          tutor: atendimento.tutor,
          ja_pago: doAtendimento.some(item => item.status === 'PAID'),
          cobranca_aberta: doAtendimento.some(item => STATUS_PAGAMENTO_ABERTO.includes(item.status))
        };
      })
    });
  });

  // Gerar cobrança PIX para um atendimento do próprio veterinário.
  criarCobranca = asyncHandler(async (req: Request, res: Response) => {
    const vet = await vetDoUsuario(String(req.userId));
    const { atendimentoId, valor, metodo, descricao } = req.body;
    const tenantId = String(req.tenantId);

    if (vet.status_financeiro !== 'ACTIVE' || !vet.asaas_wallet_id) {
      throw new ValidationError(
        'Cadastre sua conta bancária antes de cobrar — sem ela o repasse fica retido na plataforma.'
      );
    }

    const atendimento = await prisma.solicitacao.findFirst({
      where: { id: String(atendimentoId), tenant_id: tenantId, veterinario_id: vet.id }
    });

    if (!atendimento) {
      throw new NotFoundError('Atendimento não encontrado');
    }

    if (!STATUS_COBRAVEIS.includes(atendimento.status)) {
      throw new ConflictError('Este atendimento ainda não está em um status que permite cobrança.');
    }

    const existente = await prisma.payment.findFirst({
      where: {
        tenant_id: tenantId,
        atendimento_id: atendimento.id,
        status: { in: [...STATUS_PAGAMENTO_ABERTO, 'PAID'] }
      },
      orderBy: { criado_em: 'desc' }
    });

    if (existente) {
      throw new ConflictError(
        existente.status === 'PAID'
          ? 'Este atendimento já foi pago.'
          : 'Já existe uma cobrança em aberto para este atendimento.'
      );
    }

    const payment = await paymentService.createPaymentIntent({
      tenantId,
      atendimentoId: atendimento.id,
      tutorId: atendimento.tutor_id,
      // Dívida conhecida: `metodo` vem do body sem validar contra `PaymentMethod`.
      method: metodo ? String(metodo) : 'PIX',
      amount: valor
    });

    // Avisar o tutor em tempo real e deixar registro na conversa do atendimento,
    // para a cobrança não depender do tutor abrir a tela de pagamento por conta própria.
    const io = req.app.get('io') as SocketServer | undefined;
    if (io) {
      io.to(`user:${atendimento.tutor_id}`).emit('pagamento:solicitado', {
        paymentId: payment.id,
        atendimentoId: atendimento.id,
        amount: Number(payment.amount),
        method: payment.method,
        expiresAt: payment.expires_at
      });
    }

    try {
      const mensagem = await prisma.mensagem.create({
        data: {
          tenant_id: tenantId,
          remetente_id: String(req.userId),
          destinatario_id: atendimento.tutor_id,
          atendimento_id: atendimento.id,
          conteudo: descricao
            ? `Cobrança de R$ ${Number(valor).toFixed(2)} gerada: ${descricao}`
            : `Cobrança de R$ ${Number(valor).toFixed(2)} gerada para este atendimento. O PIX está disponível na tela de pagamento.`,
          tipo: 'texto'
        },
        include: {
          remetente: { select: { id: true, nome: true, foto_perfil: true } },
          destinatario: { select: { id: true, nome: true, foto_perfil: true } }
        }
      });
      if (io) io.to(`user:${atendimento.tutor_id}`).emit('nova:mensagem', mensagem);
    } catch (error) {
      // O aviso é acessório: a cobrança já existe e não deve falhar por causa dele.
      console.error('⚠️ [VET FINANCEIRO] Falha ao avisar tutor sobre cobrança:', mensagemDe(error));
    }

    await AuditService.logForensicEvent({
      req,
      entityType: 'payment',
      entityId: payment.id,
      action: 'cobranca_criada_pelo_veterinario',
      detalhes: { atendimentoId: atendimento.id, valor: Number(valor), metodo: payment.method }
    });

    return res.status(201).json({
      success: true,
      message: 'Cobrança gerada e enviada ao tutor.',
      cobranca: {
        id: payment.id,
        status: payment.status,
        metodo: payment.method,
        valor: Number(payment.amount),
        pix_copy_paste: payment.pix_copy_paste,
        pix_qr_code_ref: payment.pix_qr_code_ref,
        expires_at: payment.expires_at
      }
    });
  });

  // Cancelar uma cobrança ainda não paga do próprio veterinário.
  cancelarCobranca = asyncHandler(async (req: Request, res: Response) => {
    const vet = await vetDoUsuario(String(req.userId));
    const id = String(req.params.id);

    const payment = await prisma.payment.findFirst({
      where: { id, tenant_id: String(req.tenantId), veterinario_id: vet.id }
    });

    if (!payment) {
      throw new NotFoundError('Cobrança não encontrada');
    }

    if (!STATUS_PAGAMENTO_CANCELAVEL.includes(payment.status)) {
      throw new ConflictError('Só é possível cancelar cobranças que ainda não foram pagas.');
    }

    if (payment.external_payment_id) {
      try {
        const gateway = await paymentService.getGateway(payment.provider, payment.tenant_id);
        await gateway.cancelPayment(payment.external_payment_id);
      } catch (error) {
        // Se o provedor recusar, não marcamos como cancelado localmente: um
        // "cancelado" só no nosso banco esconderia uma cobrança viva no Asaas.
        console.error('❌ [VET FINANCEIRO] Gateway recusou cancelamento:', mensagemDe(error));
        throw new ConflictError('O provedor de pagamento não confirmou o cancelamento. Tente novamente em instantes.');
      }
    }

    const atualizado = await prisma.payment.update({
      where: { id: payment.id },
      data: { status: 'CANCELLED', cancelled_at: new Date() }
    });

    await prisma.paymentSplit.updateMany({
      where: { payment_id: payment.id, status: 'PENDING' },
      data: { status: 'CANCELLED' }
    });

    const io = req.app.get('io') as SocketServer | undefined;
    if (io && payment.atendimento_id) {
      io.to(`user:${payment.tutor_id}`).emit('pagamento:cancelado', {
        paymentId: payment.id,
        atendimentoId: payment.atendimento_id
      });
    }

    await AuditService.logForensicEvent({
      req,
      entityType: 'payment',
      entityId: payment.id,
      action: 'cobranca_cancelada_pelo_veterinario',
      estadoAnterior: { status: payment.status },
      estadoPosterior: { status: atualizado.status }
    });

    return res.json({
      success: true,
      message: 'Cobrança cancelada.',
      cobranca: { id: atualizado.id, status: atualizado.status, cancelled_at: atualizado.cancelled_at }
    });
  });
}

const vetFinanceiroController = new VetFinanceiroController();

module.exports = vetFinanceiroController;

export default vetFinanceiroController;
