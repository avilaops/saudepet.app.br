import prisma from '../config/database';

/**
 * A trilha do que aconteceu, e por conta de quem.
 *
 * `auditLog` é append-only de propósito: nada aqui atualiza ou apaga linha.
 * Um registro que pode ser corrigido depois não serve de prova de nada — é
 * anotação. Quando a informação muda, entra linha nova.
 *
 * TODA gravação é melhor esforço: auditar não pode derrubar a ação auditada.
 * O preço disso é o `catch` do `logForensicEvent`, e ele já cobrou caro uma
 * vez (ver o comentário sobre `acao` vs `action` lá dentro).
 */

/** Quem/onde/o quê de um evento. `req` preenche o que não vier explícito. */
export type EventoPericial = {
  req?: any;
  tenantId?: string | null;
  actorUserId?: string | null;
  actorRole?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  action: string;
  requestId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  estadoAnterior?: unknown;
  estadoPosterior?: unknown;
  motivo?: string | null;
  detalhes?: unknown;
  sucesso?: boolean;
  erroMensagem?: string | null;
};

class AuditService {
  /**
   * Registra um evento pericial.
   *
   * Os campos explícitos vencem os da request: quem chama às vezes sabe mais
   * do que o middleware (o ator real de uma ação em lote, por exemplo).
   */
  static async logForensicEvent({
    req = null,
    tenantId = null,
    actorUserId = null,
    actorRole = null,
    entityType,
    entityId = null,
    action,
    requestId = null,
    ip = null,
    userAgent = null,
    estadoAnterior = null,
    estadoPosterior = null,
    motivo = null,
    detalhes = null,
    sucesso = true,
    erroMensagem = null
  }: EventoPericial): Promise<void> {
    try {
      const tenant_id = tenantId || req?.tenantId || null;
      const usuario_id = actorUserId || req?.userId || null;
      const role = actorRole || req?.userType || req?.user?.tipo_usuario || null;
      const clientIp = ip || req?.ip || req?.headers?.['x-forwarded-for'] || null;
      const clientUserAgent = userAgent || req?.headers?.['user-agent'] || null;
      const reqId = requestId || req?.headers?.['x-request-id'] || null;
      // Numa visita de suporte, o ator aparente é a pessoa visitada. Guardamos
      // no motivo quem realmente estava operando: um suporte capaz de agir sem
      // deixar rastro é pior do que suporte nenhum.
      const porTras = req?.impersonadoPor || null;
      const motivoFinal = porTras
        ? `${motivo ? `${motivo} · ` : ''}[visita de suporte operada por ${porTras}]`
        : motivo;

      await prisma.auditLog.create({
        data: {
          tenant_id,
          usuario_id,
          actor_role: role,
          entity_type: entityType,
          entity_id: entityId,
          recurso: entityType,
          recurso_id: entityId,
          // O modelo tem `acao`, não `action`. Mandar os dois fazia o Prisma
          // recusar o create inteiro ("Unknown argument `action`"), e como o
          // catch abaixo só imprime, todo evento pericial — login, logout,
          // troca de senha — era perdido em silêncio.
          acao: action,
          request_id: reqId,
          ip: clientIp,
          user_agent: clientUserAgent,
          estado_anterior: estadoAnterior || undefined,
          estado_posterior: estadoPosterior || undefined,
          motivo: motivoFinal,
          detalhes: detalhes ? JSON.stringify(detalhes) : null,
          sucesso,
          erro_mensagem: erroMensagem
        }
      });
    } catch (erro) {
      // Auditoria é melhor esforço: derrubar um login porque o log falhou
      // seria trocar um problema por um pior. Mas o silêncio aqui já escondeu
      // a perda de TODO evento pericial por meses — por isso o log de erro é
      // ruidoso e nomeado.
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      console.error('❌ [FORENSIC AUDIT ERROR]:', mensagem);
    }
  }

  /** Assinatura antiga, mantida porque dezenas de chamadas ainda a usam. */
  static async log({
    tenantId = null,
    usuarioId = null,
    acao,
    recurso = null,
    recursoId = null,
    detalhes = null,
    ip = null,
    userAgent = null,
    sucesso = true,
    erroMensagem = null
  }: {
    tenantId?: string | null;
    usuarioId?: string | null;
    acao: string;
    recurso?: string | null;
    recursoId?: string | null;
    detalhes?: unknown;
    ip?: string | null;
    userAgent?: string | null;
    sucesso?: boolean;
    erroMensagem?: string | null;
  }): Promise<void> {
    return this.logForensicEvent({
      tenantId,
      actorUserId: usuarioId,
      entityType: recurso,
      entityId: recursoId,
      action: acao,
      ip,
      userAgent,
      detalhes,
      sucesso,
      erroMensagem
    });
  }

  /**
   * Log de login bem-sucedido
   */
  static async logLogin(usuarioId: string, tenantId?: string | null, ip?: string | null, userAgent?: string | null): Promise<void> {
    await this.log({
      tenantId,
      usuarioId,
      acao: 'login',
      recurso: 'usuario',
      recursoId: usuarioId,
      ip,
      userAgent,
      sucesso: true
    });
  }

