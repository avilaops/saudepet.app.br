import { registrarSinalizacao } from './videochamada.service';

/**
 * A porta do Socket.IO.
 *
 * Tudo que chega por socket é tratado como pedido de quem NÃO provou nada: o
 * handshake valida o token, e cada evento confere de novo se aquela conta pode
 * fazer aquilo com aquele atendimento. O cliente nunca informa quem é — a
 * identidade vem do token, e o payload só diz sobre QUAL registro se fala.
 */

const DEFAULT_EVENTS_PER_MINUTE = 60;

/**
 * A negociação de uma videochamada troca dezenas de pacotes em poucos segundos.
 * No limite geral ela seria cortada no meio e a chamada ficaria presa em
 * "conectando" — os pacotes são minúsculos e a sala já foi autorizada.
 */
const EVENTOS_DE_CHAMADA_POR_MINUTO = 300;

export const roomForUser = (userId: string) => `user:${userId}`;
export const roomForTenant = (tenantId: string) => `tenant:${tenantId}`;
export const roomForVeterinarians = (tenantId: string) => `tenant:${tenantId}:veterinarios`;
export const roomForAdmins = (tenantId: string) => `tenant:${tenantId}:admins`;
export const roomForAttendance = (attendanceId: string) => `atendimento:${attendanceId}`;

function requiresEmailVerification(): boolean {
  return String(process.env.REQUIRE_EMAIL_VERIFICATION).toLowerCase() === 'true';
}

/**
 * Janela deslizante de um minuto, por conexão.
 *
 * Guarda o instante de cada evento e descarta o que passou de 60 s. É simples
 * porque precisa ser barato: roda em TODO evento de TODA conexão aberta.
 */
export function createEventLimiter(maxEvents: number = DEFAULT_EVENTS_PER_MINUTE): () => boolean {
  const marcas: number[] = [];

  return () => {
    const agora = Date.now();
    while (marcas.length && marcas[0] <= agora - 60_000) marcas.shift();
    if (marcas.length >= maxEvents) return false;
    marcas.push(agora);
    return true;
  };
}

type UsuarioDoSocket = {
  id: string;
  tenant_id: string | null;
  tipo_usuario: string;
  email_verificado: boolean;
  tenant?: { status: string; expira_em: Date | null } | null;
  veterinario?: { id: string; aprovado_admin: boolean } | null;
};

type Dependencias = {
  prisma: any;
  jwt: { verify: (token: string, segredo: string) => any };
  TokenService: { isTokenBlacklisted: (token: string) => Promise<boolean> };
};

