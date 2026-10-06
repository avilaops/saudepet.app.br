import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import type { Request, Response } from 'express';
import type { z } from 'zod';
import { Prisma } from '@prisma/client';
import type { Tenant, Usuario } from '@prisma/client';
import prisma from '../config/database';
import TokenService from '../services/token.service';
import AuditService from '../services/audit.service';
import emailService from '../services/email.service';
import { avisarNovoVeterinario } from '../services/notificacao-admin.service';
import { trackConversion } from '../services/meta-conversions.service';
import { garantirPodeEntrar, motivoDeBloqueio, MENSAGENS as MENSAGENS_ACESSO } from '../services/politica-acesso.service';
import {
  ConflictError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  asyncHandler
} from '../middleware/error.middleware';
import type { registerSchema, loginSchema } from '../schemas/auth.schema';
import type {
  refreshTokenSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  verifyEmailSchema,
  resendVerificationSchema
} from '../schemas/auth-advanced.schema';

import bcrypt from 'bcryptjs';

// Corpos já validados pelo `validate(schema)` da rota.
type RegisterBody = z.infer<typeof registerSchema>;
type LoginBody = z.infer<typeof loginSchema>;
type RefreshTokenBody = z.infer<typeof refreshTokenSchema>;
type ForgotPasswordBody = z.infer<typeof forgotPasswordSchema>;
type ResetPasswordBody = z.infer<typeof resetPasswordSchema>;
type ChangePasswordBody = z.infer<typeof changePasswordSchema>;
type VerifyEmailBody = z.infer<typeof verifyEmailSchema>;
type ResendVerificationBody = z.infer<typeof resendVerificationSchema>;

/** O perfil que o Facebook devolve em `/me?fields=id,name,email`. */
type PerfilFacebook = { id: string; name?: string; email?: string };

/** `cookie-parser` não tem tipos na casa: o cookie de estado do OAuth é lido daqui. */
type RequestComCookies = Request & { cookies?: Record<string, string | undefined> };

const includeLogin = {
  veterinario: true,
  tenant: {
    select: {
      id: true,
      nome: true,
      slug: true,
      logo: true,
      status: true,
      plano: true
    }
  }
} satisfies Prisma.UsuarioInclude;

type UsuarioDoLogin = Prisma.UsuarioGetPayload<{ include: typeof includeLogin }>;

const ipDaRequisicao = (req: Request): string | undefined => req.ip || req.connection.remoteAddress;

function detalheDoErro(erro: unknown): unknown {
  if (axios.isAxiosError(erro)) return erro.response?.data || erro.message;
  return erro instanceof Error ? erro.message : String(erro);
}

