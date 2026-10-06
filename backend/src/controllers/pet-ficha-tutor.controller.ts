import type { Request, Response } from 'express';
import prisma from '../config/database';
import AuditService from '../services/audit.service';
import { NotFoundError, asyncHandler } from '../middleware/error.middleware';

/**
 * Ficha de saúde do pet escrita pelo TUTOR: alergias, medicamentos e vacinas.
 *
 * Isolamento: todo acesso passa por `petDoTutor`, que procura o pet pelo par
 * (tenant, tutor autenticado). Pet de outro tutor devolve 404 — não
 * confirmamos que o id existe.
 *
 * Remoção é lógica (`ativo = false`), igual à do veterinário: o registro sai
 * das leituras e guarda quem removeu e quando. Dado clínico não se apaga.
 */

type Registro = Record<string, unknown> & { id: string };

/** O que os três modelos têm em comum, para o controller tratá-los por um só caminho. */
interface ModeloDeFicha {
  create(args: { data: Record<string, unknown> }): Promise<Registro>;
  findFirst(args: { where: Record<string, unknown> }): Promise<Registro | null>;
  update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<Registro>;
}

interface Tipo {
  modelo: 'petAlergia' | 'petMedicamento' | 'petVacina';
  entityType: string;
  rotulo: string;
  naoEncontrado: string;
}

const TIPOS: Record<'alergia' | 'medicamento' | 'vacina', Tipo> = {
  alergia: { modelo: 'petAlergia', entityType: 'pet_alergia', rotulo: 'Alergia', naoEncontrado: 'Alergia não encontrada' },
  medicamento: { modelo: 'petMedicamento', entityType: 'pet_medicamento', rotulo: 'Medicamento', naoEncontrado: 'Medicamento não encontrado' },
  vacina: { modelo: 'petVacina', entityType: 'pet_vacina', rotulo: 'Vacina', naoEncontrado: 'Vacina não encontrada' }
};

const modeloDe = (tipo: Tipo): ModeloDeFicha => (prisma as unknown as Record<string, ModeloDeFicha>)[tipo.modelo];

async function petDoTutor(req: Request): Promise<{ id: string; nome: string }> {
  const pet = await prisma.pet.findFirst({
    where: { id: req.params.id, tenant_id: req.tenantId as string, tutor_id: req.userId as string },
    select: { id: true, nome: true }
  });
  if (!pet) {
    throw new NotFoundError('Pet não encontrado');
  }
  return pet;
}

function limpar(dados: Record<string, unknown>): Record<string, unknown> {
  const saida: Record<string, unknown> = {};
  for (const [chave, valor] of Object.entries(dados)) {
    saida[chave] = valor === '' ? null : valor;
  }
  return saida;
}

const snapshot = (registro: unknown): unknown => JSON.parse(JSON.stringify(registro));

async function criar(tipo: Tipo, req: Request, res: Response): Promise<Response> {
  const pet = await petDoTutor(req);
  const dados = limpar(req.body);

  if (tipo === TIPOS.medicamento && !dados.data_inicio) {
    dados.data_inicio = new Date();
  }

  const registro = await modeloDe(tipo).create({
    data: { ...dados, tenant_id: req.tenantId, pet_id: pet.id }
  });

  await AuditService.logForensicEvent({
    req,
    entityType: tipo.entityType,
    entityId: registro.id,
    action: 'ficha_pet.registro_declarado_pelo_tutor',
    estadoPosterior: snapshot(registro),
    motivo: `${tipo.rotulo} declarada pelo tutor no cadastro do pet`,
    detalhes: { pet_id: pet.id }
  }).catch(() => {});

  return res.status(201).json({ registro });
}

async function remover(tipo: Tipo, req: Request, res: Response): Promise<Response> {
  const pet = await petDoTutor(req);

  const anterior = await modeloDe(tipo).findFirst({
    where: { id: req.params.registroId, tenant_id: req.tenantId, pet_id: pet.id, ativo: true }
  });
  if (!anterior) {
    throw new NotFoundError(tipo.naoEncontrado);
  }

  const removido = await modeloDe(tipo).update({
    where: { id: anterior.id },
    data: {
      ativo: false,
      removido_em: new Date(),
      removido_por: req.userId,
      motivo_remocao: 'Removido pelo tutor'
    }
  });

  await AuditService.logForensicEvent({
    req,
    entityType: tipo.entityType,
    entityId: anterior.id,
    action: 'ficha_pet.registro_removido_pelo_tutor',
    estadoAnterior: snapshot(anterior),
    estadoPosterior: snapshot(removido),
    motivo: `${tipo.rotulo} removida pelo tutor`,
    detalhes: { pet_id: pet.id }
  }).catch(() => {});

  return res.json({ registro: removido });
}

class PetFichaTutorController {
  listar = asyncHandler(async (req, res) => {
    const pet = await petDoTutor(req);
    const where = { tenant_id: req.tenantId as string, pet_id: pet.id, ativo: true };
    const [alergias, medicamentos, vacinas] = await Promise.all([
      prisma.petAlergia.findMany({ where, orderBy: { criado_em: 'desc' } }),
      prisma.petMedicamento.findMany({ where, orderBy: { data_inicio: 'desc' } }),
      prisma.petVacina.findMany({ where, orderBy: { data_aplicacao: 'desc' } })
    ]);
    return res.json({ alergias, medicamentos, vacinas });
  });

  criarAlergia = asyncHandler((req, res) => criar(TIPOS.alergia, req, res));
  removerAlergia = asyncHandler((req, res) => remover(TIPOS.alergia, req, res));

  criarMedicamento = asyncHandler((req, res) => criar(TIPOS.medicamento, req, res));
  removerMedicamento = asyncHandler((req, res) => remover(TIPOS.medicamento, req, res));

  criarVacina = asyncHandler((req, res) => criar(TIPOS.vacina, req, res));
  removerVacina = asyncHandler((req, res) => remover(TIPOS.vacina, req, res));
}

const controller = new PetFichaTutorController();

export = controller;
