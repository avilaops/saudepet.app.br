import type { AmbienteGateway, GatewayConfig, GatewayTipo } from '@prisma/client';
import prisma from '../config/database';
import CryptoService from './crypto.service';
import { NotFoundError, ValidationError } from '../middleware/error.middleware';
import type AbstractGateway from './gateways/abstract.gateway';
import MercadoPagoGateway from './gateways/mercadopago.gateway';

/** A linha de `gateway_configs` com as credenciais já descriptografadas. */
export type ConfiguracaoDoGatewayDoTenant = GatewayConfig & {
  public_key: string | null;
  /** `decrypt` só devolve null para texto vazio — e a coluna é obrigatória. */
  secret_key: string | null;
  webhook_secret: string | null;
};

export type CredenciaisDoGateway = {
  public_key?: string | null;
  secret_key?: string | null;
  webhook_secret?: string | null;
  ambiente?: AmbienteGateway;
  configuracao_extra?: unknown;
};

export type ResultadoDoTesteDeConexao =
  | { success: true; gateway: string; message: string; details: unknown }
  | { success: false; gateway: string; message: string; error: string };

/**
 * Interface abstrata para gateways de pagamento
 * Implementa o padrão Strategy para permitir múltiplos gateways
 */
class PaymentGatewayService {
  /**
   * Obter credenciais criptografadas do tenant
   */
  async getTenantGatewayConfig(tenantId: string, gateway: GatewayTipo): Promise<ConfiguracaoDoGatewayDoTenant> {
    const config = await prisma.gatewayConfig.findFirst({
      where: {
        tenant_id: tenantId,
        gateway,
        ativo: true
      }
    });

    if (!config) {
      throw new NotFoundError(`Gateway ${gateway} não configurado para este tenant`);
    }

    // Descriptografar credenciais
    return {
      ...config,
      public_key: config.public_key_encrypted
        ? CryptoService.decrypt(config.public_key_encrypted)
        : null,
      secret_key: CryptoService.decrypt(config.secret_key_encrypted),
      webhook_secret: config.webhook_secret_encrypted
        ? CryptoService.decrypt(config.webhook_secret_encrypted)
        : null
    };
  }

  /**
   * Salvar/atualizar credenciais do gateway (criptografadas)
   */
  async saveGatewayConfig(tenantId: string, gateway: GatewayTipo, credentials: CredenciaisDoGateway): Promise<GatewayConfig> {
    const {
      public_key,
      secret_key,
      webhook_secret,
      ambiente = 'sandbox', // sandbox ou production
      configuracao_extra = {}
    } = credentials;

    if (!secret_key) {
      throw new ValidationError('Secret key é obrigatória');
    }

    // Criptografar credenciais
    const data = {
      tenant_id: tenantId,
      gateway,
      ambiente,
      public_key_encrypted: public_key ? CryptoService.encrypt(public_key) : null,
      // `encrypt` só devolve null para texto vazio, e `secret_key` acabou de
      // ser validada acima — o cast registra o que a guarda já garante.
      secret_key_encrypted: CryptoService.encrypt(secret_key) as string,
      webhook_secret_encrypted: webhook_secret ? CryptoService.encrypt(webhook_secret) : null,
      configuracao_extra: JSON.stringify(configuracao_extra),
      ativo: true
    };

    // Upsert
    const existing = await prisma.gatewayConfig.findFirst({
      where: { tenant_id: tenantId, gateway }
    });

    if (existing) {
      return await prisma.gatewayConfig.update({
        where: { id: existing.id },
        data
      });
    } else {
      return await prisma.gatewayConfig.create({ data });
    }
  }

  /**
   * Factory method - retorna o gateway apropriado
   */
  static async getGateway(tenantId: string, gatewayType: string): Promise<AbstractGateway> {
    const gatewayMap: Record<string, typeof MercadoPagoGateway | undefined> = {
      'mercado_pago': MercadoPagoGateway
    };

    const GatewayClass = gatewayMap[gatewayType];

    if (!GatewayClass) {
      throw new ValidationError(`Gateway ${gatewayType} não suportado`);
    }

    const service = new PaymentGatewayService();
    const config = await service.getTenantGatewayConfig(tenantId, gatewayType as GatewayTipo);

    return new GatewayClass(config);
  }

  /**
   * Listar gateways configurados do tenant
   */
  async listGateways(tenantId: string) {
    const gateways = await prisma.gatewayConfig.findMany({
      where: { tenant_id: tenantId },
      select: {
        id: true,
        gateway: true,
        ambiente: true,
        ativo: true,
        criado_em: true,
        atualizado_em: true
        // NÃO retornar chaves criptografadas
      }
    });

    return gateways;
  }

  /**
   * Testar conexão com gateway
   */
  async testConnection(tenantId: string, gateway: string): Promise<ResultadoDoTesteDeConexao> {
    try {
      const gatewayInstance = await PaymentGatewayService.getGateway(tenantId, gateway);
      const result = await gatewayInstance.testConnection();

      return {
        success: true,
        gateway,
        message: 'Conexão bem-sucedida',
        details: result
      };
    } catch (error) {
      return {
        success: false,
        gateway,
        message: 'Falha na conexão',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
}

module.exports = PaymentGatewayService;

export default PaymentGatewayService;
