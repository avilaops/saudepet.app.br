/**
 * O que a casa pendura em `req` ao longo da cadeia de middlewares.
 *
 * Antes disto, cada controller lia `req.userId`, `req.tenantId` ou
 * `req.impersonadoPor` no escuro: o TypeScript não tinha como saber que o
 * campo existia, e a migração da camada de controllers teria de espalhar
 * `(req as any)` em centenas de lugares. Declarar aqui, uma vez, dá tipo a
 * todos os arquivos que nascerem `.ts` daqui em diante.
 *
 * Quem preenche cada campo:
 *  - `authMiddleware`      → userId, userType, user, impersonadoPor
 *  - `tenantContext`       → tenantId, isSuperAdmin
 *  - `requireActiveTenant` → tenant
 *  - `requerRecurso`       → recursosDoVet
 *  - multer                → file / files
 */
import type { TipoUsuario } from '@prisma/client';

/** O recorte de `usuarios` que o `authMiddleware` carrega em toda requisição. */
export interface UsuarioAutenticado {
  id: string;
  tenant_id: string | null;
  nome: string;
  email: string;
  tipo_usuario: TipoUsuario;
  cidade: string | null;
  email_verificado: boolean;
  sessoes_revogadas_em: Date | null;
  bloqueado: boolean;
  bloqueado_ate: Date | null;
  bloqueio_motivo: string | null;
  tenant: { status: string; expira_em: Date | null } | null;
  veterinario: { id: string; aprovado_admin: boolean } | null;
}

export interface TenantDaRequisicao {
  status: string;
  expira_em: Date | null;
  plano: string;
}

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      userType?: TipoUsuario;
      user?: UsuarioAutenticado;
      /** Id do admin por trás de uma visita de suporte; null fora dela. */
      impersonadoPor?: string | null;
      tenantId?: string | null;
      isSuperAdmin?: boolean;
      tenant?: TenantDaRequisicao;
      recursosDoVet?: string[];
    }
  }
}

export {};
