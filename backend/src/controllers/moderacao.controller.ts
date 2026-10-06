import type { Request, Response } from 'express';
import type { Prisma } from '@prisma/client';
import type { z } from 'zod';
import prisma from '../config/database';
import AuditService from '../services/audit.service';
import { asyncHandler, NotFoundError, ValidationError } from '../middleware/error.middleware';
import type {
  analisarViolacaoSchema,
  aplicarPunicaoSchema,
  consultarPunicoesSchema,
  consultarViolacoesSchema,
  reportarViolacaoSchema,
  revogarPunicaoSchema
} from '../schemas/moderacao.schema';

// ═══════════════════════════════════════════════════════
// SISTEMA DE MODERAÇÃO E BANIMENTO
// ═══════════════════════════════════════════════════════

type ReportarViolacaoInput = z.infer<typeof reportarViolacaoSchema>;
type AnalisarViolacaoInput = z.infer<typeof analisarViolacaoSchema>;
type AplicarPunicaoInput = z.infer<typeof aplicarPunicaoSchema>;
type RevogarPunicaoInput = z.infer<typeof revogarPunicaoSchema>;
type ConsultarViolacoesQuery = z.infer<typeof consultarViolacoesSchema>;
type ConsultarPunicoesQuery = z.infer<typeof consultarPunicoesSchema>;

/**
 * `validate(schema)` substitui `req.body`/`req.query` pelo objeto já validado e
 * coagido (números, defaults, `ativa` já como boolean). O tipo do Express não
 * sabe disso, então cada handler declara o schema pelo qual a rota passou.
 */
const corpoValidado = <T>(req: Request): T => req.body as T;
const queryValidada = <T>(req: Request): T => req.query as unknown as T;

/**
 * Quem está autenticado e em qual organização. `tenant_id` é nulo para
 * super_admin sem organização; o Prisma recusaria o `null` num campo
 * obrigatório, então o erro sobe daqui.
 */
function contextoDaRequisicao(req: Request): { usuario_id: string; tenant_id: string } {
  if (!req.user) throw new Error('Usuário não autenticado');
  if (!req.user.tenant_id) throw new Error('Usuário sem organização associada');
  return { usuario_id: req.user.id, tenant_id: req.user.tenant_id };
}

/** O histórico vazio que a API devolve para quem nunca foi moderado. */
const HISTORICO_VAZIO = {
  total_violacoes: 0,
  total_pontos: 0,
  advertencias: 0,
  suspensoes_temp: 0,
  suspensoes_perm: 0,
  banido: false
};

/**
 * Reportar violação
 * POST /api/v1/moderacao/reportar
 * Acesso: Autenticado
 */
const reportarViolacao = asyncHandler(async (req: Request, res: Response) => {
  const { usuario_id, tipo, descricao, evidencias, gravidade } = corpoValidado<ReportarViolacaoInput>(req);
  const { tenant_id, usuario_id: reportado_por } = contextoDaRequisicao(req);

  // Verificar se usuário existe no mesmo tenant
  const usuarioExiste = await prisma.usuario.findFirst({
    where: { id: usuario_id, tenant_id }
  });

  if (!usuarioExiste) {
    throw new NotFoundError('Usuário não encontrado');
  }

  // Não pode reportar a si mesmo
  if (usuario_id === reportado_por) {
    throw new ValidationError('Você não pode reportar a si mesmo');
  }

  // Calcular pontos baseado na gravidade
  const pontos = gravidade || 1;

  const violacao = await prisma.violacao.create({
    data: {
      tenant_id,
      usuario_id,
      reportado_por,
      tipo,
      descricao,
      evidencias: evidencias ? JSON.stringify(evidencias) : null,
      gravidade: gravidade || 1,
      pontos,
      status: 'pendente'
    }
  });

  // Atualizar histórico do usuário
  await atualizarHistoricoUsuario(usuario_id, tenant_id);

  return res.status(201).json({
    message: 'Violação reportada com sucesso. Nossa equipe irá analisar.',
    violacao: {
      ...violacao,
      evidencias: violacao.evidencias ? JSON.parse(violacao.evidencias) : null
    }
  });
});

