import prisma from '../config/database';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../middleware/error.middleware';

/**
 * O veterinário avalia o tutor.
 *
 * A confiança que o produto promete é bilateral, e o modelo só sabia uma
 * direção: `tutor_id` era sempre quem avaliava, `veterinario_id` sempre quem era
 * avaliado, e um atendimento comportava uma avaliação só. Não era tela
 * faltando — era o banco.
 *
 * Agora `autor_papel` diz quem escreveu, e cada atendimento comporta as duas.
 * A média do tutor fica gravada em `usuarios` porque o veterinário precisa dela
 * na FILA de chamados: calcular na leitura seria uma consulta a mais em cada
 * card, na tela que mais precisa ser rápida.
 *
 * O que ele avalia não é o animal — é a experiência de atender ali: se o
 * endereço estava certo, se alguém recebeu, se o pet estava contido, se as
 * informações batiam com o que encontrou.
 */

const STATUS_QUE_PERMITEM_AVALIAR = ['finalizado', 'concluido', 'encaminhado'];

export async function avaliarTutor({
  atendimentoId,
  tenantId,
  usuarioId,
  nota,
  comentario
}: {
  atendimentoId: string;
  tenantId: string;
  usuarioId: string;
  nota: number;
  comentario?: string;
}) {
  const valor = Number(nota);
  if (!Number.isInteger(valor) || valor < 1 || valor > 5) {
    throw new ValidationError('A nota vai de 1 a 5');
  }

  const atendimento = await prisma.solicitacao.findFirst({
    where: { id: atendimentoId, tenant_id: tenantId },
    select: {
      id: true,
      status: true,
      tutor_id: true,
      veterinario_id: true,
      veterinario: { select: { usuario_id: true } }
    }
  });

  if (!atendimento) throw new NotFoundError('Atendimento não encontrado');
  if (!atendimento.veterinario || atendimento.veterinario.usuario_id !== usuarioId) {
    throw new ForbiddenError('Você não atendeu este chamado');
  }
  if (!STATUS_QUE_PERMITEM_AVALIAR.includes(atendimento.status)) {
    throw new ConflictError('Só é possível avaliar depois de encerrar o atendimento');
  }

  const jaAvaliou = await prisma.avaliacao.findUnique({
    where: {
      atendimento_id_autor_papel: { atendimento_id: atendimentoId, autor_papel: 'veterinario' }
    },
    select: { id: true }
  });
  if (jaAvaliou) {
    throw new ConflictError('Você já avaliou este atendimento');
  }

  // A avaliação e a média do tutor na mesma transação: uma nota gravada sem
  // entrar na média seria uma reputação que não corresponde ao que está escrito.
  const [avaliacao] = await prisma.$transaction(async (tx) => {
    const criada = await tx.avaliacao.create({
      data: {
        tenant_id: tenantId,
        atendimento_id: atendimentoId,
        tutor_id: atendimento.tutor_id,
        veterinario_id: atendimento.veterinario_id!,
        autor_papel: 'veterinario',
        nota: valor,
        comentario: comentario?.trim() ? comentario.trim().slice(0, 1000) : null
      }
    });

    const resumo = await tx.avaliacao.aggregate({
      where: { tenant_id: tenantId, tutor_id: atendimento.tutor_id, autor_papel: 'veterinario' },
      _avg: { nota: true },
      _count: { _all: true }
    });

    await tx.usuario.update({
      where: { id: atendimento.tutor_id },
      data: {
        avaliacao_media: resumo._avg.nota,
        total_avaliacoes: resumo._count._all
      }
    });

    return [criada];
  });

  return avaliacao;
}

/**
 * O que já foi dito nas duas direções sobre um atendimento.
 *
 * Serve para a tela saber se ainda precisa perguntar — e para não perguntar
 * duas vezes a quem já respondeu.
 */
export async function avaliacoesDoAtendimento(atendimentoId: string, tenantId: string) {
  const avaliacoes = await prisma.avaliacao.findMany({
    where: { atendimento_id: atendimentoId, tenant_id: tenantId },
    select: { id: true, autor_papel: true, nota: true, comentario: true, criado_em: true }
  });

  return {
    do_tutor: avaliacoes.find((item) => item.autor_papel === 'tutor') || null,
    do_veterinario: avaliacoes.find((item) => item.autor_papel === 'veterinario') || null
  };
}

export { STATUS_QUE_PERMITEM_AVALIAR };
