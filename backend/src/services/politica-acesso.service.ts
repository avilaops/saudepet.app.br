/**
 * Política de acesso da v1.0 — regras que valem em TODAS as portas de entrada.
 *
 * Login por senha, renovação de token e login com o Google emitiam sessão cada
 * um com a própria checagem, e as três discordavam: a senha exigia aprovação
 * do veterinário, o refresh também, o Google não exigia nada. Como a regra
 * mora aqui, uma porta nova (Apple, magic link) herda a mesma política.
 *
 * Regras:
 *  - Tutor: entra assim que a conta existe. Se `REQUIRE_EMAIL_VERIFICATION`
 *    estiver ligada, precisa confirmar o e-mail antes.
 *  - Veterinário: precisa de e-mail confirmado E aprovação do administrador,
 *    SEMPRE — independente da variável de ambiente. CRMV é documento; quem
 *    entra na área profissional passou por conferência humana.
 *  - Admin: entra como tutor, mas a rota administrativa continua atrás de
 *    `isAdmin`. Não é aqui que se decide o que o admin pode ver.
 */
import { ForbiddenError } from '../middleware/error.middleware';

export type CodigoDeBloqueio =
  | 'USUARIO_INEXISTENTE'
  | 'EMAIL_NAO_VERIFICADO'
  | 'VET_EMAIL_NAO_VERIFICADO'
  | 'VET_PENDENTE'
  | 'VET_RECUSADA'
  | 'VET_BLOQUEADA';

export type StatusContaVet = 'pendente' | 'aprovada' | 'recusada' | 'bloqueada';

/** O mínimo que a política precisa saber de uma conta para decidir. */
export interface ContaParaEntrar {
  tipo_usuario: string;
  email_verificado: boolean;
  veterinario?: {
    aprovado_admin?: boolean;
    status_credenciamento?: string | null;
  } | null;
}

export interface OpcoesDaPolitica {
  /**
   * Configuração do tenant. `false` explícito dispensa a aprovação (clínica
   * que credencia por fora); ausente/`true` exige.
   */
  requerAprovacaoVet?: boolean | null;
}

/** `ForbiddenError` com o código do bloqueio, para auditoria e para a tela. */
export class ErroDeAcesso extends ForbiddenError {
  codigo: CodigoDeBloqueio;

  constructor(codigo: CodigoDeBloqueio) {
    super(MENSAGENS[codigo] || 'Acesso negado');
    this.codigo = codigo;
  }
}

const MENSAGENS: Record<CodigoDeBloqueio, string> = {
  USUARIO_INEXISTENTE: 'Acesso negado',
  EMAIL_NAO_VERIFICADO: 'Verifique seu email antes de acessar a aplicação.',
  VET_EMAIL_NAO_VERIFICADO: 'Confirme seu e-mail para concluir o cadastro profissional. Reenviamos o link se precisar.',
  VET_PENDENTE: 'Sua conta ainda não foi aprovada pelo administrador.',
  VET_RECUSADA: 'Seu credenciamento foi recusado. Veja o e-mail com o motivo ou fale com o suporte.',
  VET_BLOQUEADA: 'Sua conta profissional está bloqueada. Fale com o suporte.'
};

/** Como o status granular do credenciamento aparece para a v1.0. */
const STATUS_CONTA_VET: Record<string, StatusContaVet> = {
  DRAFT: 'pendente',
  PENDING_DOCUMENTS: 'pendente',
  PENDING_REVIEW: 'pendente',
  UNDER_REVIEW: 'pendente',
  REQUIRES_RESUBMISSION: 'pendente',
  APPROVED: 'aprovada',
  REJECTED: 'recusada',
  SUSPENDED: 'bloqueada',
  EXPIRED: 'bloqueada'
};

function statusContaVeterinario(veterinario: ContaParaEntrar['veterinario']): StatusContaVet | null {
  if (!veterinario) return null;
  return STATUS_CONTA_VET[veterinario.status_credenciamento || ''] || (veterinario.aprovado_admin ? 'aprovada' : 'pendente');
}

function verificacaoDeEmailExigida(): boolean {
  return String(process.env.REQUIRE_EMAIL_VERIFICATION).toLowerCase() === 'true';
}

/**
 * Código do bloqueio, para auditoria — ou `null` se a conta pode entrar.
 */
function motivoDeBloqueio(usuario: ContaParaEntrar | null | undefined, { requerAprovacaoVet = true }: OpcoesDaPolitica = {}): CodigoDeBloqueio | null {
  if (!usuario) return 'USUARIO_INEXISTENTE';

  if (usuario.tipo_usuario === 'veterinario') {
    if (!usuario.email_verificado) return 'VET_EMAIL_NAO_VERIFICADO';

    const status = statusContaVeterinario(usuario.veterinario);
    if (status === 'recusada') return 'VET_RECUSADA';
    if (status === 'bloqueada') return 'VET_BLOQUEADA';
    if (requerAprovacaoVet !== false && !usuario.veterinario?.aprovado_admin) return 'VET_PENDENTE';
    return null;
  }

  if (verificacaoDeEmailExigida() && !usuario.email_verificado) return 'EMAIL_NAO_VERIFICADO';
  return null;
}

/** Lança `ErroDeAcesso` (403, com `codigo`) quando a conta não pode receber sessão. */
function garantirPodeEntrar(usuario: ContaParaEntrar | null | undefined, opcoes?: OpcoesDaPolitica): void {
  const codigo = motivoDeBloqueio(usuario, opcoes);
  if (codigo) {
    throw new ErroDeAcesso(codigo);
  }
}

/** O recorte do Prisma que `veterinarioAtendeuOPet` usa — aceita o cliente real e o mock dos testes. */
interface ClienteDeVinculos {
  solicitacao: { findFirst(args: unknown): Promise<unknown> };
  agendamento: { findFirst(args: unknown): Promise<unknown> };
}

/**
 * Um veterinário só enxerga o pet que passou pelas mãos dele: chamado
 * atribuído (solicitação) ou consulta marcada (agendamento). Admin vê tudo.
 *
 * Devolve `true`/`false`; quem chama decide entre 403 e 404.
 */
async function veterinarioAtendeuOPet(
  prisma: ClienteDeVinculos,
  { veterinarioId, petId, tenantId }: { veterinarioId?: string | null; petId?: string | null; tenantId?: string | null }
): Promise<boolean> {
  if (!veterinarioId || !petId) return false;
  const [solicitacao, agendamento] = await Promise.all([
    prisma.solicitacao.findFirst({
      where: { tenant_id: tenantId, pet_id: petId, veterinario_id: veterinarioId },
      select: { id: true }
    }),
    prisma.agendamento.findFirst({
      where: { tenant_id: tenantId, pet_id: petId, veterinario_id: veterinarioId },
      select: { id: true }
    })
  ]);
  return Boolean(solicitacao || agendamento);
}

export {
  MENSAGENS,
  STATUS_CONTA_VET,
  statusContaVeterinario,
  verificacaoDeEmailExigida,
  motivoDeBloqueio,
  garantirPodeEntrar,
  veterinarioAtendeuOPet
};