/**
 * Listar violações
 * GET /api/v1/moderacao/violacoes
 * Acesso: Admin
 */
const listarViolacoes = asyncHandler(async (req: Request, res: Response) => {
  const { usuario_id, tipo, status, gravidade_min, data_inicio, data_fim, page = 1, limit = 20 } = queryValidada<ConsultarViolacoesQuery>(req);
  const { tenant_id } = contextoDaRequisicao(req);

  const where: Prisma.ViolacaoWhereInput = {
    tenant_id,
    ...(usuario_id && { usuario_id }),
    ...(tipo && { tipo }),
    ...(status && { status }),
    ...(gravidade_min && { gravidade: { gte: gravidade_min } }),
    ...(data_inicio && data_fim && {
      criado_em: {
        gte: new Date(data_inicio),
        lte: new Date(data_fim)
      }
    })
  };

  const [violacoes, total] = await Promise.all([
    prisma.violacao.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { criado_em: 'desc' }
    }),
    prisma.violacao.count({ where })
  ]);

  // O modelo guarda só os UUIDs; a tela de moderação precisa de nomes.
  const idsEnvolvidos = [...new Set(violacoes.flatMap((v) => [v.usuario_id, v.reportado_por]).filter((id): id is string => Boolean(id)))];
  const envolvidos = idsEnvolvidos.length
    ? await prisma.usuario.findMany({
        where: { id: { in: idsEnvolvidos } },
        select: { id: true, nome: true, email: true, tipo_usuario: true }
      })
    : [];
  const porId = Object.fromEntries(envolvidos.map((u) => [u.id, u]));

  const violacoesComParse = violacoes.map((v) => ({
    ...v,
    evidencias: v.evidencias ? JSON.parse(v.evidencias) : null,
    usuario: porId[v.usuario_id] || null,
    reportado_por_usuario: v.reportado_por ? porId[v.reportado_por] || null : null
  }));

  return res.json({
    violacoes: violacoesComParse,
    paginacao: {
      total,
      pagina: page,
      limite: limit,
      total_paginas: Math.ceil(total / limit)
    }
  });
});

/**
 * Analisar violação (Admin)
 * PUT /api/v1/moderacao/violacoes/:id/analisar
 * Acesso: Admin
 */
const analisarViolacao = asyncHandler(async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const { status, resolucao } = corpoValidado<AnalisarViolacaoInput>(req);
  const { tenant_id, usuario_id: analisado_por } = contextoDaRequisicao(req);

  const violacao = await prisma.violacao.findFirst({
    where: { id, tenant_id }
  });

  if (!violacao) {
    throw new NotFoundError('Violação não encontrada');
  }

  if (violacao.status !== 'pendente' && violacao.status !== 'em_analise') {
    throw new ValidationError('Esta violação já foi analisada');
  }

  const violacaoAtualizada = await prisma.violacao.update({
    where: { id },
    data: {
      status,
      resolucao,
      analisado_por,
      analisado_em: new Date()
    }
  });

  // Atualizar histórico
  await atualizarHistoricoUsuario(violacao.usuario_id, tenant_id);

  return res.json({
    message: 'Violação analisada com sucesso',
    violacao: {
      ...violacaoAtualizada,
      evidencias: violacaoAtualizada.evidencias ? JSON.parse(violacaoAtualizada.evidencias) : null
    }
  });
});

/**
 * Aplicar punição
 * POST /api/v1/moderacao/punicoes
 * Acesso: Admin
 */
