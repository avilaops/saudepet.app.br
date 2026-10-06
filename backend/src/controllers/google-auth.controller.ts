import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import type { TokenPayload } from 'google-auth-library';
import axios from 'axios';
import type { Request, Response } from 'express';
import type { TipoUsuario, Usuario } from '@prisma/client';
import prisma from '../config/database';
import TokenService from '../services/token.service';
import AuditService from '../services/audit.service';
import { garantirPodeEntrar } from '../services/politica-acesso.service';
import { ForbiddenError, NotFoundError, ValidationError, asyncHandler } from '../middleware/error.middleware';

/** `cookie-parser` não tem tipos na casa: o cookie de estado do OAuth é lido daqui. */
type RequestComCookies = Request & { cookies?: Record<string, string | undefined> };

/** O que o Google devolve e o que o callback usa dele. */
type DadosDoGoogle = { googleId: string; email: string; nome: string; foto?: string };

function detalheDoErro(erro: unknown): { resposta: unknown; mensagem: string } {
  if (axios.isAxiosError(erro)) return { resposta: erro.response?.data, mensagem: erro.message };
  return { resposta: undefined, mensagem: erro instanceof Error ? erro.message : String(erro) };
}

/** O `error` do corpo que o Google devolve num 4xx (`invalid_client`, `invalid_grant`…). */
function codigoDoErroDoGoogle(resposta: unknown): unknown {
  return typeof resposta === 'object' && resposta !== null && 'error' in resposta
    ? (resposta as { error?: unknown }).error
    : undefined;
}

class GoogleAuthController {
  /**
   * Configuração genérica e reutilizável por variáveis de ambiente
   */
  _getConfig() {
    return {
      tenantSlug: process.env.AUTH_TENANT_SLUG || process.env.TENANT_SLUG || 'saudepet',
      // Papel da conta criada pelo Google. Vem do ambiente; o Prisma recusa
      // qualquer valor fora do enum na hora de gravar.
      defaultRole: (process.env.AUTH_DEFAULT_ROLE as TipoUsuario | undefined) || 'tutor',
      jwtIssuer: process.env.AUTH_JWT_ISSUER || 'saudepet-api',
      jwtAudience: process.env.AUTH_JWT_AUDIENCE || 'saudepet-app',
      frontendUrl: process.env.FRONTEND_URL || 'https://saudepet.app.br',
      apiUrl: process.env.API_URL || 'https://saudepet.app.br/api'
    };
  }

  /**
   * 1. Inicia o fluxo OAuth 2.0 com estado CSRF gravado em Cookie seguro HttpOnly
   */
  redirectToGoogle = asyncHandler(async (req: Request, res: Response) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      return res.status(503).json({
        success: false,
        message: 'Login com Google ainda não configurado com GOOGLE_CLIENT_ID no servidor.'
      });
    }

    const { apiUrl } = this._getConfig();

    // Gerar estado criptográfico anti-CSRF (32 bytes random)
    const state = crypto.randomBytes(32).toString('hex');

