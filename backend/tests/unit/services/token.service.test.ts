const TokenService = require('../../../src/services/token.service');
const prisma = require('../../../src/config/database');

jest.mock('../../../src/config/database');

describe('TokenService - Unit', () => {
  describe('generateSecureToken', () => {
    it('deve gerar token com tamanho correto', () => {
      const token = TokenService.generateSecureToken(32);
      
      expect(token).toHaveLength(64); // 32 bytes = 64 hex chars
      expect(token).toMatch(/^[a-f0-9]{64}$/);
    });

    it('deve gerar tokens diferentes', () => {
      const token1 = TokenService.generateSecureToken(32);
      const token2 = TokenService.generateSecureToken(32);
      
      expect(token1).not.toBe(token2);
    });
  });

  describe('createRefreshToken', () => {
    it('deve criar refresh token no banco', async () => {
      const mockToken = {
        id: 'refresh-1',
        token: 'generated-token-string',
        usuario_id: 'user-1',
        expira_em: expect.any(Date)
      };

      prisma.refreshToken.create.mockResolvedValue(mockToken);

      const result = await TokenService.createRefreshToken('user-1');

      expect(typeof result).toBe('string'); // Retorna apenas o token
      expect(prisma.refreshToken.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          usuario_id: 'user-1',
          token: expect.any(String),
          expira_em: expect.any(Date)
        })
      });
    });
  });

  describe('validateRefreshToken', () => {
    it('deve validar token válido', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 1);

      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'refresh-1',
        token: 'valid-token',
        usuario_id: 'user-1',
        expira_em: futureDate,
        revogado: false
      });

      const result = await TokenService.validateRefreshToken('valid-token');

      expect(result).toBe('user-1'); // Retorna apenas o usuario_id
    });

    it('deve lançar erro para token inexistente', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);

      await expect(
        TokenService.validateRefreshToken('invalid')
      ).rejects.toThrow('Refresh token inválido');
    });

    it('deve lançar erro para token expirado', async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);

      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'refresh-1',
        token: 'expired-token',
        expira_em: pastDate,
        revogado: false
      });

      prisma.refreshToken.delete.mockResolvedValue({});

      await expect(
        TokenService.validateRefreshToken('expired-token')
      ).rejects.toThrow('Refresh token expirado');
    });
  });

  describe('revokeRefreshToken', () => {
    it('deve revogar token específico', async () => {
      prisma.refreshToken.delete.mockResolvedValue({ count: 1 });

      await TokenService.revokeRefreshToken('token-123');

      expect(prisma.refreshToken.delete).toHaveBeenCalledWith({
        where: { token: 'token-123' }
      });
    });
  });

  describe('revokeUserRefreshTokens', () => {
    it('deve revogar todos os tokens do usuário', async () => {
      prisma.refreshToken.deleteMany.mockResolvedValue({ count: 5 });

      await TokenService.revokeUserRefreshTokens('user-1');

      expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { usuario_id: 'user-1' }
      });
    });
  });

  describe('cleanExpiredTokens', () => {
    it('deve deletar tokens expirados', async () => {
      prisma.refreshToken.deleteMany.mockResolvedValue({ count: 10 });
      prisma.passwordResetToken.deleteMany.mockResolvedValue({ count: 5 });
      prisma.emailVerificationToken.deleteMany.mockResolvedValue({ count: 3 });
      prisma.tokenBlacklist.deleteMany.mockResolvedValue({ count: 2 });

      const result = await TokenService.cleanExpiredTokens();

      expect(result).toHaveProperty('refresh', 10);
      expect(result).toHaveProperty('reset', 5);
      expect(result).toHaveProperty('verification', 3);
      expect(result).toHaveProperty('blacklist', 2);

      expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: {
          expira_em: {
            lt: expect.any(Date)
          }
        }
      });
    });
  });
});

export {};
