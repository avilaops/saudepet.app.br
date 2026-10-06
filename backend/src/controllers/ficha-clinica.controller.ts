import type { Request, Response } from 'express';
import prisma from '../config/database';
import { NotFoundError, ForbiddenError, ValidationError, asyncHandler } from '../middleware/error.middleware';
import AuditService from '../services/audit.service';
import { veterinarioAtendeuOPet } from '../services/politica-acesso.service';

/**
 * Correção e remoção dos registros clínicos do pet (alergia, vacina, medicação).
 *
 * Até aqui esses três só nasciam no fechamento do atendimento e nunca mais
 * podiam ser tocados: uma vacina lançada no pet errado, uma alergia digitada por
 * engano ou uma dose trocada só saíam com UPDATE na mão no banco.
 *
 * Quem corrige é qualquer veterinário aprovado do mesmo tenant — o histórico
 * clínico é compartilhado dentro do tenant, e quem está com o animal agora é
 * quem vê o erro — ou o admin do tenant. A autorização de papel fica na rota; o
 * recorte por tenant fica aqui, em toda busca.
 *
 * Nada é apagado: a remoção é lógica (`ativo = false`) e exige motivo, porque a
 * linha continua no banco e alguém vai ler depois para entender por que sumiu da
 * ficha. Correção e remoção geram evento pericial em `audit_logs`, com estado
 * anterior e posterior.
 */

/** Uma linha de qualquer um dos três modelos, como o controller a enxerga. */
type Registro = Record<string, unknown> & { id: string };

/** O que os três modelos têm em comum, para o controller tratá-los por um só caminho. */
interface ModeloDeFicha {
  findFirst(args: { where: Record<string, unknown> }): Promise<Registro | null>;
  update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<Registro>;
}

interface Tipo {
  modelo: 'petAlergia' | 'petVacina' | 'petMedicamento';
  entityType: string;
  rotulo: string;
  naoEncontrado: string;
  conferirCoerencia?: (anterior: Registro, mudancas: Record<string, unknown>) => void;
}

// As datas dos registros chegam como `Date` (Zod coerce) ou já gravadas; o
// snapshot anterior pode trazê-las como texto ISO.
const comoData = (valor: unknown): Date => new Date(valor as string | number | Date);

// Cada tipo declara onde mora e como se chama na trilha de auditoria. É o que
// permite que os seis endpoints sejam o mesmo par de handlers.
const TIPOS: Record<'alergia' | 'vacina' | 'medicamento', Tipo> = {
  alergia: {
    modelo: 'petAlergia',
    entityType: 'PetAlergia',
    rotulo: 'Alergia',
    naoEncontrado: 'Alergia não encontrada na ficha deste pet'
  },
  vacina: {
    modelo: 'petVacina',
    entityType: 'PetVacina',
    rotulo: 'Vacina',
    naoEncontrado: 'Vacina não encontrada na ficha deste pet',
    // O Zod só compara as datas quando as duas vêm no mesmo PUT. Corrigir só a
    // aplicação, deixando o reforço antigo para trás, produziria uma vacina cujo
    // reforço vence antes de ser aplicada.
    conferirCoerencia: (anterior, mudancas) => {
      const aplicacao = mudancas.data_aplicacao ?? anterior.data_aplicacao;
      const proxima = mudancas.proxima_dose !== undefined ? mudancas.proxima_dose : anterior.proxima_dose;
      if (proxima && aplicacao && comoData(proxima) <= comoData(aplicacao)) {
        throw new ValidationError('A próxima dose precisa ser depois da aplicação');
      }
    }
  },
  medicamento: {
    modelo: 'petMedicamento',
    entityType: 'PetMedicamento',
    rotulo: 'Medicamento',
    naoEncontrado: 'Medicamento não encontrado na ficha deste pet',
    conferirCoerencia: (anterior, mudancas) => {
      const inicio = mudancas.data_inicio ?? anterior.data_inicio;
      const fim = mudancas.data_fim !== undefined ? mudancas.data_fim : anterior.data_fim;
      if (fim && inicio && comoData(fim) < comoData(inicio)) {
        throw new ValidationError('O término não pode ser antes do início');
      }
    }
  }
};

