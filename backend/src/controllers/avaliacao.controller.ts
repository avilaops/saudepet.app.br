import type { Avaliacao, Solicitacao } from '@prisma/client';
import type { z } from 'zod';
import prisma from '../config/database';
import {
  NotFoundError,
  ValidationError,
  ConflictError,
  ForbiddenError,
  asyncHandler
} from '../middleware/error.middleware';
import { destinatariosAdmin } from '../services/notificacao-admin.service';
import emailService from '../services/email.service';
import type { createAvaliacaoSchema } from '../schemas/avaliacao.schema';

// O corpo já passou pelo `validate(...)` da rota: é o que o Zod devolveu.
type CriarAvaliacaoBody = z.infer<typeof createAvaliacaoSchema>;

class AvaliacaoController {
  // Criar avaliação
  criar = asyncHandler(async (req, res) => {
    console.log('🔵 [AVALIACAO] Criando');
    const { atendimento_id, solicitacao_id, nota, comentario } = req.body as CriarAvaliacaoBody;
    const tutorId = req.userId as string;
    const atendimentoId = (atendimento_id || solicitacao_id) as string;

    // Verificar atendimento
    const atendimento = await prisma.solicitacao.findFirst({
      where: { id: atendimentoId, tenant_id: req.tenantId as string },
      include: { veterinario: true }
    });

    if (!atendimento) {
      throw new NotFoundError('Atendimento não encontrado');
    }

    if (atendimento.tutor_id !== tutorId) {
      throw new ForbiddenError('Sem permissão');
    }

    if (atendimento.status !== 'concluido' && atendimento.status !== 'finalizado') {
      throw new ValidationError('Apenas atendimentos finalizados podem ser avaliados');
    }

    // Uma por lado: a avaliação do veterinário sobre o tutor é outra linha, e
    // não pode impedir o tutor de avaliar (nem o contrário).
    const avaliacaoExiste = await prisma.avaliacao.findUnique({
      where: { atendimento_id_autor_papel: { atendimento_id: atendimentoId, autor_papel: 'tutor' } }
    });

    if (avaliacaoExiste) {
      throw new ConflictError('Atendimento já foi avaliado');
    }

    // `Solicitacao.veterinario_id` é opcional no schema, mas um atendimento
    // concluído sempre tem veterinário — o tipo aqui só registra essa premissa.
    const veterinarioId = atendimento.veterinario_id as string;

    // Criar avaliação
    const avaliacao = await prisma.avaliacao.create({
      data: {
        tenant_id: atendimento.tenant_id,
        atendimento_id: atendimentoId,
        tutor_id: tutorId,
        veterinario_id: veterinarioId,
        autor_papel: 'tutor',
        nota,
        comentario
      }
    });

    // Atualizar média do veterinário
    // Só as notas que o veterinário RECEBEU. Sem este filtro, as que ele deu a
    // tutores entrariam na própria média — e a reputação dele passaria a
    // depender de quanto ele gosta dos clientes.
    const todasAvaliacoes = await prisma.avaliacao.findMany({
      where: {
        tenant_id: req.tenantId as string,
        autor_papel: 'tutor',
        atendimento: {
          veterinario_id: veterinarioId
        }
      }
    });

    const media = todasAvaliacoes.reduce((acc, av) => acc + av.nota, 0) / todasAvaliacoes.length;

    await prisma.veterinario.update({
      where: { id: veterinarioId },
      data: {
        avaliacao_media: media
        // `total_atendimentos: { increment: 1 }` estava aqui: cada AVALIAÇÃO
        // somava um ATENDIMENTO ao contador do veterinário. Como só parte dos
        // tutores avalia, o número não era nem o total de atendimentos nem o
        // total de avaliações — era um terceiro número sem significado, exibido
        // no perfil dele e para os tutores. Quem conta atendimento é o
        // fechamento do atendimento, não quem dá estrela.
      }
    });

    // Nota baixa é o sinal mais barato de um problema sério — e o e-mail de
    // alerta existia pronto (`enviarEmailAlertaNpsRuimAdmin`), com template e
    // tudo, sem NENHUM arquivo do backend chamando. Uma avaliação de 1 ou 2
    // estrelas só era descoberta se alguém abrisse a tela de avaliações.
    if (Number(nota) <= 2) {
      void avisarQualidade({ avaliacao, atendimento, nota, comentario, tenantId: atendimento.tenant_id });
    }

    console.log('✅ [AVALIACAO] Criada:', avaliacao.id);

    return res.status(201).json({ avaliacao });
  });

  // Listar avaliações de um veterinário
  listarPorVeterinario = asyncHandler(async (req, res) => {
    const { veterinarioId } = req.params;
    const veterinario_id = req.query.veterinario_id as string | undefined;
    const vetId = veterinarioId || veterinario_id;

    const avaliacoes = await prisma.avaliacao.findMany({
      where: {
        tenant_id: req.tenantId as string,
        veterinario_id: vetId,
        // O perfil público do veterinário mostra o que os tutores disseram
        // dele, não o que ele disse dos tutores.
        autor_papel: 'tutor'
      },
      include: {
        atendimento: {
          include: {
            tutor: {
              select: {
                id: true,
                nome: true,
                foto_perfil: true
              }
            }
          }
        },
        tutor: {
          select: {
            id: true,
            nome: true,
            foto_perfil: true
          }
        }
      },
      orderBy: { criado_em: 'desc' }
    });

    return res.json({ avaliacoes });
  });

  // Buscar avaliação por ID
  buscarPorId = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const avaliacao = await prisma.avaliacao.findFirst({
      where: { id, tenant_id: req.tenantId as string },
      include: {
        atendimento: {
          include: {
            tutor: {
              select: {
                id: true,
                nome: true,
                foto_perfil: true
              }
            },
            veterinario: {
              include: {
                usuario: {
                  select: {
                    id: true,
                    nome: true,
                    foto_perfil: true
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!avaliacao) {
      throw new NotFoundError('Avaliação não encontrada');
    }

    return res.json(avaliacao);
  });
}


/**
 * Aviso de qualidade. Best-effort: a avaliação do tutor não pode falhar porque
 * o e-mail para a equipe falhou.
 */
async function avisarQualidade({ avaliacao, atendimento, nota, comentario, tenantId }: {
  avaliacao: Avaliacao;
  atendimento: Solicitacao;
  nota: number;
  comentario?: string | null;
  tenantId: string;
}): Promise<void> {
  try {
    const destinatarios = await destinatariosAdmin(tenantId);
    if (destinatarios.length === 0) return;

    const [tutor, veterinario] = await Promise.all([
      prisma.usuario.findUnique({ where: { id: avaliacao.tutor_id }, select: { nome: true } }),
      prisma.veterinario.findUnique({
        where: { id: atendimento.veterinario_id as string },
        select: { usuario: { select: { nome: true } } }
      })
    ]);

    await emailService.enviarEmailAlertaNpsRuimAdmin(destinatarios.join(','), {
      protocolo: String(atendimento.id).slice(0, 8).toUpperCase(),
      nota: Number(nota),
      comentario: comentario || null,
      nomeTutor: tutor?.nome || 'Tutor',
      nomeVet: veterinario?.usuario?.nome || 'Veterinário',
      adminUrl: `https://saudepet.app.br/admin/atendimentos/${atendimento.id}/auditoria`
    });
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    console.error('⚠️  [AVALIACAO] Alerta de qualidade falhou (ignorado):', mensagem);
  }
}

const controller = new AvaliacaoController();

module.exports = controller;
export default controller;
