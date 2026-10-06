import type { Request, Response } from 'express';
import { asyncHandler, UnauthorizedError, ValidationError } from '../middleware/error.middleware';
import PaymentGatewayService from '../services/payment-gateway.service';
import { generateKey } from '../services/crypto.service';
import AuditService from '../services/audit.service';
import prisma from '../config/database';

/**
 * Controller para gerenciar configurações de gateways de pagamento
 */

// Todas as rotas passam pelo `authMiddleware`; sem `req.user` o JavaScript
// estourava TypeError (500) ao ler `tenant_id`. Aqui o erro é nomeado.
const tenantDoUsuario = (req: Request): string => {
  if (!req.user) throw new UnauthorizedError();
  return String(req.user.tenant_id);
};

/**
 * Configurar gateway para o tenant
 * POST /api/v1/gateways/configure
 * Acesso: Admin
 */
const configurar = asyncHandler(async (req: Request, res: Response) => {
  const { gateway, public_key, secret_key, webhook_secret, ambiente, configuracao_extra } = req.body;
  const tenant_id = tenantDoUsuario(req);

  const service = new PaymentGatewayService();

  const config = await service.saveGatewayConfig(tenant_id, gateway, {
    public_key,
    secret_key,
    webhook_secret,
    ambiente,
    configuracao_extra
  });

  // Credencial de gateway move dinheiro: quem cadastrou ou substituiu, e
  // quando, tem de ficar registrado. As chaves NUNCA entram no log.
  await AuditService.logForensicEvent({
    req,
    tenantId: tenant_id,
    entityType: 'GatewayConfig',
    entityId: config.id,
    action: 'gateway.credenciais_configuradas',
    estadoPosterior: { gateway, ambiente, ativo: config.ativo },
    motivo: 'Cadastro ou substituição de credenciais do gateway de pagamento'
  });

  return res.status(201).json({
    message: `Gateway ${gateway} configurado com sucesso`,
    gateway: {
      id: config.id,
      gateway: config.gateway,
      ambiente: config.ambiente,
      ativo: config.ativo
      // NÃO retornar chaves
    }
  });
});

/**
 * Listar gateways configurados
 * GET /api/v1/gateways
 * Acesso: Admin
 */
const listar = asyncHandler(async (req: Request, res: Response) => {
  const tenant_id = tenantDoUsuario(req);

  const service = new PaymentGatewayService();
  const gateways = await service.listGateways(tenant_id);

  return res.json({ gateways });
});

/**
 * Testar conexão com gateway
 * POST /api/v1/gateways/:gateway/test
 * Acesso: Admin
 */
const testar = asyncHandler(async (req: Request, res: Response) => {
  const gateway = String(req.params.gateway);
  const tenant_id = tenantDoUsuario(req);

  const service = new PaymentGatewayService();
  const result = await service.testConnection(tenant_id, gateway);

  return res.json(result);
});

/**
 * Ativar/desativar gateway
 * PATCH /api/v1/gateways/:id/toggle
 * Acesso: Admin
 */
const toggleStatus = asyncHandler(async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const tenant_id = tenantDoUsuario(req);

  const config = await prisma.gatewayConfig.findFirst({
    where: { id, tenant_id }
  });

  if (!config) {
    throw new ValidationError('Gateway não encontrado');
  }

  const updated = await prisma.gatewayConfig.update({
    where: { id },
    data: {
      ativo: !config.ativo
    }
  });

  return res.json({
    message: `Gateway ${updated.ativo ? 'ativado' : 'desativado'} com sucesso`,
    gateway: {
      id: updated.id,
      gateway: updated.gateway,
      ativo: updated.ativo
    }
  });
});

/**
 * Deletar configuração de gateway
 * DELETE /api/v1/gateways/:id
 * Acesso: Admin
 */
const deletar = asyncHandler(async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const tenant_id = tenantDoUsuario(req);

  const config = await prisma.gatewayConfig.findFirst({
    where: { id, tenant_id }
  });

  if (!config) {
    throw new ValidationError('Gateway não encontrado');
  }

  await prisma.gatewayConfig.delete({
    where: { id }
  });

  // Remover credencial derruba a cobrança do tenant inteiro — quem apagou
  // precisa ficar registrado.
  await AuditService.logForensicEvent({
    req,
    tenantId: config.tenant_id,
    entityType: 'GatewayConfig',
    entityId: id,
    action: 'gateway.credenciais_removidas',
    estadoAnterior: { gateway: config.gateway, ambiente: config.ambiente, ativo: config.ativo },
    motivo: 'Configuração de gateway removida pelo administrador'
  });

  return res.json({
    message: 'Configuração de gateway deletada com sucesso'
  });
});

/**
 * Gerar chave de criptografia (apenas desenvolvimento)
 * GET /api/v1/gateways/generate-key
 * Acesso: Super Admin (apenas em dev)
 */
const gerarChave = asyncHandler(async (_req: Request, res: Response) => {
  if (process.env.NODE_ENV === 'production') {
    throw new ValidationError('Endpoint disponível apenas em desenvolvimento');
  }

  // Era `CryptoService.constructor.generateKey()`: o módulo exporta uma
  // INSTÂNCIA, então o único caminho até o `static` era subir pelo construtor.
  // Funcionava por acidente; agora `generateKey` é função exportada.
  const key = generateKey();

  return res.json({
    message: 'Chave gerada com sucesso. Adicione ao .env como ENCRYPTION_KEY',
    key,
    warning: '⚠️  NUNCA compartilhe esta chave! Guarde de forma segura.'
  });
});

const gatewayController = {
  configurar,
  listar,
  testar,
  toggleStatus,
  deletar,
  gerarChave
};

module.exports = gatewayController;

export default gatewayController;
export { configurar, listar, testar, toggleStatus, deletar, gerarChave };