export function registerSocketSecurity(io: any, { prisma, jwt, TokenService }: Dependencias): void {
  // ── Handshake ────────────────────────────────────────────────────────────
  // O erro é sempre o mesmo texto, de propósito: distinguir "token inválido"
  // de "tenant vencido" de "veterinário não aprovado" entrega, de fora, o
  // estado da conta de outra pessoa.
  io.use(async (socket: any, next: (erro?: Error) => void) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token || (await TokenService.isTokenBlacklisted(token))) {
        return next(new Error('Não autorizado'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET as string);

      const user: UsuarioDoSocket | null = await prisma.usuario.findUnique({
        where: { id: decoded.id },
        select: {
          id: true,
          tenant_id: true,
          tipo_usuario: true,
          email_verificado: true,
          tenant: { select: { status: true, expira_em: true } },
          veterinario: { select: { id: true, aprovado_admin: true } }
        }
      });

      if (!user) return next(new Error('Não autorizado'));

      if (requiresEmailVerification() && !user.email_verificado) {
        return next(new Error('Não autorizado'));
      }

      if (user.tipo_usuario !== 'super_admin') {
        if (!user.tenant_id || !user.tenant || !['ativo', 'trial'].includes(user.tenant.status)) {
          return next(new Error('Não autorizado'));
        }
        if (user.tenant.expira_em && new Date(user.tenant.expira_em) < new Date()) {
          return next(new Error('Não autorizado'));
        }
      }

      if (user.tipo_usuario === 'veterinario' && !user.veterinario?.aprovado_admin) {
        return next(new Error('Não autorizado'));
      }

      socket.user = user;
      return next();
    } catch {
      return next(new Error('Não autorizado'));
    }
  });

  io.on('connection', (socket: any) => {
    const canProcessEvent = createEventLimiter(
      Number.parseInt(process.env.SOCKET_EVENTS_PER_MINUTE || '', 10) || DEFAULT_EVENTS_PER_MINUTE
    );
    const user: UsuarioDoSocket = socket.user;

    socket.join(roomForUser(user.id));
    if (user.tenant_id) {
      socket.join(roomForTenant(user.tenant_id));
      if (user.tipo_usuario === 'admin') socket.join(roomForAdmins(user.tenant_id));
      if (user.tipo_usuario === 'veterinario') socket.join(roomForVeterinarians(user.tenant_id));
    }

    /**
     * Envelope de todo evento: respeita o limite, engole a exceção e responde
     * sempre a mesma recusa. O motivo real fica no log do servidor.
     */
    const safeHandler = (eventName: string, handler: (payload: any) => Promise<void>) => {
      socket.on(eventName, async (payload: unknown = {}) => {
        if (!canProcessEvent()) {
          socket.emit('erro:autorizacao', { error: 'Limite de eventos excedido' });
          return;
        }
        try {
          await handler(payload && typeof payload === 'object' ? payload : {});
        } catch {
          console.warn(`[SOCKET] Evento rejeitado: ${eventName}`);
          socket.emit('erro:autorizacao', { error: 'Evento não autorizado' });
        }
      });
    };

    /**
     * O atendimento existe, é deste tenant, e esta conta participa dele.
     *
     * Vale para tutor e veterinário pelo VÍNCULO, não pelo `tipo_usuario` —
     * o que importa aqui desde 26/08/2026, quando o veterinário passou a poder
     * ser tutor do próprio pet: nesse atendimento ele entra pelo `tutor_id`.
     */
    const findAuthorizedAttendance = async (attendanceId?: string) => {
      if (!attendanceId || !user.tenant_id) return null;

      const attendance = await prisma.solicitacao.findFirst({
        where: { id: attendanceId, tenant_id: user.tenant_id },
        include: { veterinario: { select: { id: true, usuario_id: true } } }
      });

      if (!attendance) return null;

      const participa =
        attendance.tutor_id === user.id || attendance.veterinario?.usuario_id === user.id;
      const adminDoTenant = user.tipo_usuario === 'admin';

      return participa || adminDoTenant ? attendance : null;
    };

    safeHandler('atendimento:join', async ({ solicitacaoId, atendimentoId }) => {
      const attendance = await findAuthorizedAttendance(solicitacaoId || atendimentoId);
      if (!attendance) throw new Error('not allowed');
      await socket.join(roomForAttendance(attendance.id));
    });

    // Videochamada da teleorientação: o servidor só apresenta um lado ao outro.
    // O vídeo vai direto entre os aparelhos e não passa por aqui.
    const podeProcessarSinal = createEventLimiter(EVENTOS_DE_CHAMADA_POR_MINUTO);
    const registrarSinal = (evento: string, handler: (payload: any) => Promise<void>) => {
      socket.on(evento, async (payload: unknown = {}) => {
        if (!podeProcessarSinal()) return;
        try {
          await handler(payload && typeof payload === 'object' ? payload : {});
        } catch {
          socket.emit('erro:autorizacao', { error: 'Chamada não autorizada' });
        }
      });
    };

    registrarSinalizacao({
      socket,
      registrar: registrarSinal,
      buscarAtendimentoAutorizado: findAuthorizedAttendance
    });

    safeHandler('veterinario:online', async () => {
      if (user.tipo_usuario !== 'veterinario' || !user.veterinario) throw new Error('not allowed');
      await prisma.veterinario.update({ where: { id: user.veterinario.id }, data: { online: true } });
    });

    safeHandler('veterinario:offline', async () => {
      if (user.tipo_usuario !== 'veterinario' || !user.veterinario) throw new Error('not allowed');
      await prisma.veterinario.update({ where: { id: user.veterinario.id }, data: { online: false } });
    });

    // Só marca presença. Aceita veterinário desde 26/08/2026: ele também é
    // tutor dos próprios pets, e o app emite este evento ao conectar.
    safeHandler('tutor:connect', async () => {
      if (!['tutor', 'veterinario'].includes(user.tipo_usuario)) throw new Error('not allowed');
    });

    // `solicitacao:nova` SAIU daqui em 26/08/2026.
    //
    // Ele deixava o tutor mandar o próprio chamado para a sala de TODOS os
    // veterinários do tenant — o megafone que a busca por proximidade tinha
    // acabado de substituir. Quem despacha hoje é o servidor, em
    // `despacho-solicitacao.service`, que calcula distância, respeita o raio da
    // cidade e fala com a sala pessoal de cada profissional elegível. Manter os
    // dois significava um caminho autenticado para furar o raio.
    //
    // No cliente, `emitNovaSolicitacao` já não era chamado por tela nenhuma.

    safeHandler('solicitacao:aceita', async ({ solicitacaoId }) => {
      if (user.tipo_usuario !== 'veterinario' || !user.veterinario) throw new Error('not allowed');

      const request = await prisma.solicitacao.findFirst({
        where: { id: solicitacaoId, tenant_id: user.tenant_id, veterinario_id: user.veterinario.id },
        select: { id: true, tutor_id: true, veterinario_id: true, status: true }
      });
      if (!request) throw new Error('not allowed');

      const evento = {
        solicitacaoId: request.id,
        tutorId: request.tutor_id,
        veterinarioId: request.veterinario_id,
        status: request.status
      };

      io.to(roomForUser(request.tutor_id)).emit('solicitacao:aceita', evento);
      io.to(roomForVeterinarians(user.tenant_id as string)).emit('solicitacao:indisponivel', {
        solicitacaoId: request.id
      });
    });

    safeHandler('atendimento:status', async ({ solicitacaoId, atendimentoId }) => {
      if (user.tipo_usuario !== 'veterinario' || !user.veterinario) throw new Error('not allowed');

      const request = await prisma.solicitacao.findFirst({
        where: {
          id: solicitacaoId || atendimentoId,
          tenant_id: user.tenant_id,
          veterinario_id: user.veterinario.id
        },
        select: { id: true, tutor_id: true, veterinario_id: true, status: true }
      });
      if (!request) throw new Error('not allowed');

      const evento = {
        solicitacaoId: request.id,
        tutorId: request.tutor_id,
        veterinarioId: request.veterinario_id,
        status: request.status
      };

      io.to(roomForAttendance(request.id)).emit('atendimento:atualizado', evento);
      io.to(roomForUser(request.tutor_id)).emit('atendimento:atualizado', evento);
    });

    /**
     * Entrega uma mensagem que JÁ está no banco.
     *
     * O socket não cria mensagem: ele só avisa o destinatário de uma linha que
     * a API já gravou. Por isso as três checagens — quem envia é o autor da
     * linha, quem envia participa do atendimento, e o destinatário é a outra
     * ponta daquele mesmo atendimento. Sem elas, o payload decidiria para quem
     * a mensagem vai.
     */
    const forwardPersistedMessage = async ({ mensagemId }: { mensagemId?: string }) => {
      if (!mensagemId || !user.tenant_id) throw new Error('not allowed');

      const message = await prisma.mensagem.findFirst({
        where: { id: mensagemId, tenant_id: user.tenant_id, remetente_id: user.id },
        include: { atendimento: { include: { veterinario: { select: { usuario_id: true } } } } }
      });
      if (!message?.atendimento) throw new Error('not allowed');

      const destinatarioValido =
        message.atendimento.tutor_id === message.destinatario_id ||
        message.atendimento.veterinario?.usuario_id === message.destinatario_id;
      const remetenteParticipa =
        message.atendimento.tutor_id === user.id ||
        message.atendimento.veterinario?.usuario_id === user.id;

      if (!destinatarioValido || !remetenteParticipa) throw new Error('not allowed');

      io.to(roomForUser(message.destinatario_id)).emit('nova:mensagem', message);
    };

    safeHandler('chat:mensagem', forwardPersistedMessage);
    safeHandler('enviar:mensagem', forwardPersistedMessage);

    socket.on('disconnect', async () => {
      if (user.tipo_usuario === 'veterinario' && user.veterinario?.id) {
        await prisma.veterinario
          .update({ where: { id: user.veterinario.id }, data: { online: false } })
          .catch(() => {});
      }
    });
  });
}

module.exports = {
  registerSocketSecurity,
  roomForUser,
  roomForTenant,
  roomForVeterinarians,
  roomForAdmins,
  roomForAttendance,
  createEventLimiter
};
