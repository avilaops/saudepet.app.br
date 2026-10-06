import type { Request, Response } from 'express';
import type { AuditLog, Prisma } from '@prisma/client';
import prisma from '../config/database';
import AuditService from '../services/audit.service';
import { getSignedDownloadUrl } from '../config/r2';
import { NotFoundError, ForbiddenError, asyncHandler } from '../middleware/error.middleware';

/**
 * Paginação da central de auditoria.
 *
 * A rota já contava o total, mas a tela mostrava só a primeira página e exibia o
 * total no botão de filtro — "1.842 registros encontrados" acima de 50 linhas,
 * sem nada dizendo que existiam mais. O teto no limite também é novo: sem ele,
 * `?limit=999999` puxava o log inteiro numa resposta só.
 */
const LOGS_POR_PAGINA_PADRAO = 50;
const LOGS_POR_PAGINA_MAXIMO = 200;

function paginacaoDosLogs(query: Request['query']) {
  const paginaPedida = Number.parseInt(String(query.page ?? query.pagina), 10);
  const limitePedido = Number.parseInt(String(query.limit ?? query.limite), 10);

  const pagina = Number.isFinite(paginaPedida) && paginaPedida > 0 ? paginaPedida : 1;
  const limite = Number.isFinite(limitePedido) && limitePedido > 0
    ? Math.min(limitePedido, LOGS_POR_PAGINA_MAXIMO)
    : LOGS_POR_PAGINA_PADRAO;

  return { pagina, limite };
}

/**
 * Os filtros que a central e a exportação compartilham — a mesma consulta,
 * montada a partir da mesma query string.
 */
function filtrosDeAuditoria(req: Request): Prisma.AuditLogWhereInput {
  const { tutorId, atendimentoId, periodoInicio, periodoFim, tipoEvento, action, search } = req.query;

  const where: Prisma.AuditLogWhereInput = {};
  if (req.tenantId && !req.isSuperAdmin) where.tenant_id = req.tenantId;

  if (tutorId) where.usuario_id = String(tutorId);
  if (tipoEvento) where.entity_type = String(tipoEvento);
  if (action) where.acao = String(action);
  if (atendimentoId) where.entity_id = String(atendimentoId);

  if (periodoInicio || periodoFim) {
    const criadoEm: Prisma.DateTimeFilter = {};
    if (periodoInicio) criadoEm.gte = new Date(String(periodoInicio));
    if (periodoFim) criadoEm.lte = new Date(String(periodoFim));
    where.criado_em = criadoEm;
  }

  if (search) {
    const termo = String(search);
    where.OR = [
      // `action` NÃO existe no modelo — a coluna é `acao`. Mantê-lo aqui
      // fazia o Prisma recusar a consulta inteira ("Unknown argument
      // `action`"), então QUALQUER busca na central de auditoria devolvia 500.
      { acao: { contains: termo, mode: 'insensitive' } },
      { ip: { contains: termo, mode: 'insensitive' } },
      { usuario_id: { contains: termo, mode: 'insensitive' } },
      { entity_id: { contains: termo, mode: 'insensitive' } }
    ];
  }

  return where;
}

/** Um nó da linha do tempo unificada do atendimento. */
type EventoDaLinhaDoTempo = {
  timestamp: Date;
  category: 'SOLICITACAO' | 'STATUS' | 'AUDIT' | 'CHAT' | 'PAGAMENTO';
  title: string;
  description: string;
  actor: { name?: string; role?: string; id?: string | null };
  payload: Record<string, unknown>;
};

