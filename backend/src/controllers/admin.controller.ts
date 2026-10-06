import type { Request, Response } from 'express';
import type { Prisma, StatusAtendimento, TipoUsuario } from '@prisma/client';
import prisma from '../config/database';
import { comAvaliacaoDoTutor } from '../utils/avaliacao';
import { transicionar } from '../services/atendimento-state.service';
import AuditService from '../services/audit.service';
import { enviarParaUsuario } from '../services/push.service';
import type { Aviso } from '../services/push.service';
import {
  NotFoundError,
  ForbiddenError,
  ValidationError,
  ConflictError,
  asyncHandler
} from '../middleware/error.middleware';
import { addTenantFilter } from '../middleware/tenant.middleware';

// Estados terminais: intervir num atendimento já encerrado não faz sentido.
const ENCERRADOS = [
  'finalizado', 'concluido', 'encaminhado',
  'cancelado', 'cancelado_tutor', 'cancelado_vet', 'cancelado_admin'
];

/**
 * `addTenantFilter` já devolve `tenant_id` como texto opcional. O apelido aqui
 * existe só para fixar `T` no tipo de `where` do modelo consultado, para que o
 * Prisma continue conferindo os outros campos do filtro.
 */
const escopoDoTenant = <T extends Record<string, unknown>>(req: Request, where: T = {} as T) =>
  addTenantFilter(req, where) as T & { tenant_id?: string };

// Push é best-effort: uma intervenção administrativa não pode falhar porque a
// notificação falhou.
function enviarPush(usuarioId: string | null | undefined, mensagem: Aviso) {
  if (!usuarioId) return;
  try {
    void enviarParaUsuario(usuarioId, mensagem);
  } catch (erro) {
    console.error('⚠️  [ADMIN] Push falhou (ignorado):', erro instanceof Error ? erro.message : String(erro));
  }
}

/** O que a intervenção precisa saber do atendimento para avisar as partes. */
type PartesDoAtendimento = {
  id: string;
  tutor_id: string | null;
  veterinario: { usuario_id: string } | null;
};

function avisarPartesDoAtendimento(
  req: Request,
  solicitacao: PartesDoAtendimento,
  { evento, dados, pushTutor, pushVet }: { evento: string; dados: unknown; pushTutor?: Aviso; pushVet?: Aviso }
) {
  const io = req.app.get('io');
  if (io) {
    io.to(`atendimento:${solicitacao.id}`).emit(evento, dados);
    if (solicitacao.tutor_id) io.to(`user:${solicitacao.tutor_id}`).emit(evento, dados);
    if (solicitacao.veterinario?.usuario_id) {
      io.to(`user:${solicitacao.veterinario.usuario_id}`).emit(evento, dados);
    }
    io.to(`tenant:${req.tenantId}:veterinarios`).emit('solicitacao:indisponivel', { solicitacaoId: solicitacao.id });
  }

  if (pushTutor) enviarPush(solicitacao.tutor_id, pushTutor);
  if (pushVet) enviarPush(solicitacao.veterinario?.usuario_id, pushVet);
}

/** Corpos das intervenções; as rotas não validam com Zod. */
type IntervencaoBody = { motivo?: string; veterinarioId?: string };

// Campos seguros de usuário (nunca inclui a senha)
const USUARIO_SAFE_SELECT = {
  id: true,
  nome: true,
  email: true,
  telefone: true,
  tipo_usuario: true,
  foto_perfil: true,
  cidade: true,
  criado_em: true
};