const aplicarPunicao = asyncHandler(async (req: Request, res: Response) => {
  const { usuario_id, violacao_id, tipo, motivo, dias_suspensao } = corpoValidado<AplicarPunicaoInput>(req);
  const { tenant_id, usuario_id: aplicada_por } = contextoDaRequisicao(req);

  // Verificar se violação existe e foi confirmada
  const violacao = await prisma.violacao.findFirst({
    where: { id: violacao_id, tenant_id, status: 'confirmada' }
  });

  if (!violacao) {
    throw new NotFoundError('Violação não encontrada ou não confirmada');
  }

  // Calcular data de término (se aplicável)
  let termina_em: Date | null = null;
  if (tipo === 'suspensao_temp' && dias_suspensao) {
    termina_em = new Date();
    termina_em.setDate(termina_em.getDate() + dias_suspensao);
  }

  const punicao = await prisma.punicao.create({
    data: {
      tenant_id,
      usuario_id,
      violacao_id,
      tipo,
      motivo,
      termina_em,
      aplicada_por,
      ativa: true
    }
  });

  // Atualizar histórico do usuário
  const historico = await atualizarHistoricoUsuario(usuario_id, tenant_id);

  // Se for banimento permanente, marcar usuário como banido
  if (tipo === 'suspensao_perm') {
    await prisma.historicoModeracaoUsuario.update({
      where: { tenant_id_usuario_id: { tenant_id, usuario_id } },
      data: { banido: true }
    });
  }

  // Aqui é onde a punição passa a punir. Até então `Punicao` e `banido` eram
  // gravados e NADA no sistema os lia: o suspenso continuava entrando e usando
  // o app normalmente, enquanto a tela dizia que ele perdia acesso na hora.
  // O bloqueio é espelhado no usuário porque o authMiddleware roda a cada
  // request e já carrega essa linha — custa zero consulta a mais.
  // Advertência e restrição de função não tiram acesso.
  if (tipo === 'suspensao_perm' || tipo === 'suspensao_temp') {
    await prisma.usuario.update({
      where: { id: usuario_id },
      data: {
        bloqueado: true,
        bloqueado_ate: tipo === 'suspensao_temp' ? termina_em : null,
        bloqueio_motivo: motivo,
        // Derruba a sessão aberta: sem isto o punido seguiria com o token
        // válido até o middleware ser alcançado — que agora já barra, mas o
        // corte de sessão deixa o efeito explícito na trilha.
        sessoes_revogadas_em: new Date()
      }
    });
  }

  // Punir suspende ou bane uma pessoa da plataforma — é irreversível na
  // prática (o usuário perde acesso na hora) e precisa dizer quem aplicou,
  // com que motivo e sobre qual violação confirmada.
  await AuditService.logForensicEvent({
    req,
    tenantId: tenant_id,
    entityType: 'Punicao',
    entityId: punicao.id,
    action: 'moderacao.punicao_aplicada',
    estadoPosterior: { tipo, ativa: true, termina_em, banido: tipo === 'suspensao_perm' },
    motivo,
    detalhes: { usuario_punido_id: usuario_id, violacao_id, dias_suspensao: dias_suspensao || null }
  });

  return res.status(201).json({
    message: 'Punição aplicada com sucesso',
    punicao,
    historico_usuario: historico
  });
});

/**
 * Revogar punição
 * PUT /api/v1/moderacao/punicoes/:id/revogar
 * Acesso: Admin
 */
const revogarPunicao = asyncHandler(async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const { motivo_revogacao } = corpoValidado<RevogarPunicaoInput>(req);
  const { tenant_id, usuario_id: revogada_por } = contextoDaRequisicao(req);

  const punicao = await prisma.punicao.findFirst({
    where: { id, tenant_id, ativa: true }
  });

  if (!punicao) {
    throw new NotFoundError('Punição não encontrada ou já revogada');
  }

  const punicaoAtualizada = await prisma.punicao.update({
    where: { id },
    data: {
      ativa: false,
      revogada_em: new Date(),
      revogada_por,
      motivo_revogacao
    }
  });

  // Se era banimento permanente, desbanir usuário
  if (punicao.tipo === 'suspensao_perm') {
    await prisma.historicoModeracaoUsuario.update({
      where: { tenant_id_usuario_id: { tenant_id, usuario_id: punicao.usuario_id } },
      data: { banido: false }
    });
  }

  // Devolver o acesso de fato. Antes o "revogar" desfazia um bloqueio que nunca
  // existiu; agora limpa o espelho que o authMiddleware lê. Só se não houver
  // OUTRA suspensão ativa — senão revogar uma punição perdoaria todas.
  if (punicao.tipo === 'suspensao_perm' || punicao.tipo === 'suspensao_temp') {
    const outra = await prisma.punicao.findFirst({
      where: {
        tenant_id,
        usuario_id: punicao.usuario_id,
        ativa: true,
        tipo: { in: ['suspensao_perm', 'suspensao_temp'] },
        OR: [{ termina_em: null }, { termina_em: { gt: new Date() } }]
      }
    });

    if (!outra) {
      await prisma.usuario.update({
        where: { id: punicao.usuario_id },
        data: { bloqueado: false, bloqueado_ate: null, bloqueio_motivo: null }
      });
    }
  }

  // Atualizar histórico
  await atualizarHistoricoUsuario(punicao.usuario_id, tenant_id);

  // Devolver acesso a quem foi punido é tão sensível quanto punir.
  await AuditService.logForensicEvent({
    req,
    tenantId: tenant_id,
    entityType: 'Punicao',
    entityId: punicao.id,
    action: 'moderacao.punicao_revogada',
    estadoAnterior: { tipo: punicao.tipo, ativa: true },
    estadoPosterior: { ativa: false, banido: false },
    detalhes: { usuario_punido_id: punicao.usuario_id }
  });

  return res.json({
    message: 'Punição revogada com sucesso',
    punicao: punicaoAtualizada
  });
});

