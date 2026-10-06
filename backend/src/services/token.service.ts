import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import prisma from '../config/database';

/**
 * Todos os segredos de vida curta do produto num lugar só: refresh token,
 * reset de senha, verificação de e-mail e a lista negra de access tokens.
 *
 * Duas regras atravessam o arquivo inteiro:
 *
 * 1. Todo token nasce de `crypto.randomBytes`. Nada de `Math.random`, nada
 *    derivado de id ou de timestamp — o que é adivinhável não é segredo.
 * 2. Todo token tem prazo, e o prazo é conferido na hora de usar. Guardar
 *    validade sem verificar é decoração.
 */
class TokenService {
  /** Token opaco em hex. `length` é em BYTES, então a string sai com o dobro. */
  static generateSecureToken(length = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Código numérico curto, do tipo que se manda por SMS.
   *
   * A versão anterior fazia `randomBytes[i] % 10`, e isso tem viés: 256 não é
   * múltiplo de 10, então os dígitos de 0 a 5 saíam com 26/256 de chance e os
   * de 6 a 9 com 25/256. Num código de seis casas isso encolhe o espaço de
   * busca — pouco, mas de graça e sem motivo.
   *
   * Agora é amostragem por rejeição: bytes de 250 para cima são descartados, e
   * o que sobra (0–249) divide exatamente por 10.
   */
  static generateNumericToken(length = 6): string {
    const LIMITE = 250; // maior múltiplo de 10 que cabe em um byte
    let token = '';

    while (token.length < length) {
      for (const byte of crypto.randomBytes(length)) {
        if (byte >= LIMITE) continue;
        token += String(byte % 10);
        if (token.length === length) break;
      }
    }

    return token;
  }

  /** Refresh token de 30 dias, com IP e navegador de origem para auditoria. */
  static async createRefreshToken(
    usuarioId: string,
    ip?: string | null,
    userAgent?: string | null
  ): Promise<string> {
    const token = this.generateSecureToken(64);
    const expiraEm = new Date();
    expiraEm.setDate(expiraEm.getDate() + 30);

    const refreshToken = await prisma.refreshToken.create({
      data: { usuario_id: usuarioId, token, expira_em: expiraEm, ip, user_agent: userAgent }
    });

    return refreshToken.token;
  }

  /**
   * @returns o id do usuário dono do token.
   * @throws quando o token não existe ou venceu. Vencido é APAGADO na hora —
   *         não adianta guardar credencial morta ocupando a tabela.
   */
  static async validateRefreshToken(token: string): Promise<string> {
    const refreshToken = await prisma.refreshToken.findUnique({ where: { token } });

    if (!refreshToken) {
      throw new Error('Refresh token inválido');
    }

    if (new Date() > refreshToken.expira_em) {
      await prisma.refreshToken.delete({ where: { id: refreshToken.id } });
      throw new Error('Refresh token expirado');
    }

    return refreshToken.usuario_id;
  }

  /** Derruba TODAS as sessões longas do usuário — troca de senha, suspensão. */
  static async revokeUserRefreshTokens(usuarioId: string): Promise<void> {
    await prisma.refreshToken.deleteMany({ where: { usuario_id: usuarioId } });
  }

  static async revokeRefreshToken(token: string): Promise<void> {
    await prisma.refreshToken.delete({ where: { token } });
  }

  /** Faxina periódica das quatro tabelas de token. */
  static async cleanExpiredTokens() {
    const agora = new Date();

    const [refresh, reset, verification, blacklist] = await Promise.all([
      prisma.refreshToken.deleteMany({ where: { expira_em: { lt: agora } } }),
      prisma.passwordResetToken.deleteMany({ where: { expira_em: { lt: agora } } }),
      prisma.emailVerificationToken.deleteMany({ where: { expira_em: { lt: agora } } }),
      prisma.tokenBlacklist.deleteMany({ where: { expira_em: { lt: agora } } })
    ]);

    const resultado = {
      refresh: refresh.count,
      reset: reset.count,
      verification: verification.count,
      blacklist: blacklist.count
    };

    console.log('🧹 [TOKEN CLEANUP] Tokens limpos:', resultado);

    return resultado;
  }

  /**
   * Reset de senha: 1 hora de validade, e os pedidos anteriores do mesmo
   * e-mail morrem. Sem isso, cada "esqueci minha senha" deixaria mais uma
   * chave válida circulando na caixa de entrada.
   */
  static async createPasswordResetToken(
    email: string,
    tenantId: string,
    ip?: string | null
  ): Promise<string> {
    const token = this.generateSecureToken(32);
    const expiraEm = new Date();
    expiraEm.setHours(expiraEm.getHours() + 1);

    await prisma.passwordResetToken.updateMany({
      where: { email, tenant_id: tenantId, usado: false },
      data: { usado: true }
    });

    await prisma.passwordResetToken.create({
      data: { tenant_id: tenantId, email, token, expira_em: expiraEm, ip }
    });

    return token;
  }

  /**
   * `tenant_id` pode ser NULO — a coluna é `String?` e existem linhas antigas
   * sem tenant. Quem chama trata isso: sem tenant, a busca do usuário cai para
   * só o e-mail. Num produto multi-tenant isso significa que um token órfão
   * alcança o primeiro usuário com aquele e-mail em QUALQUER organização.
   * Hoje só existe um tenant, então é latente; o tipo diz a verdade para o dia
   * em que houver dois.
   */
  static async validatePasswordResetToken(
    token: string
  ): Promise<{ email: string; tenant_id: string | null }> {
    const resetToken = await prisma.passwordResetToken.findUnique({ where: { token } });

    if (!resetToken) {
      throw new Error('Token de reset inválido');
    }

    if (resetToken.usado) {
      throw new Error('Token de reset já foi utilizado');
    }

    if (new Date() > resetToken.expira_em) {
      throw new Error('Token de reset expirado');
    }

    return { email: resetToken.email, tenant_id: resetToken.tenant_id };
  }

  static async markPasswordResetTokenAsUsed(token: string): Promise<void> {
    await prisma.passwordResetToken.update({ where: { token }, data: { usado: true } });
  }

  /** Verificação de e-mail: 24 horas, e o pedido anterior é descartado. */
  static async createEmailVerificationToken(email: string, tenantId: string): Promise<string> {
    const token = this.generateSecureToken(32);
    const expiraEm = new Date();
    expiraEm.setHours(expiraEm.getHours() + 24);

    await prisma.emailVerificationToken.deleteMany({
      where: { email, tenant_id: tenantId, verificado: false }
    });

    await prisma.emailVerificationToken.create({
      data: { tenant_id: tenantId, email, token, expira_em: expiraEm }
    });

    return token;
  }

  /** Mesma ressalva de `validatePasswordResetToken` sobre `tenant_id` nulo. */
  static async validateEmailVerificationToken(
    token: string
  ): Promise<{ email: string; tenant_id: string | null }> {
    const verificationToken = await prisma.emailVerificationToken.findUnique({ where: { token } });

    if (!verificationToken) {
      throw new Error('Token de verificação inválido');
    }

    if (verificationToken.verificado) {
      throw new Error('Email já foi verificado');
    }

    if (new Date() > verificationToken.expira_em) {
      throw new Error('Token de verificação expirado');
    }

    await prisma.emailVerificationToken.update({
      where: { id: verificationToken.id },
      data: { verificado: true }
    });

    return { email: verificationToken.email, tenant_id: verificationToken.tenant_id };
  }

  /**
   * Mata um access token antes da hora — logout, troca de senha, suspensão.
   *
   * A linha guardada expira junto com o token, para a tabela não crescer para
   * sempre: passado o `exp`, o JWT já é recusado pela própria assinatura e não
   * precisa mais de lista negra.
   */
  static async blacklistToken(token: string, usuarioId: string, motivo = 'logout'): Promise<void> {
    const expiraEm = TokenService.expiracaoDoJwt(token);

    await prisma.tokenBlacklist.create({
      data: { token, usuario_id: usuarioId, motivo, expira_em: expiraEm }
    });
  }

  /** `exp` do JWT; 7 dias à frente quando o token não é legível. */
  private static expiracaoDoJwt(token: string): Date {
    try {
      const decodificado = jwt.decode(token) as { exp?: number } | null;
      if (decodificado?.exp) return new Date(decodificado.exp * 1000);
    } catch {
      // Token ilegível não impede o bloqueio — só perde a data exata.
    }

    const padrao = new Date();
    padrao.setDate(padrao.getDate() + 7);
    return padrao;
  }

  static async isTokenBlacklisted(token: string): Promise<boolean> {
    const naLista = await prisma.tokenBlacklist.findUnique({ where: { token } });
    return Boolean(naLista);
  }
}

module.exports = TokenService;
export default TokenService;
