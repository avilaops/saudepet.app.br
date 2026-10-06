const AuditService = require('../../../src/services/audit.service');
const prisma = require('../../../src/config/database');

jest.mock('../../../src/config/database');

describe('AuditService - Unit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('log', () => {
    it('deve criar log de auditoria com todos os campos', async () => {
      prisma.auditLog.create.mockResolvedValue({
        id: 'audit-1',
        usuario_id: 'user-1',
        acao: 'login'
      });

      await AuditService.log({
        usuarioId: 'user-1',
        tenantId: 'tenant-1',
        acao: 'login',
        recurso: 'usuario',
        recursoId: 'user-1',
        detalhes: { sucesso: true },
        ip: '192.168.1.100',
        userAgent: 'Mozilla/5.0',
        sucesso: true
      });

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          usuario_id: 'user-1',
          tenant_id: 'tenant-1',
          acao: 'login',
          recurso: 'usuario',
          ip: '192.168.1.100',
          user_agent: 'Mozilla/5.0',
          sucesso: true
        })
      });
    });

    it('não deve lançar erro em caso de falha', async () => {
      prisma.auditLog.create.mockRejectedValue(new Error('Database error'));

      // Não deve lançar erro
      await expect(
        AuditService.log({
          usuarioId: 'user-1',
          acao: 'test'
        })
      ).resolves.not.toThrow();
    });
  });

  describe('logLogin', () => {
    it('deve criar log de login bem-sucedido', async () => {
      prisma.auditLog.create.mockResolvedValue({});

      await AuditService.logLogin('user-1', 'tenant-1', '192.168.1.1', 'Mozilla');

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          acao: 'login',
          usuario_id: 'user-1',
          tenant_id: 'tenant-1'
        })
      });
    });
  });

  describe('logLogout', () => {
    it('deve criar log de logout', async () => {
      prisma.auditLog.create.mockResolvedValue({});

      await AuditService.logLogout('user-1', 'tenant-1', '192.168.1.1', 'Mozilla');

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          acao: 'logout',
          usuario_id: 'user-1'
        })
      });
    });
  });

  describe('logPasswordChange', () => {
    it('deve criar log de mudança de senha', async () => {
      prisma.auditLog.create.mockResolvedValue({});

      await AuditService.logPasswordChange('user-1', 'tenant-1', '192.168.1.1', 'Mozilla');

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          acao: 'password_change',
          usuario_id: 'user-1'
        })
      });
    });
  });

  describe('logPasswordReset', () => {
    it('deve criar log de reset de senha', async () => {
      prisma.auditLog.create.mockResolvedValue({});

      await AuditService.logPasswordReset('user-1', 'tenant-1', '192.168.1.1', 'Mozilla');

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          acao: 'password_reset',
          usuario_id: 'user-1'
        })
      });
    });
  });
});
