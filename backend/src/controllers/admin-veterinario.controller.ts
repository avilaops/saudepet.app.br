import type { Request, Response } from 'express';
import type { StatusCredenciamento } from '@prisma/client';
// `Prisma` entra como valor, e não só como tipo, por causa de `Prisma.DbNull`.
import { Prisma } from '@prisma/client';
import prisma from '../config/database';
import { getSignedDownloadUrl } from '../config/r2';
import { NotFoundError, ValidationError, asyncHandler } from '../middleware/error.middleware';
import emailService from '../services/email.service';

const mensagemDoErro = (erro: unknown): string => (erro instanceof Error ? erro.message : String(erro));

/** Corpos das decisões de credenciamento; as rotas não validam com Zod. */
type DecisaoBody = { motivo?: string; observacao?: string };

/**
 * Controller de Moderação Administrativa & Credenciamento de Veterinários
 */
class AdminVeterinarioController {

  // Listar fila de moderação e credenciamento
  listarFilaAnalise = asyncHandler(async (req: Request, res: Response) => {
    const { status, search, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(String(page)) - 1) * parseInt(String(limit));

    const where: Prisma.VeterinarioWhereInput = {};
    if (status) {
      // O filtro vai como veio da query; valor fora do enum o Prisma recusa.
      where.status_credenciamento = String(status) as StatusCredenciamento;
    }

    if (search) {
      const termo = String(search);
      where.OR = [
        { crmv: { contains: termo, mode: 'insensitive' } },
        { especialidade: { contains: termo, mode: 'insensitive' } },
        { usuario: { nome: { contains: termo, mode: 'insensitive' } } },
        { usuario: { email: { contains: termo, mode: 'insensitive' } } }
      ];
    }

    const [total, veterinarios] = await Promise.all([
      prisma.veterinario.count({ where }),
      prisma.veterinario.findMany({
        where,
        include: {
          usuario: {
            select: {
              id: true,
              nome: true,
              email: true,
              telefone: true,
              cpf: true,
              cidade: true,
              estado: true,
              criado_em: true
            }
          }
        },
        orderBy: { criado_em: 'desc' },
        skip,
        take: parseInt(String(limit))
      })
    ]);

    return res.json({
      success: true,
      total,
      page: parseInt(String(page)),
      totalPages: Math.ceil(total / parseInt(String(limit))),
      veterinarios
    });
  });

  // Obter detalhes do veterinário + URLs temporárias assinadas dos documentos no R2
  detalhesComDocumentos = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    const vet = await prisma.veterinario.findUnique({
      where: { id },
      include: {
        usuario: {
          select: {
            id: true,
            nome: true,
            email: true,
            telefone: true,
            cpf: true,
            cidade: true,
            estado: true,
            criado_em: true
          }
        },
        submissoes: {
          orderBy: { criado_em: 'desc' },
          take: 5
        }
      }
    });

    if (!vet) {
      throw new NotFoundError('Veterinário não encontrado');
    }

    // Gerar URLs temporárias assinadas (15 min) para os documentos privados
    const [documentoSignedUrl, diplomaSignedUrl, identidadeSignedUrl] = await Promise.all([
      vet.documento_url ? getSignedDownloadUrl(vet.documento_url, 900) : null,
      vet.diploma_url ? getSignedDownloadUrl(vet.diploma_url, 900) : null,
      vet.documento_identidade_url ? getSignedDownloadUrl(vet.documento_identidade_url, 900) : null
    ]);