class AdminController {
  // Dashboard com estatísticas
  dashboard = asyncHandler(async (req: Request, res: Response) => {
    const tenant = <T extends Record<string, unknown>>(where?: T) => escopoDoTenant(req, where);
    const [
      totalUsuarios,
      totalTutores,
      totalVeterinarios,
      vetsPendentes,
      vetsOnline,
      totalAtendimentos,
      atendimentosHoje,
      atendimentosFinalizados,
      atendimentosEmAndamento,
      totalAvaliacoes,
      mediaAvaliacoes
    ] = await Promise.all([
      prisma.usuario.count({ where: tenant() }),
      prisma.usuario.count({ where: tenant<Prisma.UsuarioWhereInput>({ tipo_usuario: 'tutor' }) }),
      prisma.usuario.count({ where: tenant<Prisma.UsuarioWhereInput>({ tipo_usuario: 'veterinario' }) }),
      prisma.veterinario.count({ where: tenant({ aprovado_admin: false }) }),
      prisma.veterinario.count({ where: tenant({ online: true }) }),
      prisma.solicitacao.count({ where: tenant() }),
      prisma.solicitacao.count({
        where: tenant({
          criado_em: {
            gte: new Date(new Date().setHours(0, 0, 0, 0))
          }
        })
      }),
      prisma.solicitacao.count({ where: tenant<Prisma.SolicitacaoWhereInput>({ status: { in: ['finalizado', 'concluido'] } }) }),
      prisma.solicitacao.count({
        where: tenant<Prisma.SolicitacaoWhereInput>({
          status: { in: ['procurando_veterinario', 'veterinario_encontrado', 'a_caminho', 'chegou', 'atendimento_em_andamento'] }
        })
      }),
      // Só a direção tutor → veterinário: a nota que o profissional dá ao
      // tutor é outra coisa, e misturar as duas produziria uma média que não
      // significa nada.
      prisma.avaliacao.count({ where: tenant<Prisma.AvaliacaoWhereInput>({ autor_papel: 'tutor' }) }),
      prisma.avaliacao.aggregate({ where: tenant<Prisma.AvaliacaoWhereInput>({ autor_papel: 'tutor' }), _avg: { nota: true } })
    ]);

    const stats = {
      usuarios: {
        total: totalUsuarios,
        tutores: totalTutores,
        veterinarios: totalVeterinarios,
        veterinarios_pendentes: vetsPendentes
      },
      veterinarios: {
        online: vetsOnline
      },
      atendimentos: {
        total: totalAtendimentos,
        hoje: atendimentosHoje,
        finalizados: atendimentosFinalizados,
        em_andamento: atendimentosEmAndamento
      },
      avaliacoes: {
        total: totalAvaliacoes,
        media_geral: mediaAvaliacoes._avg.nota
          ? Number(mediaAvaliacoes._avg.nota.toFixed(1))
          : 0
      }
    };

    return res.json(stats);
  });

  // Listar todos os usuários
  listarUsuarios = asyncHandler(async (req: Request, res: Response) => {
    const { tipo } = req.query;

    // O filtro vai como veio da query; valor fora do enum o Prisma recusa.
    const where = escopoDoTenant<Prisma.UsuarioWhereInput>(req, tipo ? { tipo_usuario: String(tipo) as TipoUsuario } : {});

    const usuarios = await prisma.usuario.findMany({
      where,
      select: {
        id: true,
        nome: true,
        email: true,
        telefone: true,
        tipo_usuario: true,
        cidade: true,
        criado_em: true,
        foto_perfil: true
      },
      orderBy: { criado_em: 'desc' }
    });

    return res.json(usuarios);
  });





  // Listar todos os atendimentos
  listarAtendimentos = asyncHandler(async (req: Request, res: Response) => {
    const { status } = req.query;

    // "Finalizados" filtrava só `finalizado` e perdia os `concluido` — que o
    // próprio dashboard conta como finalizados. Os dois estados são o mesmo
    // desfecho para quem olha a operação.
    // O status vai como veio da query; valor fora do enum o Prisma recusa.
    const filtroDeStatus: Prisma.SolicitacaoWhereInput = status === 'finalizado'
      ? { status: { in: ['finalizado', 'concluido'] } }
      : (status ? { status: String(status) as StatusAtendimento } : {});

    const where = escopoDoTenant(req, filtroDeStatus);

    const atendimentos = await prisma.solicitacao.findMany({
      where,
      include: {
        tutor: {
          select: {
            id: true,
            nome: true,
            email: true,
            telefone: true
          }
        },
        veterinario: {
          include: {
            usuario: {
              select: {
                id: true,
                nome: true,
                email: true
              }
            }
          }
        },
        pet: true,
        // A tela tem um bloco de estrelas + comentário do tutor que nunca
        // aparecia: o `include` não trazia a avaliação, então era código morto.
        // Só a do tutor sobre o veterinário: é a que a tela mostra. A do
        // veterinário sobre o tutor é outra direção e não cabe neste bloco.
        avaliacoes: {
          where: { autor_papel: 'tutor' },
          take: 1,
          select: { id: true, nota: true, comentario: true, criado_em: true }
        }
      },
      orderBy: { criado_em: 'desc' },
      take: 100
    });

    return res.json(atendimentos.map(comAvaliacaoDoTutor));
  });