    // Armazenar estado em Cookie seguro HttpOnly por 10 minutos
    res.cookie('oauth_state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 10 * 60 * 1000
    });

    const redirectUri = `${apiUrl}/v1/auth/google/callback`;
    const scope = encodeURIComponent('openid email profile');
    const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&state=${state}`;

    return res.redirect(googleAuthUrl);
  });

  /**
   * 2. Callback do Google com verificação de CSRF, id_token e geração de exchange code HASH no PostgreSQL
   */
  handleCallback = asyncHandler(async (req: Request, res: Response) => {
    const { code, state, error } = req.query;
    const { frontendUrl, apiUrl } = this._getConfig();

    if (error || !code) {
      return res.redirect(`${frontendUrl}/login?google_error=auth_cancelled`);
    }

    // CORREÇÃO CRÍTICA 1: Validar rigorosamente se o estado salvo existe e bate com o estado retornado
    const savedState = (req as RequestComCookies).cookies?.oauth_state;
    res.clearCookie('oauth_state');

    if (!savedState || !state || state !== savedState) {
      console.error('⚠️ [CSRF ALERT] Estado OAuth ausente, inválido ou adulterado.');
      return res.redirect(`${frontendUrl}/login?google_error=csrf_invalid`);
    }

    try {
      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      const redirectUri = `${apiUrl}/v1/auth/google/callback`;

      // Trocar authorization code por tokens do Google
      const tokenRes = await axios.post('https://oauth2.googleapis.com/token', {
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      });

      const { id_token } = tokenRes.data;

      // Verificar ID Token via biblioteca oficial Google Auth Library
      const googleClient = new OAuth2Client(clientId);
      const ticket = await googleClient.verifyIdToken({
        idToken: id_token,
        audience: clientId
      });

      const payload = ticket.getPayload();
      if (!payload) {
        throw new Error('ID Token do Google sem payload');
      }
      const { sub: googleId, email, name, picture, email_verified } = payload;

      if (!email || !email_verified) {
        return res.redirect(`${frontendUrl}/login?google_error=unverified_email`);
      }

      // Processar usuário via tabela federada AuthIdentity (escopada por tenant_id)
      const usuario = await this._processGoogleUser({
        req,
        googleId,
        email: email.toLowerCase().trim(),
        nome: name || 'Usuário Google',
        foto: picture
      });

      // CORREÇÃO CRÍTICA 3: Código de troca gravado no PostgreSQL com Hash SHA-256 (uso único, 60s)
      const rawExchangeCode = crypto.randomBytes(32).toString('hex');
      const codeHash = crypto.createHash('sha256').update(rawExchangeCode).digest('hex');

      await prisma.authExchangeCode.create({
        data: {
          tenant_id: String(usuario.tenant_id),
          code_hash: codeHash,
          usuario_id: usuario.id,
          expires_at: new Date(Date.now() + 60 * 1000) // Válido por 60s
        }
      });

      return res.redirect(`${frontendUrl}/login?exchange_code=${rawExchangeCode}`);
    } catch (err) {
      // `invalid_client` (segredo errado no servidor) e `invalid_grant` (código
      // já usado ou expirado) são problemas opostos — um é configuração nossa,
      // o outro é o usuário demorando no consentimento. Os dois caíam no mesmo
      // `server_error`, e de fora não dava para distinguir configuração quebrada
      // de fluxo lento. O motivo agora vai no log e uma pista vai na URL.
      const { resposta, mensagem } = detalheDoErro(err);
      const googleError = codigoDoErroDoGoogle(resposta);
      console.error('❌ [GOOGLE AUTH CALLBACK ERROR]:', resposta || mensagem);

      const motivo = googleError === 'invalid_client'
        ? 'config_invalida'
        : googleError === 'invalid_grant'
          ? 'codigo_expirado'
          : 'server_error';

      return res.redirect(`${frontendUrl}/login?google_error=${motivo}`);
    }
  });

  /**
   * 3. Troca do código descartável por sessão (validação no PostgreSQL)
   */
  exchangeCode = asyncHandler(async (req: Request, res: Response) => {
    const code: unknown = req.body.code;
    if (!code) {
      throw new ValidationError('Código de troca é obrigatório.');
    }

    const codeHash = crypto.createHash('sha256').update(String(code)).digest('hex');

    const exchangeRecord = await prisma.authExchangeCode.findUnique({
      where: { code_hash: codeHash },
      include: { usuario: true }
    });

    if (!exchangeRecord || exchangeRecord.used_at || exchangeRecord.expires_at < new Date()) {
      throw new ForbiddenError('Código de troca inválido, já utilizado ou expirado.');
    }

    // Marcar como usado imediatamente no banco (garante uso único atômico)
    await prisma.authExchangeCode.update({
      where: { id: exchangeRecord.id },
      data: { used_at: new Date() }
    });

    const usuario = exchangeRecord.usuario;
    const authTokens = await this._generateTokens(req, usuario);

    return res.json({
      success: true,
      message: 'Sessão trocada com sucesso!',
      ...authTokens
    });
  });

  /**
   * 4. Validação direta por ID Token (Google One-Tap / SDK Frontend)
   */
  verifyIdToken = asyncHandler(async (req: Request, res: Response) => {
    const idToken: unknown = req.body.idToken;
    if (!idToken) {
      throw new ValidationError('ID Token do Google é obrigatório');
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const googleClient = new OAuth2Client(clientId);

    let payload: TokenPayload | undefined;
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: String(idToken),
        audience: clientId
      });
      payload = ticket.getPayload();
    } catch (err) {
      console.error('❌ [GOOGLE VERIFY ERROR]:', err instanceof Error ? err.message : String(err));
      throw new ForbiddenError('Validação do ID Token do Google falhou.');
    }

    if (!payload) {
      throw new Error('ID Token do Google sem payload');
    }
    const { sub: googleId, email, name, picture, email_verified } = payload;

    if (!email_verified || !email) {
      throw new ForbiddenError('E-mail do Google não verificado');
    }

    const usuario = await this._processGoogleUser({
      req,
      googleId,
      email: email.toLowerCase().trim(),
      nome: name || 'Usuário Google',
      foto: picture
    });

    const authTokens = await this._generateTokens(req, usuario);

    return res.json({
      success: true,
      message: 'Autenticação com Google realizada com sucesso!',
      ...authTokens
    });
  });

  /**
   * Auxiliar: Gerenciador de Identidades Federadas por tenant_id (AuthIdentity)
   */
  async _processGoogleUser({ req, googleId, email, nome, foto }: DadosDoGoogle & { req: Request }): Promise<Usuario> {
    const { tenantSlug, defaultRole } = this._getConfig();

    // Buscar tenant obrigatório
    const tenant = await prisma.tenant.findUnique({
      where: { slug: tenantSlug }
    });

    if (!tenant) {
      throw new NotFoundError(`Tenant '${tenantSlug}' não encontrado ou inativo.`);
    }

    const tenant_id = tenant.id;

    // CORREÇÃO CRÍTICA 2: Buscar identidade federada por (tenant_id + provider + provider_user_id)
    const identity = await prisma.authIdentity.findUnique({
      where: {
        tenant_id_provider_provider_user_id: {
          tenant_id,
          provider: 'google',
          provider_user_id: googleId
        }
      },
      include: { usuario: true }
    });

    let usuario: Usuario | null;

    if (identity) {
      usuario = identity.usuario;

      await AuditService.logForensicEvent({
        req,
        actorUserId: usuario.id,
        actorRole: usuario.tipo_usuario,
        entityType: 'usuario',
        entityId: usuario.id,
        action: 'AUTH_GOOGLE_SUCCESS',
        motivo: 'Login realizado via identidade federada Google'
      });
    } else {
      // Se a identidade não existe no tenant, buscar usuário pelo e-mail no tenant
      usuario = await prisma.usuario.findFirst({
        where: { tenant_id, email }
      });

      if (usuario) {
        // Vincular identidade ao usuário existente
        await prisma.authIdentity.create({
          data: {
            tenant_id,
            usuario_id: usuario.id,
            provider: 'google',
            provider_user_id: googleId
          }
        });

        if (foto && !usuario.foto_perfil) {
          await prisma.usuario.update({
            where: { id: usuario.id },
            data: { foto_perfil: foto, email_verificado: true }
          });
        }

        await AuditService.logForensicEvent({
          req,
          actorUserId: usuario.id,
          actorRole: usuario.tipo_usuario,
          entityType: 'usuario',
          entityId: usuario.id,
          action: 'AUTH_IDENTITY_LINKED',
          motivo: 'Identidade federada Google vinculada a usuário existente'
        });
      } else {
        // Criar novo usuário no tenant (senha: null)
        usuario = await prisma.usuario.create({
          data: {
            tenant_id,
            nome,
            email,
            senha: null,
            tipo_usuario: defaultRole,
            foto_perfil: foto,
            email_verificado: true,
            identities: {
              create: {
                tenant_id,
                provider: 'google',
                provider_user_id: googleId
              }
            }
          }
        });

        await AuditService.logForensicEvent({
          req,
          actorUserId: usuario.id,
          actorRole: defaultRole,
          entityType: 'usuario',
          entityId: usuario.id,
          action: 'AUTH_ACCOUNT_CREATED',
          motivo: 'Nova conta criada via Google OAuth'
        });
      }
    }

    return usuario;
  }

  /**
   * Auxiliar: Gerador de tokens JWT e Refresh Token
   */
  async _generateTokens(req: Request, usuario: Usuario) {
    // Entrar pelo Google não é atalho para a área profissional: o veterinário
    // pendente ou suspenso é barrado aqui do mesmo jeito que na senha.
    if (usuario.tipo_usuario === 'veterinario') {
      const [veterinario, config] = await Promise.all([
        prisma.veterinario.findUnique({
          where: { usuario_id: usuario.id },
          select: { aprovado_admin: true, status_credenciamento: true }
        }),
        prisma.configuracaoTenant.findUnique({ where: { tenant_id: String(usuario.tenant_id) } })
      ]);
      garantirPodeEntrar(
        { ...usuario, veterinario },
        { requerAprovacaoVet: config ? config.requer_aprovacao_vet : true }
      );
    }

    const ip = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];
    const { jwtIssuer, jwtAudience } = this._getConfig();

    const access_token = jwt.sign(
      { id: usuario.id, tipo_usuario: usuario.tipo_usuario, tenant_id: usuario.tenant_id },
      process.env.JWT_SECRET as string,
      { expiresIn: '15m', issuer: jwtIssuer, audience: jwtAudience, subject: String(usuario.id) }
    );

    const refresh_token = await TokenService.createRefreshToken(usuario.id, ip, userAgent);

    return {
      access_token,
      refresh_token,
      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        tipo_usuario: usuario.tipo_usuario,
        foto_perfil: usuario.foto_perfil,
        cidade: usuario.cidade
      }
    };
  }
}

const googleAuthController = new GoogleAuthController();

module.exports = googleAuthController;
export default googleAuthController;