    return res.json({
      success: true,
      veterinario: {
        ...vet,
        documento_signed_url: documentoSignedUrl,
        diploma_signed_url: diplomaSignedUrl,
        identidade_signed_url: identidadeSignedUrl
      }
    });
  });

  // Aprovar Credenciamento do Veterinário
  aprovarCredenciamento = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { observacao }: DecisaoBody = req.body;
    const adminId = req.userId;

    const vet = await prisma.veterinario.findUnique({
      where: { id },
      include: { usuario: true }
    });

    if (!vet) {
      throw new NotFoundError('Veterinário não encontrado');
    }

    const agora = new Date();

    // Atualizar no banco como fonte única de verdade
    const atualizado = await prisma.$transaction([
      prisma.veterinario.update({
        where: { id },
        data: {
          status_credenciamento: 'APPROVED',
          aprovado_admin: true,
          observacao_interna: observacao || 'Aprovado na moderação administrativa',
          decidido_por_id: adminId,
          decidido_em: agora
        }
      }),
      // A APROVAÇÃO É O QUE PROMOVE. Quem pediu credenciamento de dentro da
      // conta (rota /veterinarios/credenciamento) continuou `tutor` esse tempo
      // todo, de propósito: CRMV é documento, e o papel só muda quando alguém
      // conferiu. Sem esta linha, o aprovado ficava com `aprovado_admin: true`
      // e mesmo assim sem acesso à área do profissional — aprovado no papel e
      // barrado na porta.
      prisma.usuario.update({
        where: { id: vet.usuario_id },
        data: { tipo_usuario: 'veterinario' }
      }),
      prisma.veterinarioSubmissao.create({
        data: {
          veterinario_id: id,
          status: 'APPROVED',
          documento_url: vet.documento_url,
          diploma_url: vet.diploma_url,
          // Coluna `Json?`: copiar o valor lido direto não serve, porque para o
          // Prisma um JSON ausente precisa ser `DbNull` (NULL no banco) e não o
          // `null` de JavaScript, que ele leria como o literal JSON `null`.
          documento_analise: vet.documento_analise ?? Prisma.DbNull,
          observacao_admin: observacao || 'Aprovado pelo Administrador',
          decidido_por_id: adminId,
          decidido_em: agora
        }
      }),
      prisma.auditLog.create({
        data: {
          usuario_id: adminId,
          tenant_id: vet.tenant_id,
          acao: 'veterinario_aprovado',
          actor_role: req.userType || 'admin',
          entity_type: 'Veterinario',
          entity_id: id,
          recurso: 'veterinario',
          recurso_id: id,
          estado_anterior: { status_credenciamento: vet.status_credenciamento, aprovado_admin: vet.aprovado_admin },
          estado_posterior: { status_credenciamento: 'APPROVED', aprovado_admin: true },
          motivo: observacao || 'Aprovado na moderação administrativa',
          detalhes: JSON.stringify({
            crmv: vet.crmv,
            nome: vet.usuario.nome,
            observacao
          }),
          ip: req.ip,
          user_agent: req.headers['user-agent']
        }
      })
    ]);

    // O template `vet/cadastro-aprovado` existia pronto, com a identidade da
    // marca, e este trecho escrevia HTML solto ao lado dele. Best-effort: um
    // e-mail que falha não desfaz uma aprovação.
    emailService.enviarEmailAprovacao(vet.usuario.email, vet.usuario.nome)
      .catch((err: unknown) => console.error('❌ Falha ao enviar e-mail de aprovação (ignorado):', mensagemDoErro(err)));

    return res.json({
      success: true,
      message: 'Veterinário aprovado com sucesso!',
      veterinario: atualizado[0]
    });
  });

  // Rejeitar Credenciamento
  rejeitarCredenciamento = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { motivo, observacao }: DecisaoBody = req.body;
    const adminId = req.userId;

    if (!motivo) {
      throw new ValidationError('O motivo da rejeição é obrigatório');
    }

    const vet = await prisma.veterinario.findUnique({
      where: { id },
      include: { usuario: true }
    });

    if (!vet) {
      throw new NotFoundError('Veterinário não encontrado');
    }

    const agora = new Date();

    const atualizado = await prisma.$transaction([
      prisma.veterinario.update({
        where: { id },
        data: {
          status_credenciamento: 'REJECTED',
          aprovado_admin: false,
          online: false, // Desliga imediatamente
          motivo_decisao: motivo,
          observacao_interna: observacao || null,
          decidido_por_id: adminId,
          decidido_em: agora
        }
      }),
      // Derrubar a sessão só faz sentido para quem JÁ ERA veterinário: sem
      // isto, o rejeitado seguia atendendo com o token antigo por até 7 dias.
      // Quem pediu credenciamento de dentro de uma conta de tutor nunca teve
      // acesso profissional para perder — e ser deslogado do próprio app por
      // causa de um pedido negado seria castigo por ter se candidatado.
      ...(vet.usuario?.tipo_usuario === 'veterinario'
        ? [prisma.usuario.update({
            where: { id: vet.usuario_id },
            data: { sessoes_revogadas_em: agora }
          })]
        : []),
      prisma.veterinarioSubmissao.create({
        data: {
          veterinario_id: id,
          status: 'REJECTED',
          documento_url: vet.documento_url,
          diploma_url: vet.diploma_url,
          // Coluna `Json?`: copiar o valor lido direto não serve, porque para o
          // Prisma um JSON ausente precisa ser `DbNull` (NULL no banco) e não o
          // `null` de JavaScript, que ele leria como o literal JSON `null`.
          documento_analise: vet.documento_analise ?? Prisma.DbNull,
          motivo,
          observacao_admin: observacao || null,
          decidido_por_id: adminId,
          decidido_em: agora
        }
      }),
      prisma.auditLog.create({
        data: {
          usuario_id: adminId,
          tenant_id: vet.tenant_id,
          acao: 'veterinario_rejeitado',
          actor_role: req.userType || 'admin',
          // `entity_type`/`entity_id` são as colunas que a central de auditoria
          // filtra e busca. Só `recurso_id` deixava a decisão gravada, porém
          // invisível na tela — auditoria que ninguém acha não audita nada.
          entity_type: 'Veterinario',
          entity_id: id,
          recurso: 'veterinario',
          recurso_id: id,
          estado_anterior: { status_credenciamento: vet.status_credenciamento, aprovado_admin: vet.aprovado_admin },
          estado_posterior: { status_credenciamento: 'REJECTED', aprovado_admin: false },
          motivo: motivo || 'Rejeitado na moderação administrativa',
          detalhes: JSON.stringify({ crmv: vet.crmv, crmv_uf: vet.crmv_uf, motivo, observacao }),
          ip: req.ip,
          user_agent: req.headers['user-agent']
        }
      })
    ]);

    // O template `vet/cadastro-ajuste` já existia, e o nome dele diz melhor o
    // que isto é: não uma porta fechada, um ajuste a fazer. A observação do
    // admin entra junto do motivo — é ela que diz o que corrigir.
    emailService.enviarEmailRejeicao(
      vet.usuario.email,
      vet.usuario.nome,
      [motivo, observacao].filter(Boolean).join(' — ')
    ).catch((err: unknown) => console.error('❌ Falha ao enviar e-mail de ajuste (ignorado):', mensagemDoErro(err)));

    return res.json({
      success: true,
      message: 'Cadastro rejeitado com sucesso',
      veterinario: atualizado[0]
    });
  });

  // Solicitar Reenvio de Documentos
  solicitarReenvio = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { observacao }: DecisaoBody = req.body;
    const adminId = req.userId;

    const vet = await prisma.veterinario.findUnique({
      where: { id },
      include: { usuario: true }
    });

    if (!vet) {
      throw new NotFoundError('Veterinário não encontrado');
    }

    const agora = new Date();

    const atualizado = await prisma.$transaction([
      prisma.veterinario.update({
        where: { id },
        data: {
          status_credenciamento: 'REQUIRES_RESUBMISSION',
          aprovado_admin: false,
          online: false,
          observacao_interna: observacao || 'Documentos precisam de reenvio',
          decidido_por_id: adminId,
          decidido_em: agora
        }
      }),
      prisma.auditLog.create({
        data: {
          usuario_id: adminId,
          tenant_id: vet.tenant_id,
          acao: 'veterinario_solicitou_reenvio',
          actor_role: req.userType || 'admin',
          entity_type: 'Veterinario',
          entity_id: id,
          recurso: 'veterinario',
          recurso_id: id,
          estado_anterior: { status_credenciamento: vet.status_credenciamento, aprovado_admin: vet.aprovado_admin },
          estado_posterior: { status_credenciamento: 'REQUIRES_RESUBMISSION', aprovado_admin: false },
          motivo: observacao || 'Documentação incompleta ou ilegível',
          detalhes: JSON.stringify({ crmv: vet.crmv, crmv_uf: vet.crmv_uf, observacao }),
          ip: req.ip,
          user_agent: req.headers['user-agent']
        }
      })
    ]);

    return res.json({
      success: true,
      message: 'Solicitação de reenvio registrada com sucesso',
      veterinario: atualizado[0]
    });
  });

  // Suspender Veterinário
  suspenderVeterinario = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { motivo }: DecisaoBody = req.body;
    const adminId = req.userId;

    const vet = await prisma.veterinario.findUnique({
      where: { id },
      include: { usuario: true }
    });

    if (!vet) {
      throw new NotFoundError('Veterinário não encontrado');
    }

    const agora = new Date();

    const atualizado = await prisma.$transaction([
      prisma.veterinario.update({
        where: { id },
        data: {
          status_credenciamento: 'SUSPENDED',
          aprovado_admin: false,
          online: false, // Desliga modo plantão imediatamente
          motivo_decisao: motivo || 'Suspenso pela administração',
          decidido_por_id: adminId,
          decidido_em: agora
        }
      }),
      // Suspender só mudava o status: quem já estava logado continuava atendendo
      // até o token expirar. Agora a sessão cai junto.
      prisma.usuario.update({
        where: { id: vet.usuario_id },
        data: { sessoes_revogadas_em: agora }
      }),
      prisma.auditLog.create({
        data: {
          usuario_id: adminId,
          tenant_id: vet.tenant_id,
          acao: 'veterinario_suspenso',
          actor_role: req.userType || 'admin',
          entity_type: 'Veterinario',
          entity_id: id,
          recurso: 'veterinario',
          recurso_id: id,
          estado_anterior: { status_credenciamento: vet.status_credenciamento, aprovado_admin: vet.aprovado_admin, online: vet.online },
          estado_posterior: { status_credenciamento: 'SUSPENDED', aprovado_admin: false, online: false },
          motivo: motivo || 'Suspenso pela administração',
          detalhes: JSON.stringify({ crmv: vet.crmv, crmv_uf: vet.crmv_uf, nome: vet.usuario?.nome, motivo }),
          ip: req.ip,
          user_agent: req.headers['user-agent']
        }
      })
    ]);

    return res.json({
      success: true,
      message: 'Veterinário suspenso com sucesso',
      veterinario: atualizado[0]
    });
  });

  /**
   * Reativar um veterinário suspenso ou recusado (v1.0: "ativação").
   *
   * Suspender já existia; o caminho de volta não. Um profissional suspenso
   * por engano — ou que resolveu a pendência — só voltava com acesso direto
   * ao banco. Reativar é a mesma promoção da aprovação: status APPROVED,
   * `aprovado_admin`, papel `veterinario`, e-mail e auditoria.
   */
  reativarVeterinario = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { motivo }: DecisaoBody = req.body || {};
    const adminId = req.userId;

    const vet = await prisma.veterinario.findFirst({
      where: { id, tenant_id: req.tenantId as string },
      include: { usuario: true }
    });

    if (!vet) {
      throw new NotFoundError('Veterinário não encontrado');
    }

    if (!['SUSPENDED', 'REJECTED', 'EXPIRED'].includes(vet.status_credenciamento)) {
      throw new ValidationError('Só é possível reativar um veterinário suspenso, recusado ou expirado');
    }

    const agora = new Date();

    const atualizado = await prisma.$transaction([
      prisma.veterinario.update({
        where: { id },
        data: {
          status_credenciamento: 'APPROVED',
          aprovado_admin: true,
          motivo_decisao: motivo || 'Reativado pela administração',
          decidido_por_id: adminId,
          decidido_em: agora
        }
      }),
      prisma.usuario.update({
        where: { id: vet.usuario_id },
        data: { tipo_usuario: 'veterinario' }
      }),
      prisma.auditLog.create({
        data: {
          usuario_id: adminId,
          tenant_id: vet.tenant_id,
          acao: 'veterinario_reativado',
          actor_role: req.userType || 'admin',
          entity_type: 'Veterinario',
          entity_id: id,
          recurso: 'veterinario',
          recurso_id: id,
          estado_anterior: { status_credenciamento: vet.status_credenciamento, aprovado_admin: vet.aprovado_admin },
          estado_posterior: { status_credenciamento: 'APPROVED', aprovado_admin: true },
          motivo: motivo || 'Reativado pela administração',
          detalhes: JSON.stringify({ crmv: vet.crmv, crmv_uf: vet.crmv_uf, nome: vet.usuario.nome }),
          ip: req.ip,
          user_agent: req.headers['user-agent']
        }
      })
    ]);

    Promise.resolve()
      .then(() => emailService.enviarEmailAprovacao(vet.usuario.email, vet.usuario.nome))
      .catch((err: unknown) => console.error('❌ Falha ao enviar e-mail de reativação (ignorado):', mensagemDoErro(err)));

    return res.json({
      success: true,
      message: 'Veterinário reativado com sucesso',
      veterinario: atualizado[0]
    });
  });

}

const adminVeterinarioController = new AdminVeterinarioController();

module.exports = adminVeterinarioController;
export default adminVeterinarioController;