const modeloDe = (tipo: Tipo): ModeloDeFicha => (prisma as unknown as Record<string, ModeloDeFicha>)[tipo.modelo];

// `estado_anterior`/`estado_posterior` são colunas Json. Datas viram ISO aqui
// para o snapshot ficar legível e comparável anos depois, sem depender de como
// o driver serializaria um objeto Date.
function snapshot(registro: unknown): unknown {
  if (!registro) return null;
  return JSON.parse(JSON.stringify(registro));
}

/**
 * Busca o registro dentro do tenant autenticado e do pet da URL.
 *
 * O `tenant_id` vem sempre da identidade autenticada, nunca da requisição: um
 * veterinário de outro tenant não encontra o registro, e recebe 404 em vez de
 * 403 — não confirmamos a existência de ficha clínica alheia.
 */
async function buscarRegistroAtivo(
  tipo: Tipo,
  { tenantId, petId, id }: { tenantId: string | null | undefined; petId: string; id: string }
): Promise<Registro | null> {
  return modeloDe(tipo).findFirst({
    where: { id, tenant_id: tenantId, pet_id: petId, ativo: true }
  });
}

/**
 * Escopo do veterinário (v1.0): ele corrige a ficha só do pet que atendeu.
 *
 * Antes qualquer veterinário aprovado do tenant editava qualquer pet — bastava
 * conhecer o id. Admin continua vendo tudo; o profissional precisa de um
 * chamado ou consulta com aquele animal.
 */
async function garantirEscopoDoVeterinario(req: Request, petId: string): Promise<void> {
  if (req.userType === 'admin' || req.userType === 'super_admin') return;
  const atendeu = await veterinarioAtendeuOPet(prisma, {
    veterinarioId: req.user?.veterinario?.id,
    petId,
    tenantId: req.tenantId
  });
  if (!atendeu) {
    throw new ForbiddenError('Você só pode alterar a ficha de pets que atendeu');
  }
}

async function corrigir(tipo: Tipo, req: Request, res: Response): Promise<Response> {
  const { petId, id } = req.params;
  await garantirEscopoDoVeterinario(req, petId);

  const anterior = await buscarRegistroAtivo(tipo, { tenantId: req.tenantId, petId, id });
  if (!anterior) {
    throw new NotFoundError(tipo.naoEncontrado);
  }

  if (tipo.conferirCoerencia) {
    tipo.conferirCoerencia(anterior, req.body);
  }

  const atualizado = await modeloDe(tipo).update({
    where: { id },
    data: {
      ...req.body,
      atualizado_em: new Date(),
      atualizado_por: req.userId
    }
  });

  await AuditService.logForensicEvent({
    req,
    entityType: tipo.entityType,
    entityId: id,
    action: 'ficha_clinica.registro_corrigido',
    estadoAnterior: snapshot(anterior),
    estadoPosterior: snapshot(atualizado),
    motivo: `${tipo.rotulo} corrigida na ficha clínica do pet`,
    detalhes: { pet_id: petId, tipo: tipo.entityType, campos: Object.keys(req.body) }
  });

  return res.json({ registro: atualizado });
}

async function remover(tipo: Tipo, req: Request, res: Response): Promise<Response> {
  const { petId, id } = req.params;
  const { motivo } = req.body;
  await garantirEscopoDoVeterinario(req, petId);

  const anterior = await buscarRegistroAtivo(tipo, { tenantId: req.tenantId, petId, id });
  if (!anterior) {
    throw new NotFoundError(tipo.naoEncontrado);
  }

  // Exclusão lógica: a linha permanece, some das leituras e carrega quem
  // removeu, quando e por quê.
  const removido = await modeloDe(tipo).update({
    where: { id },
    data: {
      ativo: false,
      removido_em: new Date(),
      removido_por: req.userId,
      motivo_remocao: motivo
    }
  });

  await AuditService.logForensicEvent({
    req,
    entityType: tipo.entityType,
    entityId: id,
    action: 'ficha_clinica.registro_removido',
    estadoAnterior: snapshot(anterior),
    estadoPosterior: snapshot(removido),
    motivo,
    detalhes: { pet_id: petId, tipo: tipo.entityType }
  });

  return res.json({
    removido: true,
    registro: removido
  });
}

