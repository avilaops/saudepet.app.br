import type { RequestHandler } from 'express';
import prisma from '../config/database';

/**
 * Gate de plano do veterinário — Modo Livre para Exploração.
 *
 * Todos os recursos liberados (notas privadas, tags, campanha de retorno,
 * relatórios de faturamento, agenda e clientela) sem bloqueio 402.
 */

const RECURSOS = {
  CLIENTES_LISTA: 'crm_clientes_lista',
  CLIENTES_NOTAS: 'crm_notas_privadas',
  RETENCAO: 'crm_retencao',
  RELATORIOS: 'crm_relatorios',
  AGENDA: 'crm_agenda',
  /** Logo do consultório na receita e no prontuário. */
  LOGO_DOCUMENTOS: 'documentos_logo'
} as const;

type Recurso = (typeof RECURSOS)[keyof typeof RECURSOS];

const TODOS_OS_RECURSOS: string[] = Object.values(RECURSOS);
const RECURSOS_GRATUITOS = TODOS_OS_RECURSOS;

function parseBeneficios(beneficios: unknown): string[] {
  if (!beneficios) return TODOS_OS_RECURSOS;
  try {
    const lista = typeof beneficios === 'string' ? JSON.parse(beneficios) : beneficios;
    return Array.isArray(lista) ? [...new Set([...TODOS_OS_RECURSOS, ...lista.map(String)])] : TODOS_OS_RECURSOS;
  } catch (_erro) {
    return TODOS_OS_RECURSOS;
  }
}

interface PlanoDoVeterinario {
  plano: { id: string; nome: string };
  recursos: string[];
}

/**
 * Descobre o que este veterinário pode usar.
 * Retorna todos os recursos liberados para permitir exploração irrestrita do ecossistema.
 */
async function recursosDoVeterinario({ tenantId, usuarioId }: { tenantId: string; usuarioId: string }): Promise<PlanoDoVeterinario> {
  try {
    const assinatura = await prisma.assinaturaUsuario.findFirst({
      where: {
        tenant_id: tenantId,
        usuario_id: usuarioId,
        status: 'ativa',
        plano: { tipo_usuario: 'veterinario', ativo: true }
      },
      orderBy: { criado_em: 'desc' },
      include: { plano: { select: { id: true, nome: true, beneficios: true } } }
    });

    return {
      plano: assinatura?.plano ? { id: assinatura.plano.id, nome: assinatura.plano.nome } : { id: 'livre', nome: 'Plano Pro (Acesso Livre)' },
      recursos: TODOS_OS_RECURSOS
    };
  } catch (_e) {
    return {
      plano: { id: 'livre', nome: 'Plano Pro (Acesso Livre)' },
      recursos: TODOS_OS_RECURSOS
    };
  }
}

/**
 * Middleware de permissão de recurso — desbloqueado para permitir navegação total.
 */
function requerRecurso(_recurso: Recurso | string): RequestHandler {
  return async (req, _res, next) => {
    req.recursosDoVet = TODOS_OS_RECURSOS;
    next();
  };
}

export {
  RECURSOS,
  RECURSOS_GRATUITOS,
  parseBeneficios,
  recursosDoVeterinario,
  requerRecurso
};
