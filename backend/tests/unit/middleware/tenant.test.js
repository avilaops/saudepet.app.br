const { 
  tenantContext, 
  requireActiveTenant, 
  requireSameTenant, 
  addTenantFilter 
} = require('../../../src/middleware/tenant.middleware');
const { ForbiddenError } = require('../../../src/middleware/error.middleware');

jest.mock('../../../src/config/database');
const prisma = require('../../../src/config/database');

describe('TenantMiddleware - Unit', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      user: { id: 'user-1', tenant_id: 'tenant-1', tipo_usuario: 'tutor' },
      body: {},
      params: {},
      query: {}
    };
    res = {};
    next = jest.fn();
  });

  describe('tenantContext', () => {
    it('deve adicionar tenant_id ao req para usuário normal', () => {
      tenantContext(req, res, next);

      expect(req.tenantId).toBe('tenant-1');
      expect(req.isSuperAdmin).toBe(false);
      expect(next).toHaveBeenCalledWith();
    });

    it('deve permitir super_admin sem tenant_id', () => {
      req.user.tipo_usuario = 'super_admin';
      req.user.tenant_id = null;

      tenantContext(req, res, next);

      expect(req.tenantId).toBeNull();
      expect(req.isSuperAdmin).toBe(true);
      expect(next).toHaveBeenCalledWith();
    });

    // O tenant do super admin era descartado sempre. Como os controllers passam
    // `tenant_id: req.tenantId` direto para o Prisma, e a coluna não aceita nulo,
    // qualquer tela de tutor ou de veterinário aberta por ele estourava 500.
    it('deve usar o tenant do próprio super_admin quando ele tem um', () => {
      req.user.tipo_usuario = 'super_admin';
      req.user.tenant_id = 'tenant-do-admin';

      tenantContext(req, res, next);

      expect(req.tenantId).toBe('tenant-do-admin');
      // Continua sendo super admin: as rotas que enxergam todos os tenants se
      // guiam por esta bandeira, não pela ausência de tenant.
      expect(req.isSuperAdmin).toBe(true);
      expect(next).toHaveBeenCalledWith();
    });

    it('deve lançar erro se usuário normal não tem tenant_id', () => {
      req.user.tenant_id = null;

      expect(() => {
        tenantContext(req, res, next);
      }).toThrow(ForbiddenError);
    });
  });

  describe('requireActiveTenant', () => {
    beforeEach(() => {
      req.tenantId = 'tenant-1';
      req.isSuperAdmin = false;
    });

    it('deve permitir acesso quando tenant está ativo', async () => {
      prisma.tenant.findUnique.mockResolvedValue({
        status: 'ativo',
        plano: 'premium',
        expira_em: null
      });

      await requireActiveTenant(req, res, next);

      expect(req.tenant).toBeDefined();
      expect(next).toHaveBeenCalledWith();
    });

    it('deve bloquear quando tenant está suspenso', async () => {
      prisma.tenant.findUnique.mockResolvedValue({
        status: 'suspenso'
      });

      await requireActiveTenant(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
    });

    it('deve bloquear quando plano expirou', async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);

      prisma.tenant.findUnique.mockResolvedValue({
        status: 'ativo',
        expira_em: pastDate
      });

      await requireActiveTenant(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
    });

    it('deve permitir super_admin sem validação', async () => {
      req.isSuperAdmin = true;

      await requireActiveTenant(req, res, next);

      expect(prisma.tenant.findUnique).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith();
    });
  });

  describe('addTenantFilter', () => {
    beforeEach(() => {
      req.tenantId = 'tenant-1';
      req.isSuperAdmin = false;
    });

    it('deve adicionar tenant_id ao filtro', () => {
      const where = addTenantFilter(req, { status: 'ativo' });

      expect(where).toEqual({
        tenant_id: 'tenant-1',
        status: 'ativo'
      });
    });

    it('não deve adicionar tenant_id para super_admin', () => {
      req.isSuperAdmin = true;

      const where = addTenantFilter(req, { status: 'ativo' });

      expect(where).toEqual({ status: 'ativo' });
    });

    it('deve permitir super_admin especificar tenant_id via query', () => {
      req.isSuperAdmin = true;
      req.query.tenant_id = 'tenant-2';

      const where = addTenantFilter(req, {});

      expect(where).toEqual({ tenant_id: 'tenant-2' });
    });
  });
});