  /**
   * Log de tentativa de login falha
   */
  static async logLoginFailed(email: string, tenantId?: string | null, ip?: string | null, userAgent?: string | null, motivo?: string): Promise<void> {
    await this.log({
      tenantId,
      usuarioId: null,
      acao: 'login_failed',
      recurso: 'usuario',
      detalhes: { email, motivo },
      ip,
      userAgent,
      sucesso: false,
      erroMensagem: motivo
    });
  }

  /**
   * Log de logout
   */
  static async logLogout(usuarioId: string, tenantId?: string | null, ip?: string | null, userAgent?: string | null): Promise<void> {
    await this.log({
      tenantId,
      usuarioId,
      acao: 'logout',
      recurso: 'usuario',
      recursoId: usuarioId,
      ip,
      userAgent,
      sucesso: true
    });
  }

  /**
   * Log de registro de novo usuário
   */
  static async logRegister(usuarioId: string, tenantId: string | null | undefined, tipoUsuario: string, ip?: string | null, userAgent?: string | null): Promise<void> {
    await this.log({
      tenantId,
      usuarioId,
      acao: 'register',
      recurso: 'usuario',
      recursoId: usuarioId,
      detalhes: { tipo_usuario: tipoUsuario },
      ip,
      userAgent,
      sucesso: true
    });
  }

  /**
   * Log de reset de senha
   */
  static async logPasswordReset(usuarioId: string, tenantId?: string | null, ip?: string | null, userAgent?: string | null): Promise<void> {
    await this.log({
      tenantId,
      usuarioId,
      acao: 'password_reset',
      recurso: 'usuario',
      recursoId: usuarioId,
      ip,
      userAgent,
      sucesso: true
    });
  }

  /**
   * Log de mudança de senha
   */
  static async logPasswordChange(usuarioId: string, tenantId?: string | null, ip?: string | null, userAgent?: string | null): Promise<void> {
    await this.log({
      tenantId,
      usuarioId,
      acao: 'password_change',
      recurso: 'usuario',
      recursoId: usuarioId,
      ip,
      userAgent,
      sucesso: true
    });
  }

  /**
   * Log de verificação de email
   */
  static async logEmailVerification(usuarioId: string, tenantId: string | null | undefined, email: string): Promise<void> {
    await this.log({
      tenantId,
      usuarioId,
      acao: 'email_verification',
      recurso: 'usuario',
      recursoId: usuarioId,
      detalhes: { email },
      sucesso: true
    });
  }

  /**
   * Buscar logs de auditoria com filtros
   */
  static async getLogs({
    tenantId = null,
    usuarioId = null,
    acao = null,
    sucesso = null,
    dataInicio = null,
    dataFim = null,
    page = 1,
    limit = 50
  }: {
    tenantId?: string | null;
    usuarioId?: string | null;
    acao?: string | null;
    sucesso?: boolean | null;
    dataInicio?: string | Date | null;
    dataFim?: string | Date | null;
    page?: number;
    limit?: number;
  }) {
    const where: Record<string, any> = {};

    if (tenantId) where.tenant_id = tenantId;
    if (usuarioId) where.usuario_id = usuarioId;
    if (acao) where.acao = acao;
    if (sucesso !== null) where.sucesso = sucesso;

    if (dataInicio || dataFim) {
      where.criado_em = {};
      if (dataInicio) where.criado_em.gte = new Date(dataInicio);
      if (dataFim) where.criado_em.lte = new Date(dataFim);
    }

    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { criado_em: 'desc' }
      }),
      prisma.auditLog.count({ where })
    ]);

    return {
      // `detalhes` é gravado como texto JSON e devolvido como objeto. O
      // `try` existe porque linha antiga pode ter texto solto ali, e uma
      // consulta de auditoria não pode estourar por causa de UMA linha
      // malformada — justamente a linha que alguém pode querer esconder.
      logs: logs.map((log: any) => ({
        ...log,
        detalhes: (() => {
          if (!log.detalhes) return null;
          try {
            return JSON.parse(log.detalhes);
          } catch {
            return { texto: log.detalhes };
          }
        })()
      })),
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Obter estatísticas de auditoria
   */
  static async getStats(tenantId?: string | null, dias = 30) {
    const dataInicio = new Date();
    dataInicio.setDate(dataInicio.getDate() - dias);

    const where: Record<string, any> = {
      criado_em: { gte: dataInicio }
    };

    if (tenantId) where.tenant_id = tenantId;

    const [
      totalAcoes,
      acoesAgrupadas,
      tentativasLoginFalhadas,
      loginsRecentes
    ] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.groupBy({
        by: ['acao'],
        where,
        _count: { acao: true }
      }),
      prisma.auditLog.count({
        where: {
          ...where,
          acao: 'login_failed'
        }
      }),
      prisma.auditLog.count({
        where: {
          ...where,
          acao: 'login',
          sucesso: true
        }
      })
    ]);

    return {
      periodo_dias: dias,
      total_acoes: totalAcoes,
      acoes_por_tipo: acoesAgrupadas.map((g: any) => ({
        acao: g.acao,
        count: g._count.acao
      })),
      tentativas_login_falhadas: tentativasLoginFalhadas,
      logins_sucesso: loginsRecentes
    };
  }
}

module.exports = AuditService;
export default AuditService;