class AdminAuditController {
  /**
   * Central de Auditoria Geral com Filtros Multidimensionais
   */
  getCentralAuditLogs = asyncHandler(async (req: Request, res: Response) => {
    const { atendimentoId } = req.query;

    const { pagina, limite } = paginacaoDosLogs(req.query);

    const where = filtrosDeAuditoria(req);

    const skip = (pagina - 1) * limite;

    // O select "Tipo de Entidade" da tela era uma lista escrita à mão, e 4 das 6
    // opções (`pagamento`, `prescricao`, `chat`, `moderacao`) não correspondiam a
    // nenhum `entity_type` realmente gravado — devolviam lista vazia sempre.
    // Devolver as entidades que EXISTEM no log impede que a lista volte a mentir
    // quando alguém acrescentar um novo tipo de evento.
    const escopoDoTenant: Prisma.AuditLogWhereInput = {};
    if (req.tenantId && !req.isSuperAdmin) escopoDoTenant.tenant_id = req.tenantId;

    const [logs, total, entidades] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { criado_em: 'desc' },
        skip,
        take: limite
      }),
      prisma.auditLog.count({ where }),
      prisma.auditLog.groupBy({
        by: ['entity_type'],
        where: { ...escopoDoTenant, entity_type: { not: null } },
        _count: { entity_type: true },
        orderBy: { _count: { entity_type: 'desc' } }
      })
    ]);

    // Log pericial da própria consulta de auditoria pelo Admin
    AuditService.logForensicEvent({
      req,
      entityType: 'auditoria',
      entityId: atendimentoId ? String(atendimentoId) : 'central',
      action: 'CENTRAL_AUDITORIA_CONSULTADA',
      motivo: `Consulta com filtros: ${JSON.stringify(req.query)}`
    });

    return res.json({
      success: true,
      entidades: entidades.map((item) => ({
        valor: item.entity_type,
        total: item._count.entity_type
      })),
      // `total`/`page`/`totalPages` seguem para não quebrar quem já lia; o
      // objeto `paginacao` é o formato do resto do projeto.
      total,
      page: pagina,
      totalPages: Math.max(1, Math.ceil(total / limite)),
      paginacao: {
        pagina,
        por_pagina: limite,
        total,
        paginas: Math.max(1, Math.ceil(total / limite))
      },
      logs
    });
  });

  /**
   * Linha do Tempo Forense Unificada por Atendimento
   */
  getAtendimentoForensicTimeline = asyncHandler(async (req: Request, res: Response) => {
    const { id: atendimentoId } = req.params;

    const solicitacao = await prisma.solicitacao.findUnique({
      where: { id: atendimentoId },
      include: {
        pet: true,
        tutor: { select: { id: true, nome: true, email: true, telefone: true, foto_perfil: true } },
        veterinario: {
          include: { usuario: { select: { id: true, nome: true, email: true, telefone: true, foto_perfil: true } } }
        },
        timeline: { orderBy: { registrado_em: 'asc' } }
      }
    });

    if (!solicitacao) {
      throw new NotFoundError('Atendimento não encontrado');
    }

    // Isolar por Tenant (se não for SuperAdmin)
    if (req.tenantId && solicitacao.tenant_id !== req.tenantId && !req.isSuperAdmin) {
      throw new ForbiddenError('Você não tem acesso a atendimentos de outra organização');
    }

    // Buscar todos os registros de auditoria pericial associados a este atendimento
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        OR: [
          { entity_id: atendimentoId },
          { recurso_id: atendimentoId }
        ]
      },
      orderBy: { criado_em: 'asc' }
    });

    // Buscar histórico do chat
    const mensagensChat = await prisma.mensagem.findMany({
      where: { atendimento_id: atendimentoId },
      // A mídia da conversa mora em `mensagens_anexos`, não numa coluna da
      // mensagem. Sem trazer a relação, o dossiê não tinha como citar o anexo.
      include: {
        anexos: {
          select: { id: true, nome_original: true, mime_type: true, tipo: true, arquivo_removido_em: true }
        }
      },
      orderBy: { criado_em: 'asc' }
    });

    // Buscar histórico de pagamentos, splits e estornos
    const pagamentos = await prisma.payment.findMany({
      where: { atendimento_id: atendimentoId },
      include: { splits: true, refunds: true },
      orderBy: { criado_em: 'asc' }
    });

    // Buscar Prontuário e Prescrição
    const prontuario = await prisma.prontuarioEletronico.findUnique({
      where: { atendimento_id: atendimentoId },
      include: { itensPrescricao: true, examesSolicitados: true }
    });

    // Gerar Presigned URLs R2 com tempo de expiração de 15 minutos para receitas/prontuários
    let receitaPdfSignedUrl: string | null = null;
    let prontuarioPdfSignedUrl: string | null = null;

    if (solicitacao.receita_pdf_url) {
      try {
        const key = solicitacao.receita_pdf_url.split('.com/')[1] || solicitacao.receita_pdf_url;
        receitaPdfSignedUrl = await getSignedDownloadUrl(key, 900); // 15 min
      } catch (err) {
        receitaPdfSignedUrl = solicitacao.receita_pdf_url;
      }
    }

    if (solicitacao.prontuario_pdf_url) {
      try {
        const key = solicitacao.prontuario_pdf_url.split('.com/')[1] || solicitacao.prontuario_pdf_url;
        prontuarioPdfSignedUrl = await getSignedDownloadUrl(key, 900);
      } catch (err) {
        prontuarioPdfSignedUrl = solicitacao.prontuario_pdf_url;
      }
    }

    // Construir NÓS DA LINHA DO TEMPO UNIFICADA
    const timelineEvents: EventoDaLinhaDoTempo[] = [];

    // 1. Criação do Chamado
    timelineEvents.push({
      timestamp: solicitacao.criado_em,
      category: 'SOLICITACAO',
      title: 'Solicitação de Atendimento Criada',
      description: `Tutor ${solicitacao.tutor.nome} solicitou ${solicitacao.tipo_atendimento} para o pet ${solicitacao.pet?.nome}`,
      actor: { name: solicitacao.tutor.nome, role: 'tutor', id: solicitacao.tutor_id },
      payload: { tipo: solicitacao.tipo_atendimento, valor: solicitacao.valor_estimado, endereco: solicitacao.localizacao_cliente }
    });

    // 2. Timeline Status Changes
    solicitacao.timeline.forEach((t) => {
      timelineEvents.push({
        timestamp: t.registrado_em,
        category: 'STATUS',
        title: `Mudança de Status: ${t.status.toUpperCase()}`,
        description: t.observacao || `Status alterado para ${t.status}`,
        actor: { name: 'Sistema', role: 'system' },
        payload: { status: t.status, lat: t.latitude, lng: t.longitude }
      });
    });

    // 3. Audit Logs Gravados
    auditLogs.forEach((al) => {
      timelineEvents.push({
        timestamp: al.criado_em,
        category: 'AUDIT',
        title: `Evento: ${al.acao}`,
        description: al.motivo || `Ação executada no recurso ${al.entity_type}`,
        actor: { role: al.actor_role || 'user', id: al.usuario_id },
        payload: { ip: al.ip, userAgent: al.user_agent, estadoAnterior: al.estado_anterior, estadoPosterior: al.estado_posterior }
      });
    });

    // 4. Mensagens do Chat
    mensagensChat.forEach((m) => {
      // Quem falou sai de quem é parte no atendimento: a mensagem guarda o id do
      // remetente, não o papel dele.
      const papel = m.remetente_id === solicitacao.tutor_id
        ? 'tutor'
        : (m.remetente_id === solicitacao.veterinario?.usuario_id ? 'veterinario' : 'user');

      timelineEvents.push({
        timestamp: m.criado_em,
        category: 'CHAT',
        title: 'Mensagem no Chat',
        description: m.conteudo || (m.anexos.length ? '[Anexo de mídia]' : '[Mensagem sem texto]'),
        actor: { id: m.remetente_id, role: papel },
        // O anexo é citado pelo que ele é, não por URL: o arquivo só se acessa
        // por link assinado, e depois da retenção a linha fica sem binário.
        payload: {
          tipo: m.tipo,
          anexos: m.anexos.map((a) => ({
            id: a.id,
            nome: a.nome_original,
            mimeType: a.mime_type,
            tipo: a.tipo,
            arquivoRemovidoEm: a.arquivo_removido_em
          }))
        }
      });
    });

    // 5. Pagamentos
    pagamentos.forEach((p) => {
      timelineEvents.push({
        timestamp: p.criado_em,
        category: 'PAGAMENTO',
        title: `Cobrança ${p.method} — R$ ${Number(p.amount).toFixed(2)} (${p.status})`,
        description: `Provider: ${p.provider} • ID: ${p.external_payment_id || p.id}`,
        actor: { name: solicitacao.tutor.nome, role: 'tutor' },
        payload: { splits: p.splits, refunds: p.refunds, status: p.status }
      });
    });

    // Sort cronológico perfeito
    timelineEvents.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    // Log pericial da auditoria realizada pelo admin
    AuditService.logForensicEvent({
      req,
      entityType: 'atendimento',
      entityId: atendimentoId,
      action: 'LINHA_DO_TEMPO_AUDITADA',
      motivo: `Investigação pericial iniciada pelo Admin ${req.userId}`
    });

    return res.json({
      success: true,
      solicitacao: {
        ...solicitacao,
        receita_pdf_signed_url: receitaPdfSignedUrl,
        prontuario_pdf_signed_url: prontuarioPdfSignedUrl
      },
      prontuario,
      timelineEvents
    });
  });

  /**
   * Exportar Logs de Auditoria para Conformidade Pericial / Legal
   */
  exportAuditLogs = asyncHandler(async (req: Request, res: Response) => {
    // A tela mandava só `format=json` e o backend só olhava as datas: saía
    // sempre o mesmo despejo dos 2 000 últimos registros do tenant,
    // independentemente do recorte visível — e `format` era ignorado, apesar do
    // nome. Um "relatório pericial" que não corresponde ao que o perito filtrou
    // não serve para perícia nenhuma.
    const { format = 'json', periodoInicio, periodoFim, tipoEvento, action, tutorId, atendimentoId, search } = req.query;

    const where = filtrosDeAuditoria(req);

    const TETO = 2000;
    const [logs, totalNoRecorte] = await Promise.all([
      prisma.auditLog.findMany({ where, orderBy: { criado_em: 'desc' }, take: TETO }),
      prisma.auditLog.count({ where })
    ]);

    const truncado = totalNoRecorte > logs.length;

    AuditService.logForensicEvent({
      req,
      entityType: 'auditoria',
      action: 'LOGS_AUDITORIA_EXPORTADOS',
      motivo: `Exportação de ${logs.length} de ${totalNoRecorte} registros no formato ${format}`,
      detalhes: { filtros: req.query, truncado }
    });

    const carimbo = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

    if (String(format).toLowerCase() === 'csv') {
      // `action` não é coluna do modelo (a coluna é `acao`) e sai sempre vazia;
      // segue na lista porque é o cabeçalho que quem já consome o CSV espera.
      const colunas = ['id', 'criado_em', 'tenant_id', 'usuario_id', 'entity_type', 'entity_id', 'acao', 'action', 'motivo', 'ip', 'user_agent'];
      const valorDaColuna = (log: AuditLog, coluna: string): unknown => (log as Record<string, unknown>)[coluna];
      // Ponto e vírgula + BOM: é o que o Excel em português abre sem pedir nada,
      // mesmo padrão da exportação de leads.
      const escapar = (valor: unknown) => {
        if (valor === null || valor === undefined) return '';
        const texto = valor instanceof Date ? valor.toISOString() : String(valor);
        return `"${texto.replace(/"/g, '""')}"`;
      };
      const linhas = [colunas.join(';')].concat(
        logs.map((log) => colunas.map((coluna) => escapar(valorDaColuna(log, coluna))).join(';'))
      );

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename=saudepet-auditoria-${carimbo}.csv`);
      return res.send('﻿' + linhas.join('\n'));
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=saudepet-auditoria-${carimbo}.json`);
    return res.send(JSON.stringify({
      // O cabeçalho diz exatamente o que este arquivo é — inclusive quando o
      // teto cortou registros, que antes saía como se fosse a coleção inteira.
      exportado_em: new Date().toISOString(),
      filtros: { periodoInicio, periodoFim, tipoEvento, action, tutorId, atendimentoId, search },
      registros_exportados: logs.length,
      registros_no_recorte: totalNoRecorte,
      truncado,
      teto_por_exportacao: TETO,
      logs
    }, null, 2));
  });
}

const adminAuditController = new AdminAuditController();

module.exports = adminAuditController;
export default adminAuditController;
