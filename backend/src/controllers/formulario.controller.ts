import crypto from 'crypto';
import type { Request, Response } from 'express';
import type { Prisma } from '@prisma/client';
import type { z } from 'zod';
import prisma from '../config/database';
import {
  asyncHandler,
  NotFoundError,
  ValidationError,
  ConflictError
} from '../middleware/error.middleware';
import { uploadBuffer } from '../config/r2';
import type {
  createFormularioSchema,
  updateFormularioSchema,
  responderFormularioSchema,
  buscarFormulariosSchema
} from '../schemas/formulario.schema';

/** Tenant e usuário vêm do `authMiddleware`, que carrega `req.user` inteiro. */
const tenantDe = (req: Request) => String(req.user?.tenant_id);
const usuarioDe = (req: Request) => String(req.user?.id);

/** A definição de um campo, como o construtor do admin a grava em `Formulario.campos`. */
type CampoDoFormulario = z.infer<typeof createFormularioSchema>['campos'][number];

/** Paginação sem schema na rota: página e limite chegam como texto da query. */
interface PaginacaoDaQuery {
  page?: unknown;
  limit?: unknown;
}

// ═══════════════════════════════════════════════════════
// FORMULÁRIOS - CRUD
// ═══════════════════════════════════════════════════════

/**
 * Criar novo formulário
 * POST /api/v1/formularios
 * Acesso: Admin
 */
const criar = asyncHandler(async (req: Request, res: Response) => {
  const corpo: z.infer<typeof createFormularioSchema> = req.body;
  const { titulo, descricao, tipo, obrigatorio, campos } = corpo;
  const tenant_id = tenantDe(req);
  const criado_por = usuarioDe(req);

  const formulario = await prisma.formulario.create({
    data: {
      tenant_id,
      titulo,
      descricao,
      tipo,
      obrigatorio,
      campos: JSON.stringify(campos),
      criado_por,
      status: 'ativo'
    }
  });

  return res.status(201).json({
    message: 'Formulário criado com sucesso',
    formulario: {
      ...formulario,
      campos: JSON.parse(formulario.campos)
    }
  });
});

/**
 * Listar formulários
 * GET /api/v1/formularios
 * Acesso: Autenticado
 */
const listar = asyncHandler(async (req: Request, res: Response) => {
  // `validate(buscarFormulariosSchema, 'query')` já coagiu página e limite.
  const query = req.query as unknown as z.infer<typeof buscarFormulariosSchema>;
  const { tipo, status, page = 1, limit = 20 } = query;
  const tenant_id = tenantDe(req);

  const where: Prisma.FormularioWhereInput = {
    tenant_id,
    ...(tipo && { tipo }),
    ...(status && { status })
  };

  const [formularios, total] = await Promise.all([
    prisma.formulario.findMany({
      where,
      skip: (page - 1) * limit,
      take: parseInt(String(limit)),
      orderBy: { criado_em: 'desc' }
    }),
    prisma.formulario.count({ where })
  ]);

  // Parse JSON dos campos
  const formulariosComCampos = formularios.map(form => ({
    ...form,
    campos: JSON.parse(form.campos)
  }));

  return res.json({
    formularios: formulariosComCampos,
    paginacao: {
      total,
      pagina: parseInt(String(page)),
      limite: parseInt(String(limit)),
      total_paginas: Math.ceil(total / limit)
    }
  });
});

/**
 * Buscar formulário por ID
 * GET /api/v1/formularios/:id
 * Acesso: Autenticado
 */
const buscarPorId = asyncHandler(async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const tenant_id = tenantDe(req);

  const formulario = await prisma.formulario.findFirst({
    where: { id, tenant_id }
  });

  if (!formulario) {
    throw new NotFoundError('Formulário não encontrado');
  }

  return res.json({
    formulario: {
      ...formulario,
      campos: JSON.parse(formulario.campos)
    }
  });
});