/**
 * Desfazer uma remoção.
 *
 * Remover é lógico desde sempre: a linha fica, some das leituras e carrega quem
 * removeu e por quê. Faltava o caminho de volta — reativar um registro tirado
 * por engano exigia acesso ao banco, e a informação estava toda em `audit_logs`
 * sem ninguém conseguir usá-la.
 *
 * Isso importa mais do que parece: uma alergia removida por engano é uma alergia
 * que não aparece na hora de medicar.
 */
async function restaurar(tipo: Tipo, req: Request, res: Response): Promise<Response> {
  const { petId, id } = req.params;
  const { motivo } = req.body;

  // Aqui a busca é pelo INATIVO: é justamente o que sumiu das leituras.
  const anterior = await modeloDe(tipo).findFirst({
    where: { id, tenant_id: req.tenantId, pet_id: petId, ativo: false }
  });

  if (!anterior) {
    throw new NotFoundError(`${tipo.rotulo} removida não encontrada`);
  }

  const restaurado = await modeloDe(tipo).update({
    where: { id },
    data: {
      ativo: true,
      // A marca da remoção sai: o registro volta a valer, e deixar o carimbo
      // faria a ficha dizer que ele está removido e ativo ao mesmo tempo.
      removido_em: null,
      removido_por: null,
      motivo_remocao: null,
      atualizado_em: new Date(),
      atualizado_por: req.userId
    }
  });

  // A trilha guarda as duas pontas: a remoção continua registrada, e a volta
  // também. Ninguém desfaz nada em silêncio numa ficha clínica.
  await AuditService.logForensicEvent({
    req,
    entityType: tipo.entityType,
    entityId: id,
    action: 'ficha_clinica.registro_restaurado',
    estadoAnterior: snapshot(anterior),
    estadoPosterior: snapshot(restaurado),
    motivo,
    detalhes: { pet_id: petId, tipo: tipo.entityType }
  });

  return res.json({ restaurado: true, registro: restaurado });
}

class FichaClinicaController {
  corrigirAlergia = asyncHandler((req, res) => corrigir(TIPOS.alergia, req, res));
  removerAlergia = asyncHandler((req, res) => remover(TIPOS.alergia, req, res));

  corrigirVacina = asyncHandler((req, res) => corrigir(TIPOS.vacina, req, res));
  removerVacina = asyncHandler((req, res) => remover(TIPOS.vacina, req, res));

  corrigirMedicamento = asyncHandler((req, res) => corrigir(TIPOS.medicamento, req, res));
  removerMedicamento = asyncHandler((req, res) => remover(TIPOS.medicamento, req, res));

  restaurarAlergia = asyncHandler((req, res) => restaurar(TIPOS.alergia, req, res));
  restaurarVacina = asyncHandler((req, res) => restaurar(TIPOS.vacina, req, res));
  restaurarMedicamento = asyncHandler((req, res) => restaurar(TIPOS.medicamento, req, res));

  /** O que foi removido desta ficha, para a tela poder oferecer o desfazer. */
  listarRemovidos = asyncHandler(async (req, res) => {
    const { petId } = req.params;
    await garantirEscopoDoVeterinario(req, petId);
    const where = { tenant_id: req.tenantId as string, pet_id: petId, ativo: false };
    const ordem = { removido_em: 'desc' } as const;

    const [alergias, vacinas, medicamentos] = await Promise.all([
      prisma.petAlergia.findMany({ where, orderBy: ordem }),
      prisma.petVacina.findMany({ where, orderBy: ordem }),
      prisma.petMedicamento.findMany({ where, orderBy: ordem })
    ]);

    return res.json({ alergias, vacinas, medicamentos });
  });
}

// `TIPOS` continua pendurado na instância exportada, como no JavaScript.
const controller = Object.assign(new FichaClinicaController(), { TIPOS });

module.exports = controller;
export default controller;