/**
 * Listar punições
 * GET /api/v1/moderacao/punicoes
 * Acesso: Admin
 */
const listarPunicoes = asyncHandler(async (req: Request, res: Response) => {
  const { usuario_id, tipo, ativa, page = 1, limit = 20 } = queryValidada<ConsultarPunicoesQuery>(req);
  const { tenant_id } = contextoDaRequisicao(req);

  const where: Prisma.PunicaoWhereInput = {
    tenant_id,
    ...(usuario_id && { usuario_id }),
    ...(tipo && { tipo }),
    // O schema já transformou `?ativa=true` em boolean.
    ...(ativa !== undefined && { ativa })
  };

  const [punicoes, total] = await Promise.all([
    prisma.punicao.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      include: {
        violacao: {
          select: {
            tipo: true,
            descricao: true,
            gravidade: true
          }
        }
      },
      orderBy: { criado_em: 'desc' }
    }),
    prisma.punicao.count({ where })
  ]);

  const idsPunidos = [...new Set(punicoes.map((p) => p.usuario_id))];
  const punidos = idsPunidos.length
    ? await prisma.usuario.findMany({
        where: { id: { in: idsPunidos } },
        select: { id: true, nome: true, email: true, tipo_usuario: true }
      })
    : [];
  const punidoPorId = Object.fromEntries(punidos.map((u) => [u.id, u]));

  return res.json({
    punicoes: punicoes.map((p) => ({ ...p, usuario: punidoPorId[p.usuario_id] || null })),
    paginacao: {
      total,
      pagina: page,
      limite: limit,
      total_paginas: Math.ceil(total / limit)
    }
  });
});

/**
 * Verificar status de moderação do usuário
 * GET /api/v1/moderacao/meu-status
 * Acesso: Autenticado
 */
const meuStatus = asyncHandler(async (req: Request, res: Response) => {
  const { tenant_id, usuario_id } = contextoDaRequisicao(req);

  const historico = await prisma.historicoModeracaoUsuario.findUnique({
    where: { tenant_id_usuario_id: { tenant_id, usuario_id } }
  });

  // Buscar punições ativas
  const punicoesAtivas = await prisma.punicao.findMany({
    where: {
      tenant_id,
      usuario_id,
      ativa: true,
      OR: [
        { termina_em: null }, // Permanente
        { termina_em: { gte: new Date() } } // Ainda não expirada
      ]
    }
  });

  return res.json({
    historico: historico || HISTORICO_VAZIO,
    punicoes_ativas: punicoesAtivas
  });
});

/**
 * Histórico de moderação de um usuário
 * GET /api/v1/moderacao/usuarios/:id
 * Acesso: Admin
 */
const historicoUsuario = asyncHandler(async (req: Request, res: Response) => {
  const usuario_id = String(req.params.id);
  const { tenant_id } = contextoDaRequisicao(req);

  const [historico, violacoes, punicoes] = await Promise.all([
    prisma.historicoModeracaoUsuario.findUnique({
      where: { tenant_id_usuario_id: { tenant_id, usuario_id } }
    }),
    prisma.violacao.findMany({
      where: { tenant_id, usuario_id },
      orderBy: { criado_em: 'desc' },
      take: 10
    }),
    prisma.punicao.findMany({
      where: { tenant_id, usuario_id },
      orderBy: { criado_em: 'desc' },
      take: 10
    })
  ]);

  return res.json({
    historico: historico || HISTORICO_VAZIO,
    violacoes_recentes: violacoes,
    punicoes_recentes: punicoes
  });
});