/**
 * Atualizar formulário
 * PUT /api/v1/formularios/:id
 * Acesso: Admin
 */
const atualizar = asyncHandler(async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const corpo: z.infer<typeof updateFormularioSchema> = req.body;
  const { titulo, descricao, status, obrigatorio, campos } = corpo;
  const tenant_id = tenantDe(req);

  const formularioExiste = await prisma.formulario.findFirst({
    where: { id, tenant_id }
  });

  if (!formularioExiste) {
    throw new NotFoundError('Formulário não encontrado');
  }

  const data: Prisma.FormularioUpdateInput = {
    ...(titulo ? { titulo } : {}),
    ...(descricao !== undefined && { descricao }),
    ...(status && { status }),
    ...(obrigatorio !== undefined && { obrigatorio }),
    ...(campos && { campos: JSON.stringify(campos) })
  };

  const formulario = await prisma.formulario.update({
    where: { id },
    data
  });

  return res.json({
    message: 'Formulário atualizado com sucesso',
    formulario: {
      ...formulario,
      campos: JSON.parse(formulario.campos)
    }
  });
});

/**
 * Deletar formulário
 * DELETE /api/v1/formularios/:id
 * Acesso: Admin
 */
const deletar = asyncHandler(async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const tenant_id = tenantDe(req);

  const formulario = await prisma.formulario.findFirst({
    where: { id, tenant_id }
  });

  if (!formulario) {
    throw new NotFoundError('Formulário não encontrado');
  }

  // `RespostaFormulario.formulario` tem `onDelete: Cascade`: apagar o
  // formulário levava junto TODAS as respostas — o contrário do que a tela
  // prometia ("as respostas já registradas são preservadas no banco").
  // Formulário com resposta não se exclui: se inativa, e o histórico fica.
  const respostas = await prisma.respostaFormulario.count({
    where: { formulario_id: id, tenant_id }
  });

  if (respostas > 0) {
    throw new ConflictError(
      `Este formulário já tem ${respostas} resposta${respostas !== 1 ? 's' : ''} registrada${respostas !== 1 ? 's' : ''}. ` +
      'Excluí-lo apagaria esse histórico. Use "Inativar" para tirá-lo de circulação preservando as respostas.'
    );
  }

  await prisma.formulario.delete({
    where: { id }
  });

  return res.json({
    message: 'Formulário deletado com sucesso'
  });
});

// ═══════════════════════════════════════════════════════
// RESPOSTAS DE FORMULÁRIOS
// ═══════════════════════════════════════════════════════

/**
 * Anexar arquivo a uma resposta de formulário
 * POST /api/v1/formularios/:id/anexo
 * Acesso: Autenticado
 *
 * O construtor do admin oferece o tipo de campo "Arquivo" desde sempre, e a
 * tela de resposta não renderizava nada para ele — o campo existia, aparecia na
 * definição do formulário e simplesmente não coletava coisa nenhuma. Quem
 * montasse um formulário pedindo a foto de um exame recebia respostas sem o
 * exame, sem qualquer aviso.
 */
const anexar = asyncHandler(async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const tenant_id = tenantDe(req);

  if (!req.file) {
    throw new ValidationError('Nenhum arquivo enviado');
  }

  // Só se anexa a formulário que existe e está no ar: sem isto, a rota viraria
  // um depósito de arquivos com autenticação.
  const formulario = await prisma.formulario.findFirst({
    where: { id, tenant_id, status: 'ativo' },
    select: { id: true }
  });

  if (!formulario) {
    throw new NotFoundError('Formulário não encontrado ou inativo');
  }

  const extensao = (req.file.originalname.split('.').pop() || 'bin').toLowerCase().slice(0, 8);
  const chave = `formularios/${tenant_id}/${id}/${crypto.randomUUID()}.${extensao}`;
  const url = await uploadBuffer(req.file.buffer, chave, req.file.mimetype);

  return res.status(201).json({
    url,
    nome: req.file.originalname,
    tipo: req.file.mimetype,
    tamanho: req.file.size
  });
});

