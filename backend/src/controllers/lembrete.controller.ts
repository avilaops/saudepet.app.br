import { hojeComoDiaDeCalendario } from '../utils/datas';
import type { z } from 'zod';
import prisma from '../config/database';
import { NotFoundError, asyncHandler } from '../middleware/error.middleware';
import type { createLembreteSchema, concluirLembreteSchema } from '../schemas/lembrete.schema';

// O corpo já passou pelo `validate(...)` da rota: é o que o Zod devolveu.
type CriarLembreteBody = z.infer<typeof createLembreteSchema>;
type ConcluirLembreteBody = z.infer<typeof concluirLembreteSchema>;

const PET_RESUMO_SELECT = {
  id: true,
  nome: true,
  especie: true,
  tipo: true,
  foto: true
} as const;

/**
 * Lembretes do pet, do lado do tutor.
 *
 * O veterinário já escrevia aqui no fechamento do atendimento (retorno sugerido e
 * reforço de vacina), mas o tutor não tinha por onde ler — o lembrete existia no
 * banco e não chegava a ninguém. Estas rotas são a leitura e a conclusão dele,
 * mais os lembretes que o próprio tutor cria.
 */
class LembreteController {
  listar = asyncHandler(async (req, res) => {
    const tutorId = req.userId;
    const incluirConcluidos = ['1', 'true'].includes(String(req.query.concluidos));

    const lembretes = await prisma.lembretePet.findMany({
      where: {
        tenant_id: req.tenantId as string,
        tutor_id: tutorId,
        ...(incluirConcluidos ? {} : { concluido: false })
      },
      include: { pet: { select: PET_RESUMO_SELECT } },
      orderBy: [{ concluido: 'asc' }, { data_lembrete: 'asc' }]
    });

    // O corte é por dia, não por hora: um lembrete marcado para hoje de manhã não
    // vira "atrasado" à tarde.
    // `data_lembrete` é dia de calendário (meia-noite UTC): "hoje" precisa ser
    // o dia que o Brasil está vivendo, na mesma régua. Com o relógio do
    // servidor, depois das 21h o lembrete de hoje já contava como atrasado.
    const hoje = hojeComoDiaDeCalendario();

    const pendentes = lembretes.filter((item) => !item.concluido);

    return res.json({
      lembretes,
      resumo: {
        atrasados: pendentes.filter((item) => item.data_lembrete < hoje).length,
        pendentes: pendentes.length
      }
    });
  });

  criar = asyncHandler(async (req, res) => {
    const tutorId = req.userId as string;
    const { pet_id, titulo, tipo, data_lembrete } = req.body as CriarLembreteBody;

    const pet = await prisma.pet.findFirst({
      where: { id: pet_id, tenant_id: req.tenantId as string, tutor_id: tutorId }
    });

    if (!pet) {
      throw new NotFoundError('Pet não encontrado');
    }

    const lembrete = await prisma.lembretePet.create({
      data: {
        tenant_id: req.tenantId as string,
        tutor_id: tutorId,
        pet_id,
        titulo,
        tipo,
        data_lembrete
      },
      include: { pet: { select: PET_RESUMO_SELECT } }
    });

    return res.status(201).json({ lembrete });
  });

  concluir = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { concluido } = req.body as ConcluirLembreteBody;

    const lembrete = await prisma.lembretePet.findFirst({
      where: { id, tenant_id: req.tenantId as string, tutor_id: req.userId }
    });

    if (!lembrete) {
      throw new NotFoundError('Lembrete não encontrado');
    }

    const atualizado = await prisma.lembretePet.update({
      where: { id },
      data: {
        concluido,
        // Reabrir devolve o lembrete à fila de aviso: se a data ainda estiver por
        // vir, o worker volta a notificar.
        ...(concluido ? {} : { notificado: false })
      },
      include: { pet: { select: PET_RESUMO_SELECT } }
    });

    return res.json({ lembrete: atualizado });
  });
}

const controller = new LembreteController();

module.exports = controller;
export default controller;