/**
 * Estatísticas de moderação
 * GET /api/v1/moderacao/estatisticas
 * Acesso: Admin
 */
const estatisticas = asyncHandler(async (req: Request, res: Response) => {
  const { tenant_id } = contextoDaRequisicao(req);
  // Esta rota não passa por `validate`: `dias` chega cru da query string.
  const dias = parseInt(String(req.query.dias ?? 30));

  const dataInicio = new Date();
  dataInicio.setDate(dataInicio.getDate() - dias);

  const [
    totalViolacoes,
    violacoesPendentes,
    violacoesPorTipo,
    punicoesAtivas,
    usuariosBanidos
  ] = await Promise.all([
    prisma.violacao.count({
      where: { tenant_id, criado_em: { gte: dataInicio } }
    }),
    prisma.violacao.count({
      where: { tenant_id, status: 'pendente' }
    }),
    prisma.violacao.groupBy({
      by: ['tipo'],
      where: { tenant_id, criado_em: { gte: dataInicio } },
      _count: true
    }),
    prisma.punicao.count({
      where: { tenant_id, ativa: true }
    }),
    prisma.historicoModeracaoUsuario.count({
      where: { tenant_id, banido: true }
    })
  ]);

  return res.json({
    estatisticas: {
      periodo_dias: dias,
      total_violacoes: totalViolacoes,
      violacoes_pendentes: violacoesPendentes,
      punicoes_ativas: punicoesAtivas,
      usuarios_banidos: usuariosBanidos,
      violacoes_por_tipo: violacoesPorTipo.reduce<Record<string, number>>((acc, item) => {
        acc[item.tipo] = item._count;
        return acc;
      }, {})
    }
  });
});

// ═══════════════════════════════════════════════════════
// FUNÇÕES AUXILIARES
// ═══════════════════════════════════════════════════════

/**
 * Atualizar histórico de moderação do usuário
 */
async function atualizarHistoricoUsuario(usuario_id: string, tenant_id: string) {
  const [violacoes, punicoes] = await Promise.all([
    prisma.violacao.findMany({
      where: { usuario_id, tenant_id }
    }),
    prisma.punicao.findMany({
      where: { usuario_id, tenant_id }
    })
  ]);

  const totalViolacoes = violacoes.length;
  const totalPontos = violacoes.reduce((sum, v) => sum + v.pontos, 0);
  const ultimaViolacao = violacoes.length > 0
    ? violacoes.sort((a, b) => b.criado_em.getTime() - a.criado_em.getTime())[0].criado_em
    : null;

  const advertencias = punicoes.filter((p) => p.tipo === 'advertencia').length;
  const suspensoesTemp = punicoes.filter((p) => p.tipo === 'suspensao_temp').length;
  const suspensoesPerm = punicoes.filter((p) => p.tipo === 'suspensao_perm').length;
  const banido = suspensoesPerm > 0;

  return await prisma.historicoModeracaoUsuario.upsert({
    where: { tenant_id_usuario_id: { tenant_id, usuario_id } },
    create: {
      tenant_id,
      usuario_id,
      total_violacoes: totalViolacoes,
      total_pontos: totalPontos,
      advertencias,
      suspensoes_temp: suspensoesTemp,
      suspensoes_perm: suspensoesPerm,
      ultima_violacao_em: ultimaViolacao,
      banido
    },
    update: {
      total_violacoes: totalViolacoes,
      total_pontos: totalPontos,
      advertencias,
      suspensoes_temp: suspensoesTemp,
      suspensoes_perm: suspensoesPerm,
      ultima_violacao_em: ultimaViolacao,
      banido
    }
  });
}

export {
  reportarViolacao,
  listarViolacoes,
  analisarViolacao,
  aplicarPunicao,
  revogarPunicao,
  listarPunicoes,
  meuStatus,
  historicoUsuario,
  estatisticas
};