/**
 * Responder formulário
 * POST /api/v1/formularios/:id/responder
 * Acesso: Autenticado
 */
const responder = asyncHandler(async (req: Request, res: Response) => {
  const formulario_id = String(req.params.id);
  const corpo: z.infer<typeof responderFormularioSchema> = req.body;
  const { atendimento_id, pet_id, respostas } = corpo;
  const tenant_id = tenantDe(req);
  const usuario_id = usuarioDe(req);

  // Verificar se formulário existe
  const formulario = await prisma.formulario.findFirst({
    where: { id: formulario_id, tenant_id, status: 'ativo' }
  });

  if (!formulario) {
    throw new NotFoundError('Formulário não encontrado ou inativo');
  }

  // Validar respostas obrigatórias
  const campos: CampoDoFormulario[] = JSON.parse(formulario.campos);
  const camposObrigatorios = campos.filter(c => c.obrigatorio);

  for (const campo of camposObrigatorios) {
    if (!respostas[campo.id]) {
      throw new ValidationError(`Campo obrigatório não preenchido: ${campo.label}`);
    }
  }

  // Criar resposta
  const resposta = await prisma.respostaFormulario.create({
    data: {
      tenant_id,
      formulario_id,
      usuario_id,
      atendimento_id,
      pet_id,
      respostas: JSON.stringify(respostas)
    },
    include: {
      formulario: {
        select: {
          titulo: true,
          tipo: true
        }
      }
    }
  });

  return res.status(201).json({
    message: 'Formulário respondido com sucesso',
    resposta: {
      ...resposta,
      respostas: JSON.parse(resposta.respostas)
    }
  });
});

/**
 * Listar respostas de um formulário
 * GET /api/v1/formularios/:id/respostas
 * Acesso: Admin
 */
const listarRespostas = asyncHandler(async (req: Request, res: Response) => {
  const formulario_id = String(req.params.id);
  const query: PaginacaoDaQuery = req.query;
  const { page = 1, limit = 20 } = query;
  const tenant_id = tenantDe(req);

  const where: Prisma.RespostaFormularioWhereInput = {
    formulario_id,
    tenant_id
  };

  const [respostas, total] = await Promise.all([
    prisma.respostaFormulario.findMany({
      where,
      skip: (Number(page) - 1) * Number(limit),
      take: parseInt(String(limit)),
      orderBy: { criado_em: 'desc' }
    }),
    prisma.respostaFormulario.count({ where })
  ]);

  const respostasComParse = respostas.map(r => ({
    ...r,
    respostas: JSON.parse(r.respostas)
  }));

  return res.json({
    respostas: respostasComParse,
    paginacao: {
      total,
      pagina: parseInt(String(page)),
      limite: parseInt(String(limit)),
      total_paginas: Math.ceil(total / Number(limit))
    }
  });
});

/**
 * Buscar respostas de um usuário
 * GET /api/v1/formularios/minhas-respostas
 * Acesso: Autenticado
 */
const minhasRespostas = asyncHandler(async (req: Request, res: Response) => {
  const query: PaginacaoDaQuery = req.query;
  const { page = 1, limit = 20 } = query;
  const tenant_id = tenantDe(req);
  const usuario_id = usuarioDe(req);

  const where: Prisma.RespostaFormularioWhereInput = {
    usuario_id,
    tenant_id
  };

  const [respostas, total] = await Promise.all([
    prisma.respostaFormulario.findMany({
      where,
      skip: (Number(page) - 1) * Number(limit),
      take: parseInt(String(limit)),
      include: {
        formulario: {
          select: {
            titulo: true,
            tipo: true
          }
        }
      },
      orderBy: { criado_em: 'desc' }
    }),
    prisma.respostaFormulario.count({ where })
  ]);

  const respostasComParse = respostas.map(r => ({
    ...r,
    respostas: JSON.parse(r.respostas)
  }));

  return res.json({
    respostas: respostasComParse,
    paginacao: {
      total,
      pagina: parseInt(String(page)),
      limite: parseInt(String(limit)),
      total_paginas: Math.ceil(total / Number(limit))
    }
  });
});