class AuthController {
  // Registro de usuário (dados já validados pelo middleware Zod)
  register = asyncHandler(async (req: Request, res: Response) => {
    console.log('🔵 [AUTH] Iniciando registro de usuário');
    const body: RegisterBody = req.body;
    const { nome, email, telefone, senha, cidade, crmv, crmv_uf, especialidade, tenant_slug } = body;
    const tipo_usuario = body.tipo_usuario || 'tutor';
    const PUBLIC_ROLES = new Set(['tutor', 'veterinario']);

    if (!PUBLIC_ROLES.has(tipo_usuario)) {
      throw new ForbiddenError('Cadastro público permitido apenas para tutor ou veterinário');
    }
    console.log('📝 [AUTH] Solicitação de cadastro recebida');

    let tenant_id: string | null = null;

    if (!tenant_slug) {
      throw new ConflictError('É necessário fornecer o identificador da organização (tenant_slug)');
    }

    // Buscar tenant pelo slug
    const tenant = await prisma.tenant.findUnique({
      where: { slug: tenant_slug },
      include: {
        configuracoes: true
      }
    });

    if (!tenant) {
      throw new NotFoundError('Organização não encontrada');
    }

    if (tenant.status === 'cancelado') {
      throw new ForbiddenError('Esta organização foi cancelada');
    }

    if (tenant.status === 'suspenso') {
      throw new ForbiddenError('Esta organização está suspensa');
    }

    if (tenant.configuracoes && !tenant.configuracoes.permitir_cadastro) {
      throw new ForbiddenError('Cadastro não permitido para esta organização');
    }

    // Verificar limite de usuários
    const totalUsuarios = await prisma.usuario.count({
      where: { tenant_id: tenant.id }
    });

    if (totalUsuarios >= tenant.limite_usuarios) {
      throw new ForbiddenError(
        `Limite de usuários atingido (${tenant.limite_usuarios}). Entre em contato com o administrador.`
      );
    }

    tenant_id = tenant.id;

    // Verificar se usuário já existe (considerando tenant)
    console.log('🔍 [AUTH] Verificando duplicação...');
    const usuarioExiste = await prisma.usuario.findFirst({
      where: {
        tenant_id,
        email
      }
    });

    if (usuarioExiste) {
      throw new ConflictError('Este email já está cadastrado.');
    }

    // Hash da senha
    const senhaHash = await bcrypt.hash(senha, 10);

    // Criar usuário
    const usuario = await prisma.usuario.create({
      data: {
        tenant_id,
        nome,
        email,
        telefone,
        senha: senhaHash,
        tipo_usuario,
        cidade
      }
    });
    console.log('✅ [AUTH] Usuário criado');

    // Se for veterinário, criar registro adicional
    if (tipo_usuario === 'veterinario') {
      await prisma.veterinario.create({
        data: {
          tenant_id,
          usuario_id: usuario.id,
          crmv: String(crmv).trim().toUpperCase(),
          crmv_uf: crmv_uf || null,
          // O `superRefine` do schema exige especialidade para veterinário; o
          // tipo inferido não sabe disso e ainda a vê como opcional.
          especialidade: String(especialidade),
          aprovado_admin: false,
          status_credenciamento: 'PENDING_REVIEW'
        }
      });

      // Enviar email de pendência
      try {
        await emailService.enviarEmailPendenciaAprovacao(usuario.email, usuario.nome);
      } catch (emailError) {
        console.error('⚠️  Falha ao enviar email transacional');
      }

      // Avisar a equipe. Antes só saía o socket — quem não estivesse com o
      // painel aberto no exato momento não ficava sabendo do credenciamento
      // pendente, e o e-mail `enviarEmailNovoVetAdmin`, que já existia pronto,
      // nunca era chamado por ninguém.
      void avisarNovoVeterinario({
        tenantId: tenant_id,
        io: req.app.get('io'),
        veterinario: {
          id: usuario.id,
          tenant_id,
          nome: usuario.nome,
          email: usuario.email,
          cidade: usuario.cidade,
          crmv,
          especialidade
        }
      });
    } else if (tipo_usuario === 'tutor') {
      // Email de boas-vindas
      try {
        await emailService.enviarEmailBoasVindasTutor(usuario.email, usuario.nome);
      } catch (emailError) {
        console.error('⚠️  Falha ao enviar email transacional');
      }
    }

    // Contas que exigem verificação não recebem sessão operacional no cadastro.
    const ip = ipDaRequisicao(req);
    const userAgent = req.headers['user-agent'];

    // Veterinário nunca recebe sessão no cadastro: a área profissional abre
    // só depois do e-mail confirmado E da aprovação do admin (política v1.0).
    const verificationRequired = String(process.env.REQUIRE_EMAIL_VERIFICATION).toLowerCase() === 'true'
      || tipo_usuario === 'veterinario';
    const access_token = verificationRequired ? null : jwt.sign(
      { id: usuario.id, tipo_usuario: usuario.tipo_usuario, tenant_id },
      process.env.JWT_SECRET as string,
      { expiresIn: '7d' }
    );
    const refresh_token = verificationRequired
      ? null
      : await TokenService.createRefreshToken(usuario.id, ip, userAgent);

    // Criar token de verificação de email
    const verificationToken = await TokenService.createEmailVerificationToken(email, tenant_id);

    // Enviar email de verificação
    try {
      const verifyUrl = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;
      await emailService.enviarEmailVerificacao(email, nome, verifyUrl);
    } catch (emailError) {
      console.error('⚠️  Falha ao enviar email de verificação');
    }

    // Log de auditoria
    await AuditService.logRegister(usuario.id, tenant_id, tipo_usuario, ip, userAgent);

    trackConversion('CompleteRegistration', {
      email, phone: telefone, ip, userAgent
    }, { content_name: tipo_usuario }).catch(() => {});

    return res.status(201).json({
      message: tipo_usuario === 'veterinario'
        ? 'Cadastro realizado! Aguarde aprovação do administrador. Verifique seu email para ativar sua conta.'
        : 'Cadastro realizado com sucesso! Verifique seu email para ativar sua conta.',
      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        tipo_usuario: usuario.tipo_usuario,
        cidade: usuario.cidade,
        email_verificado: false
      },
      access_token,
      refresh_token
    });
  });

  // Login de usuário (dados já validados pelo middleware Zod)
  login = asyncHandler(async (req: Request, res: Response) => {
    console.log('🔵 [AUTH] Tentativa de login');
    const { email, senha, tenant_slug }: LoginBody = req.body;

    // Buscar tenant se fornecido
    let tenant_id: string | null = null;
    if (tenant_slug) {
      const tenant = await prisma.tenant.findUnique({
        where: { slug: tenant_slug }
      });

      if (!tenant) {
        throw new NotFoundError('Organização não encontrada');
      }

      if (tenant.status === 'cancelado') {
        throw new ForbiddenError('Esta organização foi cancelada');
      }

      if (tenant.status === 'suspenso') {
        throw new ForbiddenError('Esta organização está suspensa');
      }

      tenant_id = tenant.id;
    }

    // Buscar usuário (considerando tenant)
    const whereClause: Prisma.UsuarioWhereInput = { email };
    if (tenant_id) {
      whereClause.tenant_id = tenant_id;
    }

    let usuario: UsuarioDoLogin | null | undefined;
    if (tenant_id) {
      usuario = await prisma.usuario.findFirst({ where: whereClause, include: includeLogin });
    } else {
      const candidates = await prisma.usuario.findMany({
        where: { email },
        take: 2,
        include: includeLogin
      });
      if (candidates.length > 1) {
        throw new UnauthorizedError('Informe a organização para concluir o login');
      }
      [usuario] = candidates;
    }

    if (!usuario) {
      // Log de tentativa de login falhada
      const ip = ipDaRequisicao(req);
      const userAgent = req.headers['user-agent'];
      await AuditService.logLoginFailed(email, tenant_id, ip, userAgent, 'Usuário não encontrado');

      throw new UnauthorizedError('Credenciais inválidas');
    }

    // Verificar senha. Conta criada pelo Google não tem senha: `bcrypt.compare`
    // com hash nulo lança e virava 500 — a resposta certa é o mesmo 401.
    const senhaValida = usuario.senha ? await bcrypt.compare(senha, usuario.senha) : false;
    if (!senhaValida) {
      // Log de tentativa de login falhada
      const ip = ipDaRequisicao(req);
      const userAgent = req.headers['user-agent'];
      await AuditService.logLoginFailed(email, usuario.tenant_id, ip, userAgent, 'Senha incorreta');

      throw new UnauthorizedError('Credenciais inválidas');
    }

    // Política de acesso v1.0 (ver politica-acesso.service): tutor entra;
    // veterinário só com e-mail confirmado e aprovação do admin.
    {
      const config = usuario.tipo_usuario === 'veterinario'
        ? await prisma.configuracaoTenant.findUnique({ where: { tenant_id: String(usuario.tenant_id) } })
        : null;
      const bloqueio = motivoDeBloqueio(usuario, { requerAprovacaoVet: config ? config.requer_aprovacao_vet : true });
      if (bloqueio) {
        const ip = ipDaRequisicao(req);
        const userAgent = req.headers['user-agent'];
        await AuditService.logLoginFailed(email, usuario.tenant_id, ip, userAgent, bloqueio);
        throw Object.assign(new ForbiddenError(MENSAGENS_ACESSO[bloqueio]), { codigo: bloqueio });
      }
    }

    // Gerar tokens (incluindo tenant_id)
    const ip = ipDaRequisicao(req);
    const userAgent = req.headers['user-agent'];

    const access_token = jwt.sign(
      {
        id: usuario.id,
        tipo_usuario: usuario.tipo_usuario,
        tenant_id: usuario.tenant_id
      },
      process.env.JWT_SECRET as string,
      { expiresIn: '7d' }
    );

    const refresh_token = await TokenService.createRefreshToken(usuario.id, ip, userAgent);

    // Log de auditoria
    await AuditService.logLogin(usuario.id, usuario.tenant_id, ip, userAgent);

    // Remover senha
    const { senha: _senha, ...usuarioSemSenha } = usuario;

    console.log('✅ [AUTH] Login bem-sucedido');
    return res.json({
      message: 'Login realizado com sucesso!',
      usuario: usuarioSemSenha,
      access_token,
      refresh_token
    });
  });

  // Obter perfil do usuário logado
  me = asyncHandler(async (req: Request, res: Response) => {
    const usuario = await prisma.usuario.findUnique({
      where: { id: req.userId },
      include: {
        veterinario: true,
        pets: true,
        tenant: {
          select: {
            id: true,
            nome: true,
            slug: true,
            logo: true,
            status: true,
            plano: true
          }
        }
      }
    });

    if (!usuario) {
      throw new NotFoundError('Usuário não encontrado');
    }

    // Remover senha
    const { senha: _senha, ...usuarioSemSenha } = usuario;

    return res.json(usuarioSemSenha);
  });

  // ═══════════════════════════════════════════════════════
  // REFRESH TOKEN
  // ═══════════════════════════════════════════════════════

  /**
   * Renovar token de acesso usando refresh token
   * POST /api/v1/auth/refresh
   */
  refreshToken = asyncHandler(async (req: Request, res: Response) => {
    const { refresh_token }: RefreshTokenBody = req.body;
    const ip = ipDaRequisicao(req);
    const userAgent = req.headers['user-agent'];

    // Validar refresh token
    const usuarioId = await TokenService.validateRefreshToken(refresh_token);

    // Buscar usuário
    const usuario = await prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: {
        id: true,
        nome: true,
        email: true,
        tipo_usuario: true,
        tenant_id: true,
        email_verificado: true,
        veterinario: {
          select: { aprovado_admin: true, status_credenciamento: true }
        },
        tenant: {
          select: {
            status: true,
            expira_em: true,
            configuracoes: { select: { requer_aprovacao_vet: true } }
          }
        }
      }
    });

    if (!usuario) {
      throw new UnauthorizedError('Usuário não encontrado');
    }

    // Mesma política do login: quem perdeu o direito de entrar (vet suspenso,
    // e-mail ainda não confirmado) não renova sessão — e perde os refresh
    // tokens que já tinha.
    try {
      garantirPodeEntrar(usuario, { requerAprovacaoVet: usuario.tenant?.configuracoes?.requer_aprovacao_vet });
    } catch (erro) {
      await TokenService.revokeUserRefreshTokens(usuario.id);
      throw erro;
    }

    // Verificar se tenant está ativo
    if (usuario.tenant && usuario.tenant.status !== 'ativo' && usuario.tenant.status !== 'trial') {
      await TokenService.revokeUserRefreshTokens(usuario.id);
      throw new ForbiddenError('Sua organização não está ativa');
    }

    if (usuario.tenant?.expira_em && new Date(usuario.tenant.expira_em) < new Date()) {
      await TokenService.revokeUserRefreshTokens(usuario.id);
      throw new ForbiddenError('O plano da organização expirou');
    }

    // Gerar novo access token
    const newAccessToken = jwt.sign(
      {
        id: usuario.id,
        tipo_usuario: usuario.tipo_usuario,
        tenant_id: usuario.tenant_id
      },
      process.env.JWT_SECRET as string,
      { expiresIn: '7d' }
    );

    // Gerar novo refresh token
    const newRefreshToken = await TokenService.createRefreshToken(usuarioId, ip, userAgent);

    // Revogar refresh token antigo
    await TokenService.revokeRefreshToken(refresh_token);

    return res.json({
      message: 'Token renovado com sucesso',
      access_token: newAccessToken,
      refresh_token: newRefreshToken
    });
  });

  // ═══════════════════════════════════════════════════════
  // RECUPERAÇÃO DE SENHA
  // ═══════════════════════════════════════════════════════

  /**
   * Solicitar reset de senha
   * POST /api/v1/auth/forgot-password
   */
  forgotPassword = asyncHandler(async (req: Request, res: Response) => {
    const { email, tenant_slug }: ForgotPasswordBody = req.body;
    const ip = ipDaRequisicao(req);

    // Buscar tenant se fornecido
    let tenant_id: string | null = null;
    if (tenant_slug) {
      const tenant = await prisma.tenant.findUnique({
        where: { slug: tenant_slug }
      });

      if (tenant) {
        tenant_id = tenant.id;
      }
    }

    // Buscar usuário
    const whereClause: Prisma.UsuarioWhereInput = { email };
    if (tenant_id) {
      whereClause.tenant_id = tenant_id;
    }

    const usuario = await prisma.usuario.findFirst({
      where: whereClause
    });

    // Sempre retornar sucesso (segurança - não revelar se email existe)
    if (!usuario) {
      return res.json({
        message: 'Se o email existir, você receberá instruções para resetar sua senha'
      });
    }

    // Gerar token de reset. Sem `tenant_slug` o token nasce sem tenant — a
    // coluna é `String?` e o serviço trata o nulo; só a assinatura dele ainda
    // pede `string`.
    const token = await TokenService.createPasswordResetToken(email, tenant_id as string, ip);

    // Enviar email com token
    try {
      const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;

      await emailService.enviarEmailResetSenha(email, usuario.nome, resetUrl);
      console.log('📧 [AUTH] Email de reset solicitado');
    } catch (emailError) {
      console.error('❌ [AUTH] Falha ao enviar email de reset');
      // Continuar mesmo se email falhar
    }

    return res.json({
      message: 'Se o email existir, você receberá instruções para resetar sua senha'
    });
  });

  /**
   * Resetar senha usando token
   * POST /api/v1/auth/reset-password
   */
  resetPassword = asyncHandler(async (req: Request, res: Response) => {
    const { token, senha }: ResetPasswordBody = req.body;
    const ip = ipDaRequisicao(req);
    const userAgent = req.headers['user-agent'];

    // Validar token
    const { email, tenant_id } = await TokenService.validatePasswordResetToken(token);

    // Buscar usuário
    const whereClause: Prisma.UsuarioWhereInput = { email };
    if (tenant_id) {
      whereClause.tenant_id = tenant_id;
    }

    const usuario = await prisma.usuario.findFirst({
      where: whereClause
    });

    if (!usuario) {
      throw new NotFoundError('Usuário não encontrado');
    }

    // Hash da nova senha
    const senhaHash = await bcrypt.hash(senha, 10);

    // Atualizar senha. `sessoes_revogadas_em` é o que realmente expulsa quem já
    // estava logado: revogar refresh token sozinho não invalida o access token
    // de 7 dias, então quem tinha roubado a sessão continuava dentro DEPOIS da
    // troca de senha — exatamente o cenário em que se troca a senha.
    await prisma.usuario.update({
      where: { id: usuario.id },
      data: { senha: senhaHash, sessoes_revogadas_em: new Date() }
    });

    // Marcar token como usado
    await TokenService.markPasswordResetTokenAsUsed(token);

    // Revogar todos os refresh tokens (forçar novo login)
    await TokenService.revokeUserRefreshTokens(usuario.id);

    // Log de auditoria
    await AuditService.logPasswordReset(usuario.id, tenant_id, ip, userAgent);

    return res.json({
      message: 'Senha resetada com sucesso. Faça login com sua nova senha'
    });
  });

  /**
   * Alterar senha (usuário autenticado)
   * POST /api/v1/auth/change-password
   */
  changePassword = asyncHandler(async (req: Request, res: Response) => {
    const { senha_atual, senha_nova }: ChangePasswordBody = req.body;
    const usuarioId = String(req.userId);
    const ip = ipDaRequisicao(req);
    const userAgent = req.headers['user-agent'];

    // Buscar usuário
    const usuario = await prisma.usuario.findUnique({
      where: { id: usuarioId }
    });

    if (!usuario) {
      throw new NotFoundError('Usuário não encontrado');
    }

    // Verificar senha atual. Conta sem senha (criada pelo Google) não tem o
    // que conferir: o mesmo 401 do login, em vez do `bcrypt.compare` lançando.
    const senhaValida = usuario.senha ? await bcrypt.compare(senha_atual, usuario.senha) : false;
    if (!senhaValida) {
      throw new UnauthorizedError('Senha atual incorreta');
    }

    // Hash da nova senha
    const senhaHash = await bcrypt.hash(senha_nova, 10);

    // Atualizar senha e derrubar as sessões abertas nos outros aparelhos —
    // inclusive os access tokens já emitidos, que a revogação de refresh token
    // não alcança.
    await prisma.usuario.update({
      where: { id: usuarioId },
      data: { senha: senhaHash, sessoes_revogadas_em: new Date() }
    });

    // Revogar todos os refresh tokens (forçar novo login em outros dispositivos)
    await TokenService.revokeUserRefreshTokens(usuarioId);

    // Log de auditoria
    await AuditService.logPasswordChange(usuarioId, usuario.tenant_id, ip, userAgent);

    // Aviso de senha alterada. O template existia pronto e ninguém o chamava —
    // e é o e-mail que denuncia invasão: quem não trocou a senha descobre que
    // alguém trocou. Best-effort, como todo e-mail.
    emailService.enviarEmailConfirmacaoMudancaSenha(
      usuario.email,
      usuario.nome,
      new Date().toLocaleString('pt-BR')
    ).catch((erro: unknown) => console.error('⚠️  Aviso de senha alterada não saiu (ignorado):', detalheDoErro(erro)));

    return res.json({
      message: 'Senha alterada com sucesso'
    });
  });

  // ═══════════════════════════════════════════════════════
  // VERIFICAÇÃO DE EMAIL
  // ═══════════════════════════════════════════════════════

  /**
   * Verificar email usando token
   * POST /api/v1/auth/verify-email
   */
  verifyEmail = asyncHandler(async (req: Request, res: Response) => {
    const { token }: VerifyEmailBody = req.body;

    // Validar token
    const { email, tenant_id } = await TokenService.validateEmailVerificationToken(token);

    // Buscar usuário
    const whereClause: Prisma.UsuarioWhereInput = { email };
    if (tenant_id) {
      whereClause.tenant_id = tenant_id;
    }

    const usuario = await prisma.usuario.findFirst({
      where: whereClause
    });

    if (!usuario) {
      throw new NotFoundError('Usuário não encontrado');
    }

    // Marcar email como verificado
    await prisma.usuario.update({
      where: { id: usuario.id },
      data: { email_verificado: true }
    });

    // Log de auditoria
    await AuditService.logEmailVerification(usuario.id, tenant_id, email);

    return res.json({
      message: 'Email verificado com sucesso'
    });
  });

  /**
   * Reenviar email de verificação
   * POST /api/v1/auth/resend-verification
   */
  resendVerification = asyncHandler(async (req: Request, res: Response) => {
    const { email, tenant_slug }: ResendVerificationBody = req.body;

    // Buscar tenant se fornecido
    let tenant_id: string | null = null;
    if (tenant_slug) {
      const tenant = await prisma.tenant.findUnique({
        where: { slug: tenant_slug }
      });

      if (tenant) {
        tenant_id = tenant.id;
      }
    }

    // Buscar usuário
    const whereClause: Prisma.UsuarioWhereInput = { email };
    if (tenant_id) {
      whereClause.tenant_id = tenant_id;
    }

    const usuario = await prisma.usuario.findFirst({
      where: whereClause
    });

    // Sempre retornar sucesso (segurança)
    if (!usuario) {
      return res.json({
        message: 'Se o email existir e não estiver verificado, você receberá um novo link'
      });
    }

    // Se já verificado, não fazer nada
    if (usuario.email_verificado) {
      return res.json({
        message: 'Se o email existir e não estiver verificado, você receberá um novo link'
      });
    }

    // Gerar novo token (mesma ressalva do reset: sem tenant, `tenant_id` vai nulo).
    const token = await TokenService.createEmailVerificationToken(email, tenant_id as string);

    // Enviar email
    try {
      const verifyUrl = `${process.env.FRONTEND_URL}/verify-email?token=${token}`;

      await emailService.enviarEmailVerificacao(email, usuario.nome, verifyUrl);
      console.log('📧 [AUTH] Email de verificação solicitado');
    } catch (emailError) {
      console.error('❌ [AUTH] Falha ao enviar email de verificação');
    }

    return res.json({
      message: 'Se o email existir e não estiver verificado, você receberá um novo link'
    });
  });

  // ═══════════════════════════════════════════════════════
  // LOGOUT
  // ═══════════════════════════════════════════════════════

  /**
   * Logout do usuário
   * POST /api/v1/auth/logout
   */
  logout = asyncHandler(async (req: Request, res: Response) => {
    const token = req.headers.authorization?.split(' ')[1];
    const usuarioId = String(req.userId);
    const ip = ipDaRequisicao(req);
    const userAgent = req.headers['user-agent'];

    // Adicionar token à blacklist
    if (token) {
      await TokenService.blacklistToken(token, usuarioId, 'logout');
    }

    // Revogar refresh token se fornecido
    const refresh_token: unknown = req.body?.refresh_token;
    if (refresh_token) {
      try {
        await TokenService.revokeRefreshToken(String(refresh_token));
      } catch (error) {
        // Ignorar se refresh token já foi revogado
      }
    }

    // Log de auditoria
    const usuario = await prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: { tenant_id: true }
    });

    await AuditService.logLogout(usuarioId, usuario?.tenant_id, ip, userAgent);

    return res.json({
      message: 'Logout realizado com sucesso'
    });
  });

  // GET /auth/facebook — redireciona pro diálogo de login do Facebook, com estado CSRF em cookie HttpOnly
  facebookRedirect = (req: Request, res: Response) => {
    const appId = process.env.META_APP_ID;
    if (!appId || !process.env.META_APP_SECRET) {
      return res.status(503).json({ error: 'Login com Facebook ainda não configurado' });
    }
    const tenant_slug = req.query.tenant_slug || process.env.PUBLIC_TENANT_SLUG || 'saudepet';

    const csrfState = crypto.randomBytes(32).toString('hex');
    res.cookie('fb_oauth_state', csrfState, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 10 * 60 * 1000
    });

    const state = Buffer.from(JSON.stringify({ tenant_slug, csrf: csrfState })).toString('base64url');
    const redirectUri = `${process.env.API_URL || process.env.FRONTEND_URL}/api/v1/auth/facebook/callback`;

    const authUrl = new URL('https://www.facebook.com/v21.0/dialog/oauth');
    authUrl.searchParams.set('client_id', appId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('scope', 'email,public_profile');

    return res.redirect(authUrl.toString());
  };

  // GET /auth/facebook/callback — valida CSRF, cria/vincula AuthIdentity e devolve um exchange code descartável
  facebookCallback = asyncHandler(async (req: Request, res: Response) => {
    const { code, state, error: fbError } = req.query;
    const frontendLoginUrl = `${process.env.FRONTEND_URL}/login`;

    const savedCsrfState = (req as RequestComCookies).cookies?.fb_oauth_state;
    res.clearCookie('fb_oauth_state');

    if (fbError || !code) {
      return res.redirect(`${frontendLoginUrl}?fb_error=acesso_negado`);
    }

    let tenant_slug = process.env.PUBLIC_TENANT_SLUG || 'saudepet';
    try {
      const decoded = JSON.parse(Buffer.from(String(state), 'base64url').toString('utf-8'));
      if (!savedCsrfState || !decoded.csrf || decoded.csrf !== savedCsrfState) {
        console.error('⚠️ [CSRF ALERT] Estado OAuth do Facebook ausente, inválido ou adulterado.');
        return res.redirect(`${frontendLoginUrl}?fb_error=csrf_invalid`);
      }
      if (decoded.tenant_slug) tenant_slug = decoded.tenant_slug;
    } catch (_error) {
      return res.redirect(`${frontendLoginUrl}?fb_error=csrf_invalid`);
    }

    const redirectUri = `${process.env.API_URL || process.env.FRONTEND_URL}/api/v1/auth/facebook/callback`;

    try {
      const tokenResponse = await axios.get('https://graph.facebook.com/v21.0/oauth/access_token', {
        params: {
          client_id: process.env.META_APP_ID,
          client_secret: process.env.META_APP_SECRET,
          redirect_uri: redirectUri,
          code
        }
      });
      const fbAccessToken = tokenResponse.data.access_token;

      const profileResponse = await axios.get('https://graph.facebook.com/me', {
        params: { fields: 'id,name,email', access_token: fbAccessToken }
      });
      const fbProfile: PerfilFacebook = profileResponse.data;

      const tenant = await prisma.tenant.findUnique({ where: { slug: tenant_slug } });
      if (!tenant || tenant.status === 'cancelado' || tenant.status === 'suspenso') {
        return res.redirect(`${frontendLoginUrl}?fb_error=organizacao_indisponivel`);
      }

      const usuario = await this._processFacebookUser({ req, tenant, fbProfile });

      const rawExchangeCode = crypto.randomBytes(32).toString('hex');
      const codeHash = crypto.createHash('sha256').update(rawExchangeCode).digest('hex');

      await prisma.authExchangeCode.create({
        data: {
          tenant_id: String(usuario.tenant_id),
          code_hash: codeHash,
          usuario_id: usuario.id,
          expires_at: new Date(Date.now() + 60 * 1000)
        }
      });

      return res.redirect(`${frontendLoginUrl}?exchange_code=${rawExchangeCode}`);
    } catch (error) {
      console.error('❌ [AUTH] Falha no login com Facebook:', detalheDoErro(error));
      return res.redirect(`${frontendLoginUrl}?fb_error=falha_login`);
    }
  });

  // Auxiliar: gerencia identidade federada do Facebook via AuthIdentity (escopada por tenant_id)
  async _processFacebookUser(
    { req, tenant, fbProfile }: { req: Request; tenant: Tenant; fbProfile: PerfilFacebook }
  ): Promise<Usuario> {
    const tenant_id = tenant.id;

    const identity = await prisma.authIdentity.findUnique({
      where: {
        tenant_id_provider_provider_user_id: {
          tenant_id,
          provider: 'facebook',
          provider_user_id: fbProfile.id
        }
      },
      include: { usuario: true }
    });

    if (identity) {
      await AuditService.logLogin(identity.usuario.id, tenant_id, req.ip, req.headers['user-agent']);
      return identity.usuario;
    }

    let usuario = fbProfile.email
      ? await prisma.usuario.findFirst({ where: { tenant_id, email: fbProfile.email } })
      : null;

    if (usuario) {
      await prisma.authIdentity.create({
        data: { tenant_id, usuario_id: usuario.id, provider: 'facebook', provider_user_id: fbProfile.id }
      });
      await AuditService.logLogin(usuario.id, tenant_id, req.ip, req.headers['user-agent']);
      return usuario;
    }

    // Cadastro público via Facebook segue a mesma regra do cadastro normal: só tutor.
    usuario = await prisma.usuario.create({
      data: {
        tenant_id,
        nome: fbProfile.name || 'Usuário Facebook',
        email: fbProfile.email || `fb-${fbProfile.id}@sem-email.saudepet`,
        senha: null,
        tipo_usuario: 'tutor',
        cidade: (await prisma.configuracaoTenant.findUnique({ where: { tenant_id }, select: { cidade_padrao: true } }))?.cidade_padrao
          || process.env.CIDADE_INICIAL
          || 'Não informado',
        email_verificado: Boolean(fbProfile.email),
        identities: {
          create: { tenant_id, provider: 'facebook', provider_user_id: fbProfile.id }
        }
      }
    });
    await AuditService.logRegister(usuario.id, tenant_id, 'tutor', req.ip, req.headers['user-agent']);
    return usuario;
  }
}

const authController = new AuthController();

module.exports = authController;
export default authController;
