import crypto from 'crypto';
import type { Request, Response } from 'express';
import type { z } from 'zod';
import type { Prisma } from '@prisma/client';
import prisma from '../config/database';
import {
  NotFoundError,
  ConflictError,
  ValidationError,
  ForbiddenError,
  asyncHandler
} from '../middleware/error.middleware';
import { addTenantFilter } from '../middleware/tenant.middleware';
import { uploadBuffer, deleteObject, keyFromUrl } from '../config/r2';
import TokenService from '../services/token.service';
import AuditService from '../services/audit.service';
import emailService from '../services/email.service';
import { exportarDados, impedimentosParaEncerrar, encerrarConta } from '../services/dados-pessoais.service';
import { buscarVinculoProfissional } from '../services/vinculo-atendimento.service';
import type { createUserSchema, updateProfileSchema } from '../schemas/user.schema';

import bcrypt from 'bcryptjs';
import { urlDoSite } from '../config/site';

// Corpos já validados pelo `validate(schema)` da rota.
type CriarUsuarioBody = z.infer<typeof createUserSchema>;
type UpdateProfileBody = z.infer<typeof updateProfileSchema>;

/** Corpo de `encerrarMinhaConta`; a rota não valida com Zod. */
type EncerrarContaBody = { senha?: string; motivo?: string };

/**
 * `addTenantFilter` já devolve `tenant_id` como texto opcional. O apelido aqui
 * existe só para fixar `T` no tipo de `where` do modelo consultado, para que o
 * Prisma continue conferindo os outros campos do filtro.
 */
const escopoDoTenant = <T extends Record<string, unknown>>(req: Request, where: T = {} as T) =>
  addTenantFilter(req, where) as T & { tenant_id?: string };

class UserController {
  /**
   * Estatísticas de usuários da organização.
   *
   * A versão anterior contava o total e devolvia `active = total` com
   * `inactive = 0` fixo — o painel do admin sempre mostrava zero inativos,
   * inclusive depois de desativar alguém. `Usuario.ativo` existe desde o
   * primeiro schema e é o que o próprio `authMiddleware` usa para barrar o
   * login; faltava só somar.
   *
   * As três contagens saem numa transação para não devolver números de
   * instantes diferentes (total de agora, ativos de um segundo atrás).
   */
  getStats = asyncHandler(async (req: Request, res: Response) => {
    const [total, active] = await prisma.$transaction([
      prisma.usuario.count({ where: escopoDoTenant(req) }),
      prisma.usuario.count({ where: escopoDoTenant(req, { ativo: true }) })
    ]);

    return res.json({ total, active, inactive: total - active });
  });

  // Listar todos os usuários
  listarTodos = asyncHandler(async (req: Request, res: Response) => {
    const usuarios = await prisma.usuario.findMany({
      where: escopoDoTenant(req),
      select: {
        id: true,
        nome: true,
        email: true,
        telefone: true,
        tipo_usuario: true,
        cidade: true,
        criado_em: true,
        foto_perfil: true
      },
      orderBy: {
        criado_em: 'desc'
      }
    });

    return res.json(usuarios);
  });

  /**
   * Perfil de um usuário.
   *
   * Três níveis, e a diferença entre eles importa:
   *
   * - **Admin ou você mesmo** — o cadastro inteiro.
   * - **Quem divide um atendimento com você** — só o que uma consulta exige:
   *   nome, foto, cidade e telefone. É o que o veterinário precisa para saber
   *   com quem fala e para ligar, e o que o tutor precisa para o mesmo.
   * - **Qualquer outro** — nada.
   *
   * O nível do meio não existia, e o efeito era esta rota (`/tutores/:id`,
   * cujo próprio comentário diz "para mensagens/perfil") recusar o chat do
   * atendimento com "Você não tem permissão para acessar este perfil". O
   * veterinário abria a conversa com o tutor que ele estava atendendo e batia
   * num 403 — com o campo de mensagem desabilitado, sem saber por quê.
   *
   * O que o participante NÃO recebe, e é de propósito: e-mail, data de
   * nascimento, foto de capa e a lista de pets. O atendimento já carrega o pet
   * de que se trata; devolver a coleção inteira daria a qualquer veterinário
   * que já atendeu uma vez o inventário de animais daquela casa.
   */
  buscarPorId = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    const usuario = await prisma.usuario.findFirst({
      where: escopoDoTenant(req, { id }),
      select: {
        id: true,
        nome: true,
        email: true,
        telefone: true,
        tipo_usuario: true,
        cidade: true,
        sobre: true,
        data_nascimento: true,
        foto_perfil: true,
        foto_capa: true,
        criado_em: true,
        veterinario: true,
        pets: true
      }
    });