  // ═══════════════════════════════════════════════════════
  // INTERVENÇÃO NUM ATENDIMENTO TRAVADO
  //
  // Um chamado preso em `procurando_veterinario` — porque não havia ninguém
  // online na praça, ou porque o vet aceitou e sumiu — não tinha NENHUMA saída
  // pelo painel: o admin via o problema na tela de operações e não podia fazer
  // nada. Cancelar exigia mexer no banco, e o tutor ficava travado, porque o
  // sistema recusa nova solicitação enquanto houver uma ativa.
  // ═══════════════════════════════════════════════════════

  /**
   * Cancelar um atendimento pela administração
   * POST /api/v1/admin/solicitacoes/:id/cancelar
   */
  cancelarAtendimento = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { motivo }: IntervencaoBody = req.body || {};

    if (!motivo || String(motivo).trim().length < 5) {
      throw new ValidationError('Explique o motivo — ele fica na trilha e é o que o tutor lê.');
    }

    const solicitacao = await prisma.solicitacao.findFirst({
      where: { id, tenant_id: req.tenantId as string },
      include: { veterinario: { select: { usuario_id: true } } }
    });

    if (!solicitacao) {
      throw new NotFoundError('Atendimento não encontrado');
    }

    if (ENCERRADOS.includes(solicitacao.status)) {
      throw new ConflictError('Este atendimento já está encerrado.');
    }

    const atualizada = await transicionar({
      id,
      tenantId: String(req.tenantId),
      para: 'cancelado_admin',
      ator: { id: req.userId, tipo: 'admin' },
      origem: 'painel_admin',
      dados: { motivo_cancelamento: String(motivo).trim() },
      observacao: String(motivo).trim()
    });

    await AuditService.logForensicEvent({
      req,
      tenantId: req.tenantId,
      entityType: 'atendimento',
      entityId: id,
      action: 'admin.atendimento_cancelado',
      estadoAnterior: { status: solicitacao.status },
      estadoPosterior: { status: 'cancelado_admin' },
      motivo: String(motivo).trim()
    });

    avisarPartesDoAtendimento(req, solicitacao, {
      evento: 'atendimento:cancelado',
      dados: { solicitacaoId: id, por: 'admin', motivo: String(motivo).trim() },
      pushTutor: {
        title: 'Seu atendimento foi cancelado',
        body: `${String(motivo).trim()} — você já pode abrir um novo chamado.`,
        url: '/tutor/home'
      },
      pushVet: {
        title: 'Atendimento cancelado pela administração',
        body: String(motivo).trim(),
        url: '/veterinario/home'
      }
    });