/**
 * Estatísticas de formulários
 * GET /api/v1/formularios/estatisticas
 * Acesso: Admin
 */
const estatisticas = asyncHandler(async (req: Request, res: Response) => {
  const tenant_id = tenantDe(req);

  const [
    totalFormularios,
    formulariosPorTipo,
    totalRespostas,
    respostasPorFormulario
  ] = await Promise.all([
    prisma.formulario.count({
      where: { tenant_id, status: 'ativo' }
    }),
    prisma.formulario.groupBy({
      by: ['tipo'],
      where: { tenant_id },
      _count: true
    }),
    prisma.respostaFormulario.count({
      where: { tenant_id }
    }),
    prisma.respostaFormulario.groupBy({
      by: ['formulario_id'],
      where: { tenant_id },
      _count: true
    })
  ]);

  return res.json({
    estatisticas: {
      total_formularios: totalFormularios,
      total_respostas: totalRespostas,
      formularios_por_tipo: formulariosPorTipo.reduce<Record<string, number>>((acc, item) => {
        acc[item.tipo] = item._count;
        return acc;
      }, {}),
      media_respostas_por_formulario: respostasPorFormulario.length > 0
        ? (totalRespostas / respostasPorFormulario.length).toFixed(2)
        : 0
    }
  });
});

/**
 * Respostas de formulários de um atendimento, para quem participa dele.
 * GET /api/v1/formularios/respostas/atendimento/:atendimentoId
 *
 * O veterinário precisa ler a anamnese que o tutor preencheu antes da
 * consulta; a rota admin de respostas não serve porque é por formulário e
 * restrita a admin. A autorização aqui é a do atendimento: tutor,
 * veterinário atribuído ou admin do tenant.
 */
const respostasDoAtendimento = asyncHandler(async (req: Request, res: Response) => {
  const atendimentoId = String(req.params.atendimentoId);
  const tenant_id = tenantDe(req);
  const usuario_id = usuarioDe(req);

  const solicitacao = await prisma.solicitacao.findFirst({
    where: { id: atendimentoId, tenant_id },
    select: { tutor_id: true, veterinario: { select: { usuario_id: true } } }
  });
  if (!solicitacao) {
    throw new NotFoundError('Atendimento não encontrado');
  }
  const participante = solicitacao.tutor_id === usuario_id ||
    solicitacao.veterinario?.usuario_id === usuario_id;
  if (!participante && req.user?.tipo_usuario !== 'admin' && req.user?.tipo_usuario !== 'super_admin') {
    throw new NotFoundError('Atendimento não encontrado');
  }

  const respostas = await prisma.respostaFormulario.findMany({
    where: { tenant_id, atendimento_id: atendimentoId },
    include: { formulario: { select: { titulo: true, tipo: true, campos: true } } },
    orderBy: { criado_em: 'asc' }
  });

  return res.json({
    respostas: respostas.map(r => ({
      id: r.id,
      criado_em: r.criado_em,
      formulario: {
        titulo: r.formulario.titulo,
        tipo: r.formulario.tipo,
        campos: JSON.parse(r.formulario.campos)
      },
      respostas: JSON.parse(r.respostas)
    }))
  });
});

const formularioController = {
  anexar,
  criar,
  listar,
  buscarPorId,
  atualizar,
  deletar,
  responder,
  listarRespostas,
  minhasRespostas,
  respostasDoAtendimento,
  estatisticas
};

// As rotas fazem `require('../controllers/formulario.controller')` com
// destructuring — a forma exportada precisa continuar a mesma.
module.exports = formularioController;

export default formularioController;