    if (!usuario) {
      throw new NotFoundError('Usuário não encontrado');
    }

    const ehAdmin = req.userType === 'admin' || req.userType === 'super_admin';
    if (ehAdmin || usuario.id === req.userId) {
      return res.json(usuario);
    }

    if (await buscarVinculoProfissional(String(req.tenantId), req.userId, usuario.id)) {
      return res.json({
        id: usuario.id,
        nome: usuario.nome,
        telefone: usuario.telefone,
        tipo_usuario: usuario.tipo_usuario,
        cidade: usuario.cidade,
        sobre: usuario.sobre,
        foto_perfil: usuario.foto_perfil
      });
    }

    throw new ForbiddenError('Você não tem permissão para acessar este perfil');
  });

  // Criar usuário (admin)
  criar = asyncHandler(async (req: Request, res: Response) => {
    const body: CriarUsuarioBody = req.body;
    const { nome, email, telefone, senha, tipo_usuario, cidade, crmv, especialidade } = body;
    if (!req.tenantId && !req.isSuperAdmin) throw new ForbiddenError('Organização não identificada');
    if (!req.isSuperAdmin && ['admin', 'super_admin'].includes(tipo_usuario)) {
      throw new ForbiddenError('Apenas super administradores podem criar perfis administrativos');
    }
    const targetTenantId = tipo_usuario === 'super_admin'
      ? null
      : (req.isSuperAdmin ? body.tenant_id : req.tenantId);
    if (!targetTenantId && tipo_usuario !== 'super_admin') throw new ValidationError('tenant_id é obrigatório');

    if (targetTenantId) {
      const tenant = await prisma.tenant.findFirst({
        where: { id: targetTenantId, status: { in: ['ativo', 'trial'] } },
        select: { id: true }
      });
      if (!tenant) throw new NotFoundError('Organização não encontrada');
    }

    // Verificar se email já existe
    const usuarioExiste = await prisma.usuario.findFirst({
      where: { tenant_id: targetTenantId || null, email }
    });

    if (usuarioExiste) {
      throw new ConflictError('Email já cadastrado');
    }

    // Hash da senha
    const senhaHash = await bcrypt.hash(senha, 10);

    const usuario = await prisma.$transaction(async (tx) => {
      const criado = await tx.usuario.create({
        data: {
          tenant_id: targetTenantId,
          nome,
          email,
          telefone,
          senha: senhaHash,
          tipo_usuario,
          cidade,
          email_verificado: false
        },
        select: {
          id: true,
          nome: true,
          email: true,
          telefone: true,
          tipo_usuario: true,
          cidade: true,
          criado_em: true
        }
      });

      if (tipo_usuario === 'veterinario') {
        await tx.veterinario.create({
          data: {
            // Para veterinário o tenant é obrigatório e já foi exigido acima;
            // o tipo não acompanha essa dedução.
            tenant_id: String(targetTenantId),
            usuario_id: criado.id,
            crmv: String(crmv),
            especialidade: String(especialidade),
            aprovado_admin: false
          }
        });
      }

      return criado;
    });

    return res.status(201).json(usuario);
  });

  // Atualizar perfil do usuário logado
  updateProfile = asyncHandler(async (req: Request, res: Response) => {
    const userId = String(req.userId);
    const { nome, email, telefone, cidade, sobre, data_nascimento }: UpdateProfileBody = req.body;

    const currentUser = await prisma.usuario.findFirst({
      where: { id: userId, tenant_id: req.tenantId },
      select: { email: true }
    });
    if (!currentUser) throw new NotFoundError('Usuário não encontrado');
    const emailChanged = Boolean(email && email !== currentUser.email);

    // Verificar se email já está em uso por outro usuário
    if (email) {
      const emailEmUso = await prisma.usuario.findFirst({
        where: {
          tenant_id: req.user?.tenant_id,
          email,
          NOT: { id: userId }
        }
      });

      if (emailEmUso) {
        throw new ConflictError('Email já está em uso');
      }
    }

    const usuario = await prisma.usuario.update({
      where: { id: userId },
      data: {
        ...(nome ? { nome } : {}),
        ...(email ? { email } : {}),
        ...(emailChanged ? { email_verificado: false } : {}),
        ...(telefone ? { telefone } : {}),
        ...(cidade ? { cidade } : {}),
        ...(sobre !== undefined ? { sobre } : {}),
        ...(data_nascimento !== undefined ? { data_nascimento } : {})
      },
      select: {
        id: true,
        nome: true,
        email: true,
        telefone: true,
        tipo_usuario: true,
        cidade: true,
        sobre: true,
        data_nascimento: true,
        foto_perfil: true,
        foto_capa: true
      }
    });

    if (emailChanged) {
      await TokenService.revokeUserRefreshTokens(userId);
      const token = await TokenService.createEmailVerificationToken(String(email), String(req.tenantId));
      try {
        const verifyUrl = urlDoSite(`/verificar-email?token=${token}`);
        await emailService.enviarEmailVerificacao(String(email), usuario.nome, verifyUrl);
      } catch (error) {
        console.warn('[USER] Não foi possível enviar a verificação do novo email');
      }
    }

    return res.json(usuario);
  });

  // Upload de foto de perfil ou capa (multipart/form-data, campo "foto")
  uploadFoto = asyncHandler(async (req: Request, res: Response) => {
    const userId = String(req.userId);
    const tipo = req.params.tipo; // 'perfil' ou 'capa'

    if (!['perfil', 'capa'].includes(tipo)) {
      throw new ValidationError('Tipo de foto inválido. Use "perfil" ou "capa"');
    }

    if (!req.file) {
      throw new ValidationError('Nenhum arquivo enviado');
    }

    const campo = tipo === 'perfil' ? 'foto_perfil' : 'foto_capa';

    const usuarioAtual = await prisma.usuario.findUnique({
      where: { id: userId },
      select: { foto_perfil: true, foto_capa: true }
    });

    const ext = req.file.originalname.split('.').pop();
    const key = `usuarios/${userId}/${campo}-${crypto.randomUUID()}.${ext}`;
    const url = await uploadBuffer(req.file.buffer, key, req.file.mimetype);

    const dados: Prisma.UsuarioUpdateInput = campo === 'foto_perfil' ? { foto_perfil: url } : { foto_capa: url };
    const usuario = await prisma.usuario.update({
      where: { id: userId },
      data: dados,
      select: {
        id: true,
        nome: true,
        foto_perfil: true,
        foto_capa: true
      }
    });

    // Remove a foto antiga do R2, se existia
    const oldKey = keyFromUrl(usuarioAtual?.[campo] || '');
    if (oldKey) {
      await deleteObject(oldKey).catch(() => {});
    }

    return res.json({ usuario });
  });

  // Deletar usuário
  /**
   * Baixar meus dados (LGPD, art. 18, II e V)
   * GET /api/v1/users/meus-dados
   *
   * A Política de Privacidade promete acesso e portabilidade e não existia
   * endpoint nenhum: quem pedisse pelo `sac@` dependia de alguém abrir o banco
   * à mão.
   */
  exportarMeusDados = asyncHandler(async (req: Request, res: Response) => {
    const pacote = await exportarDados(String(req.userId), String(req.tenantId));

    if (!pacote) {
      throw new NotFoundError('Usuário não encontrado');
    }

    // Pedir os próprios dados é um evento que merece trilha: é assim que se
    // demonstra o atendimento ao titular se ele reclamar depois.
    AuditService.logForensicEvent({
      req,
      tenantId: req.tenantId,
      entityType: 'usuario',
      entityId: req.userId,
      action: 'lgpd.dados_exportados',
      motivo: 'Titular baixou os próprios dados'
    });

    const carimbo = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=saudepet-meus-dados-${carimbo}.json`);
    return res.send(JSON.stringify(pacote, null, 2));
  });

  /**
   * O que impede o encerramento agora
   * GET /api/v1/users/minha-conta/pendencias
   */
  pendenciasDaConta = asyncHandler(async (req: Request, res: Response) => {
    const impedimentos = await impedimentosParaEncerrar(String(req.userId), String(req.tenantId));
    return res.json({ pode_encerrar: impedimentos.length === 0, impedimentos });
  });

  /**
   * Encerrar minha conta (LGPD, art. 18, VI)
   * POST /api/v1/users/minha-conta/encerrar
   *
   * Anonimiza os dados pessoais e preserva o registro clínico do pet e o
   * registro fiscal dos pagamentos — ver `dados-pessoais.service`.
   */
  encerrarMinhaConta = asyncHandler(async (req: Request, res: Response) => {
    const { senha, motivo }: EncerrarContaBody = req.body || {};

    const usuario = await prisma.usuario.findFirst({
      where: { id: req.userId, tenant_id: req.tenantId },
      select: { id: true, senha: true, tipo_usuario: true }
    });

    if (!usuario) {
      throw new NotFoundError('Usuário não encontrado');
    }

    // Encerrar conta é irreversível: exigir a senha impede que uma sessão
    // esquecida num aparelho emprestado apague a vida de alguém no produto.
    if (usuario.senha) {
      if (!senha) {
        throw new ValidationError('Confirme sua senha para encerrar a conta.');
      }
      const confere = await bcrypt.compare(senha, usuario.senha);
      if (!confere) {
        throw new ForbiddenError('Senha incorreta.');
      }
    }

    // Veterinário tem vínculo profissional, repasse e prontuário assinado: o
    // encerramento dele passa pela administração, não por autoatendimento.
    if (usuario.tipo_usuario !== 'tutor') {
      throw new ForbiddenError(
        'Contas profissionais são encerradas pela administração. Fale com o suporte para pedir o encerramento.'
      );
    }

    const impedimentos = await impedimentosParaEncerrar(String(req.userId), String(req.tenantId));
    if (impedimentos.length > 0) {
      throw new ConflictError(impedimentos.join(' '));
    }

    await encerrarConta({
      usuarioId: String(req.userId),
      tenantId: String(req.tenantId),
      motivo: motivo?.trim() || null
    });

    return res.json({
      success: true,
      message: 'Sua conta foi encerrada e seus dados pessoais foram removidos. O histórico clínico dos seus pets é preservado por obrigação legal, sem ligação com você.'
    });
  });

  delete = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    const usuario = await prisma.usuario.findFirst({
      where: escopoDoTenant(req, { id })
    });

    if (!usuario) {
      throw new NotFoundError('Usuário não encontrado');
    }
    if (usuario.id === req.userId) throw new ForbiddenError('Não é permitido excluir o próprio usuário por esta rota');
    if (!req.isSuperAdmin && ['admin', 'super_admin'].includes(usuario.tipo_usuario)) {
      throw new ForbiddenError('Apenas super administradores podem excluir perfis administrativos');
    }

    await TokenService.revokeUserRefreshTokens(usuario.id);
    await prisma.usuario.delete({
      where: { id }
    });

    return res.json({ message: 'Usuário removido com sucesso' });
  });
}

const userController = new UserController();

module.exports = userController;
export default userController;
