import prisma from '../config/database';
import { ValidationError, NotFoundError } from '../middleware/error.middleware';

/**
 * Retenção: o veterinário chamando de volta a própria clientela.
 *
 * O `LembretePet` já existia e o worker já mandava e-mail, mas a tabela não
 * guardava QUEM pediu o retorno — o e-mail saía assinado com a string literal
 * "veterinário responsável", e o tutor não tinha como saber quem o chamou. E
 * não havia nenhum caminho para o vet criar um lembrete deliberadamente: os
 * únicos existentes nasciam como efeito colateral do fechamento de um
 * atendimento.
 *
 * Com `veterinario_id` e `mensagem` na tabela, o lembrete passa a ser uma
 * ferramenta de retenção, não só um despertador do tutor.
 */

export const TIPOS_VALIDOS = ['vacina', 'medicamento', 'retorno', 'higienizacao', 'checkup'];

export interface ClientesInativosParams {
  tenantId: string;
  veterinarioId: string;
  diasSemContato?: number | string;
  limite?: number | string;
}

export interface CriarLembreteParams {
  tenantId: string;
  veterinarioId: string;
  tutorId: string;
  petId: string;
  titulo: string;
  tipo: string;
  dataLembrete: string | number | Date;
  mensagem?: string | null;
}

/** Um destinatário da convocação em lote: o tutor e o pet dele. */
export interface AlvoDaConvocacao {
  tutor_id: string;
  pet_id: string;
}

export interface ConvocarEmLoteParams {
  tenantId: string;
  veterinarioId: string;
  alvos: AlvoDaConvocacao[];
  titulo: string;
  tipo: string;
  dataLembrete: string | number | Date;
  mensagem?: string | null;
}

/**
 * Clientes que sumiram: sem atendimento há mais de `diasSemContato`.
 *
 * É a lista de trabalho da retenção — quem já confiou no profissional uma vez
 * e não voltou. Bem mais barato de reconquistar do que cliente novo.
 */
export async function clientesInativos({
  tenantId,
  veterinarioId,
  diasSemContato = 180,
  limite = 50
}: ClientesInativosParams) {
  const dias = Math.min(Math.max(Number(diasSemContato) || 180, 7), 3650);
  const corte = new Date(Date.now() - dias * 86400000);

  const fichas = await prisma.clienteVeterinario.findMany({
    where: {
      tenant_id: tenantId,
      veterinario_id: veterinarioId,
      ultimo_atendimento: { not: null, lte: corte }
    },
    orderBy: { ultimo_atendimento: 'asc' },
    take: Math.min(Math.max(Number(limite) || 50, 1), 200),
    include: {
      tutor: {
        select: {
          id: true,
          nome: true,
          email: true,
          telefone: true,
          pets: { select: { id: true, nome: true, tipo: true } }
        }
      }
    }
  });

  return fichas.map((f) => ({
    tutor: f.tutor,
    apelido: f.apelido,
    tags: f.tags,
    total_atendimentos: f.total_atendimentos,
    ultimo_atendimento: f.ultimo_atendimento,
    // O `where` acima exige `ultimo_atendimento` não nulo; o tipo do Prisma
    // não sabe disso, por isso a asserção. Ficha sem atendimento não chega aqui.
    dias_sem_atendimento: Math.floor(
      (Date.now() - new Date(f.ultimo_atendimento as Date).getTime()) / 86400000
    )
  }));
}

/**
 * Cria um lembrete de retorno para um pet de um cliente do veterinário.
 *
 * A checagem de posse é dupla: o pet tem de pertencer ao tutor, e o tutor tem
 * de ser cliente DESTE veterinário. Sem a segunda, qualquer vet aprovado
 * poderia criar lembrete para o cliente de outro — spam com a marca da
 * plataforma.
 */
