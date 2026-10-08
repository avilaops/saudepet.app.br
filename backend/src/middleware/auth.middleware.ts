import { dataBr } from '../utils/datas';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../config/database';
import TokenService from '../services/token.service';
import type { UsuarioAutenticado } from '../types/express';

const EMAIL_VERIFICATION_REQUIRED = (): boolean =>
  String(process.env.REQUIRE_EMAIL_VERIFICATION).toLowerCase() === 'true';

const ACTIVE_TENANT_STATUSES = new Set(['ativo', 'trial']);

/** O que a casa assina no access token (ver auth.controller e google-auth.controller). */
interface AccessTokenPayload extends jwt.JwtPayload {
  id: string;
  tipo_usuario?: string;
  tenant_id?: string | null;
  impersonado_por?: string | null;
}

async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      res.status(401).json({ error: 'Token não fornecido' });
      return;
    }

    const [scheme, token] = authHeader.trim().split(/\s+/);

    if (scheme !== 'Bearer' || !token) {
      res.status(401).json({ error: 'Token mal formatado' });
      return;
    }

    // Verificar se token está na blacklist
    const isBlacklisted = await TokenService.isTokenBlacklisted(token);
    if (isBlacklisted) {
      res.status(401).json({ error: 'Token inválido ou revogado' });
      return;
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as AccessTokenPayload;

    const usuario = await prisma.usuario.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        tenant_id: true,
        nome: true,
        email: true,
        tipo_usuario: true,
        cidade: true,
        email_verificado: true,
        sessoes_revogadas_em: true,
        bloqueado: true,
        bloqueado_ate: true,
        bloqueio_motivo: true,
        tenant: {
          select: {
            status: true,
            expira_em: true
          }
        },
        veterinario: {
          select: {
            id: true,
            aprovado_admin: true
          }
        }
      }
    }) as UsuarioAutenticado | null;

    if (!usuario) {
      res.status(401).json({ error: 'Usuário não encontrado' });
      return;
    }

    // Invalidação em massa de sessão. Sem isto, "revogar sessões", suspender um
    // veterinário e trocar a senha eram só aviso na tela: o access token de 7
    // dias continuava sendo aceito e a pessoa seguia dentro do sistema.
    // `iat` está em segundos; a comparação é em milissegundos.
    if (usuario.sessoes_revogadas_em && decoded.iat) {
      if (decoded.iat * 1000 < new Date(usuario.sessoes_revogadas_em).getTime()) {
        res.status(401).json({ error: 'Sessão encerrada. Entre novamente.' });
        return;
      }
    }

    // Punição da moderação. Antes o admin aplicava suspensão, a tela dizia que o
    // usuário perdia acesso "na hora" e nada no sistema lia `Punicao`: o punido
    // continuava usando o app normalmente.
    if (usuario.bloqueado) {
      const expirou = usuario.bloqueado_ate && new Date(usuario.bloqueado_ate) <= new Date();
      if (expirou) {
        // Suspensão temporária que venceu: libera aqui mesmo, sem depender de
        // worker. Falha na escrita não pode barrar quem já cumpriu a punição.
        prisma.usuario.update({
          where: { id: usuario.id },
          data: { bloqueado: false, bloqueado_ate: null, bloqueio_motivo: null }
        }).catch(() => {});
      } else {
        res.status(403).json({
          error: usuario.bloqueado_ate
            ? `Conta suspensa até ${dataBr(usuario.bloqueado_ate)}.`
            : 'Conta suspensa permanentemente.',
          motivo: usuario.bloqueio_motivo || undefined,
          bloqueado: true
        });
        return;
      }
    }

    if (usuario.tipo_usuario !== 'super_admin') {
      if (!usuario.tenant_id || !usuario.tenant || !ACTIVE_TENANT_STATUSES.has(usuario.tenant.status)) {
        res.status(403).json({ error: 'Organização não está ativa' });
        return;
      }

      if (usuario.tenant.expira_em && new Date(usuario.tenant.expira_em) < new Date()) {
        res.status(403).json({ error: 'O plano da organização expirou' });
        return;
      }
    }

    if (EMAIL_VERIFICATION_REQUIRED() && !usuario.email_verificado) {
      res.status(403).json({ error: 'Verifique seu email antes de acessar a aplicação' });
      return;
    }

    req.userId = usuario.id;
    req.userType = usuario.tipo_usuario;
    req.user = usuario;
    // Visita de suporte: o token diz quem está por trás da sessão. Sem isso,
    // tudo que acontecesse aqui apareceria como ato da própria pessoa.
    req.impersonadoPor = decoded.impersonado_por || null;

    next();
  } catch (error) {
    const nome = (error as Error).name;
    if (nome === 'JsonWebTokenError') {
      res.status(401).json({ error: 'Token inválido' });
      return;
    }
    if (nome === 'TokenExpiredError') {
      res.status(401).json({ error: 'Token expirado' });
      return;
    }
    res.status(401).json({ error: 'Erro de autenticação' });
  }
}

function isAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.userType !== 'admin' && req.userType !== 'super_admin') {
    res.status(403).json({ error: 'Acesso negado. Apenas administradores.' });
    return;
  }
  next();
}

function isVeterinario(req: Request, res: Response, next: NextFunction): void {
  if (req.userType !== 'veterinario' && req.userType !== 'super_admin') {
    res.status(403).json({ error: 'Acesso negado. Apenas veterinários.' });
    return;
  }
  next();
}

/**
 * Quem pode agir COMO TUTOR — ou seja, ter pets, pedir atendimento, guardar
 * endereço, marcar lembrete e avaliar.
 *
 * O veterinário entrou nessa lista em 26/08/2026, e a razão é simples: ele
 * também tem cachorro em casa. Antes, `tipo_usuario` era exclusivo e a única
 * saída para o profissional que queria atendimento para o próprio gato era
 * criar uma SEGUNDA conta, com OUTRO e-mail. Isso não é regra de negócio, é
 * efeito colateral de a coluna guardar um papel só.
 *
 * O que continua exclusivo do profissional é o outro lado do balcão: atender,
 * ver a fila, preencher prontuário, receber repasse. Isso segue em
 * `isVeterinario`, que o tutor não passa.
 *
 * A contrapartida obrigatória mora em `despacho-solicitacao.service` e em
 * `solicitacao.controller`: o veterinário NÃO recebe, não vê e não aceita o
 * próprio chamado. Sem essa trava, abrir esta porta deixaria alguém pedir
 * atendimento para si mesmo, aceitar sozinho e gerar repasse para a própria
 * conta.
 */
function isTutor(req: Request, res: Response, next: NextFunction): void {
  if (!req.userType || !['tutor', 'veterinario', 'super_admin'].includes(req.userType)) {
    res.status(403).json({ error: 'Acesso negado. Apenas tutores.' });
    return;
  }
  next();
}

function requireRoles(...roles: string[]): RequestHandler {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.tipo_usuario)) {
      res.status(403).json({ error: 'Acesso negado' });
      return;
    }
    next();
  };
}

function requireApprovedVeterinarian(req: Request, res: Response, next: NextFunction): void {
  if (req.userType !== 'veterinario') {
    next();
    return;
  }

  if (!req.user?.veterinario?.aprovado_admin) {
    res.status(403).json({ error: 'Sua conta veterinária ainda não foi aprovada' });
    return;
  }

  next();
}

// Confirma que o usuário autenticado é staff ativo do parceiro resolvido por getPartnerId,
// ou admin/super_admin (que enxerga qualquer parceiro do tenant). Evita IDOR em rotas de
// parceiro onde o ID vem direto da URL/body sem checagem de posse.
function requirePartnerAccess(getPartnerId: (req: Request) => Promise<string | null | undefined> | string | null | undefined): RequestHandler {
  return async (req, res, next) => {
    if (req.userType === 'admin' || req.userType === 'super_admin') {
      next();
      return;
    }

    try {
      const partnerId = await getPartnerId(req);
      if (!partnerId) {
        res.status(404).json({ error: 'Parceiro não encontrado' });
        return;
      }

      const membership = await prisma.partnerUser.findFirst({
        where: { userId: req.userId, partnerId, active: true }
      });

      if (!membership) {
        res.status(403).json({ error: 'Acesso negado a este parceiro' });
        return;
      }

      next();
    } catch (_error) {
      res.status(403).json({ error: 'Acesso negado a este parceiro' });
    }
  };
}

/**
 * Barra atos irreversíveis numa visita de suporte.
 *
 * Ver a conta de alguém para entender um problema é uma coisa; trocar a senha
 * dessa pessoa ou encerrar a conta dela em nome dela é outra. Nenhum motivo de
 * suporte justifica isso, e o registro de "quem fez" não desfaz o estrago.
 */
function bloquearVisitaDeSuporte(req: Request, res: Response, next: NextFunction): void {
  if (req.impersonadoPor) {
    res.status(403).json({
      error: 'Esta ação não pode ser feita durante uma visita de suporte. Peça à pessoa que faça pela conta dela.'
    });
    return;
  }
  next();
}

export {
  authMiddleware,
  bloquearVisitaDeSuporte,
  isAdmin,
  isVeterinario,
  isTutor,
  requireRoles,
  requireApprovedVeterinarian,
  requirePartnerAccess,
  EMAIL_VERIFICATION_REQUIRED
};