    return res.json({ success: true, solicitacao: atualizada });
  });

  /**
   * Devolver o chamado para a fila ou entregá-lo a outro veterinário
   * POST /api/v1/admin/solicitacoes/:id/reatribuir
   */
  reatribuirAtendimento = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { veterinarioId, motivo }: IntervencaoBody = req.body || {};

    const solicitacao = await prisma.solicitacao.findFirst({
      where: { id, tenant_id: req.tenantId as string },
      include: { veterinario: { select: { usuario_id: true } } }
    });

    if (!solicitacao) {
      throw new NotFoundError('Atendimento não encontrado');
    }

    if (ENCERRADOS.includes(solicitacao.status)) {
      throw new ConflictError('Este atendimento já está encerrado.');
    }

    // Depois que o atendimento começou, trocar o profissional no meio do
    // caminho não é intervenção administrativa — é decisão clínica.
    if (['atendimento_em_andamento', 'chegou'].includes(solicitacao.status)) {
      throw new ConflictError('O atendimento já começou. Encerre pelo prontuário ou cancele.');
    }

    let veterinarioNovo = null;
    if (veterinarioId) {
      veterinarioNovo = await prisma.veterinario.findFirst({
        where: {
          id: veterinarioId,
          tenant_id: req.tenantId as string,
          aprovado_admin: true,
          status_credenciamento: 'APPROVED'
        },
        include: { usuario: { select: { id: true, nome: true } } }
      });

      if (!veterinarioNovo) {
        throw new ValidationError('Veterinário não encontrado ou não credenciado.');
      }
    }

    const atualizada = await transicionar({
      id,
      tenantId: String(req.tenantId),
      // Sem veterinário indicado, o chamado volta para a fila e o despacho
      // normal recomeça. Com veterinário, ele entra como atribuído e o
      // profissional decide se aceita.
      para: veterinarioNovo ? 'veterinario_encontrado' : 'procurando_veterinario',
      ator: { id: req.userId, tipo: 'admin' },
      origem: 'painel_admin',
      dados: { veterinario_id: veterinarioNovo ? veterinarioNovo.id : null },
      observacao: motivo?.trim()
        || (veterinarioNovo ? `Reatribuído pela administração a ${veterinarioNovo.usuario?.nome}` : 'Devolvido à fila pela administração')
    });

    await AuditService.logForensicEvent({
      req,
      tenantId: req.tenantId,
      entityType: 'atendimento',
      entityId: id,
      action: 'admin.atendimento_reatribuido',
      estadoAnterior: { status: solicitacao.status, veterinario_id: solicitacao.veterinario_id },
      estadoPosterior: { status: atualizada.status, veterinario_id: veterinarioNovo?.id || null },
      motivo: motivo?.trim() || null
    });

    const io = req.app.get('io');
    if (io) {
      io.to(`atendimento:${id}`).emit('atendimento:atualizado', { solicitacaoId: id, status: atualizada.status });

      // O veterinário anterior precisa saber que o chamado saiu das mãos dele.
      if (solicitacao.veterinario?.usuario_id) {
        io.to(`user:${solicitacao.veterinario.usuario_id}`).emit('atendimento:cancelado', {
          solicitacaoId: id, por: 'admin', motivo: 'Chamado reatribuído pela administração'
        });
      }

      if (veterinarioNovo?.usuario?.id) {
        io.to(`user:${veterinarioNovo.usuario.id}`).emit('solicitacao:recebida', atualizada);
      } else {
        io.to(`tenant:${req.tenantId}:veterinarios`).emit('solicitacao:nova', atualizada);
      }
    }

    if (veterinarioNovo?.usuario?.id) {
      enviarPush(veterinarioNovo.usuario.id, {
        title: 'Novo chamado atribuído a você',
        body: 'A administração encaminhou um atendimento para você. Abra o app para aceitar.',
        url: '/veterinario/home'
      });
    }

    return res.json({ success: true, solicitacao: atualizada });
  });

  /**
   * Veterinários credenciados, para escolher na reatribuição
   * GET /api/v1/admin/veterinarios-disponiveis
   */
  listarVeterinariosCredenciados = asyncHandler(async (req: Request, res: Response) => {
    const veterinarios = await prisma.veterinario.findMany({
      where: {
        tenant_id: req.tenantId as string,
        aprovado_admin: true,
        status_credenciamento: 'APPROVED'
      },
      select: {
        id: true,
        crmv: true,
        especialidade: true,
        online: true,
        usuario: { select: { nome: true, cidade: true } }
      },
      orderBy: [{ online: 'desc' }]
    });

    return res.json({ veterinarios });
  });

  // Deletar usuário
  deletarUsuario = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    const usuario = await prisma.usuario.findFirst({
      where: escopoDoTenant(req, { id })
    });

    if (!usuario) {
      throw new NotFoundError('Usuário não encontrado');
    }

    if (usuario.tipo_usuario === 'admin' || usuario.tipo_usuario === 'super_admin' || usuario.id === req.userId) {
      throw new ForbiddenError('Não é possível deletar administrador');
    }

    await prisma.usuario.delete({
      where: { id }
    });

    return res.json({ message: 'Usuário removido com sucesso' });
  });
}

const adminController = new AdminController();

module.exports = adminController;
export default adminController;