export async function criarLembrete({
  tenantId,
  veterinarioId,
  tutorId,
  petId,
  titulo,
  tipo,
  dataLembrete,
  mensagem
}: CriarLembreteParams) {
  if (!TIPOS_VALIDOS.includes(tipo)) {
    throw new ValidationError(`Tipo inválido. Use um destes: ${TIPOS_VALIDOS.join(', ')}.`);
  }

  const data = new Date(dataLembrete);
  if (Number.isNaN(data.getTime())) {
    throw new ValidationError('Data do lembrete inválida.');
  }

  const ficha = await prisma.clienteVeterinario.findUnique({
    where: {
      veterinario_id_tutor_id: { veterinario_id: veterinarioId, tutor_id: tutorId }
    },
    select: { id: true, tenant_id: true }
  });

  if (!ficha || ficha.tenant_id !== tenantId) {
    throw new NotFoundError('Esse tutor não é seu cliente.');
  }

  const pet = await prisma.pet.findFirst({
    where: { id: petId, tutor_id: tutorId, tenant_id: tenantId },
    select: { id: true }
  });

  if (!pet) {
    throw new NotFoundError('Pet não encontrado para este tutor.');
  }

  return prisma.lembretePet.create({
    data: {
      tenant_id: tenantId,
      tutor_id: tutorId,
      pet_id: petId,
      veterinario_id: veterinarioId,
      titulo,
      tipo,
      data_lembrete: data,
      mensagem: mensagem || null
    },
    include: {
      pet: { select: { id: true, nome: true } }
    }
  });
}

/**
 * Lembretes que este veterinário criou, para ele acompanhar o que já disparou.
 */
export async function listarLembretesDoVet({
  tenantId,
  veterinarioId,
  incluirConcluidos = false
}: {
  tenantId: string;
  veterinarioId: string;
  incluirConcluidos?: boolean;
}) {
  return prisma.lembretePet.findMany({
    where: {
      tenant_id: tenantId,
      veterinario_id: veterinarioId,
      ...(incluirConcluidos ? {} : { concluido: false })
    },
    orderBy: { data_lembrete: 'asc' },
    take: 200,
    include: {
      pet: {
        select: {
          id: true,
          nome: true,
          tipo: true,
          tutor: { select: { id: true, nome: true, telefone: true } }
        }
      }
    }
  });
}

/**
 * Cria o mesmo lembrete para vários clientes de uma vez (convocação de
 * campanha: "vacinação anual", "check-up do idoso").
 *
 * Processa um por um em vez de `createMany` porque cada linha precisa das duas
 * checagens de posse — e porque um tutor inválido no meio da lista não pode
 * derrubar a convocação inteira. O retorno diz o que entrou e o que falhou.
 */
export async function convocarEmLote({
  tenantId,
  veterinarioId,
  alvos,
  titulo,
  tipo,
  dataLembrete,
  mensagem
}: ConvocarEmLoteParams) {
  // `alvos` vem do corpo da requisição: o tipo declara a forma esperada, a
  // checagem em tempo de execução é o que de fato a garante.
  if (!Array.isArray(alvos) || alvos.length === 0) {
    throw new ValidationError('Informe ao menos um cliente para convocar.');
  }
  if (alvos.length > 100) {
    throw new ValidationError('Convoque no máximo 100 clientes por vez.');
  }

  const criados: { tutor_id: string; pet_id: string; lembrete_id: string }[] = [];
  const falhas: { tutor_id: string; pet_id: string; motivo: string }[] = [];

  for (const alvo of alvos) {
    try {
      const lembrete = await criarLembrete({
        tenantId,
        veterinarioId,
        tutorId: alvo.tutor_id,
        petId: alvo.pet_id,
        titulo,
        tipo,
        dataLembrete,
        mensagem
      });
      criados.push({ tutor_id: alvo.tutor_id, pet_id: alvo.pet_id, lembrete_id: lembrete.id });
    } catch (erro: unknown) {
      falhas.push({
        tutor_id: alvo.tutor_id,
        pet_id: alvo.pet_id,
        motivo: (erro instanceof Error && erro.message) || 'Falha ao criar lembrete.'
      });
    }
  }

  return { criados: criados.length, falhas, detalhes: criados };
}

// Os controllers ainda são `.js` e fazem `require(...)`; `module.exports`
// mantém o contrato enquanto eles não migram.
module.exports = {
  clientesInativos,
  criarLembrete,
  listarLembretesDoVet,
  convocarEmLote,
  TIPOS_VALIDOS
};
