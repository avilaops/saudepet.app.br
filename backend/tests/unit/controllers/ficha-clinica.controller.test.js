/**
 * Correção e remoção da ficha clínica do pet.
 *
 * O que se testa aqui é exatamente o que separa "corrigir um dado clínico" de
 * "mexer no banco à mão": o registro nunca é deletado, a remoção não acontece
 * sem motivo, nada atravessa a fronteira do tenant, e todo evento vai para a
 * trilha pericial com estado anterior e posterior.
 */
const prisma = require('../../../src/config/database');
const AuditService = require('../../../src/services/audit.service');
const controller = require('../../../src/controllers/ficha-clinica.controller');
const {
  corrigirAlergiaSchema,
  corrigirVacinaSchema,
  corrigirMedicamentoSchema,
  removerRegistroClinicoSchema
} = require('../../../src/schemas/ficha-clinica.schema');

jest.spyOn(AuditService, 'logForensicEvent').mockResolvedValue(undefined);

function responseDouble() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

const reqVet = (extra = {}) => ({
  tenantId: 'tenant-a',
  userId: 'user-vet-2',
  userType: 'veterinario',
  user: { veterinario: { id: 'vet-2' } },
  params: { petId: 'pet-1', id: 'reg-1' },
  body: {},
  query: {},
  headers: {},
  ...extra
});

const ALERGIA = {
  id: 'reg-1',
  tenant_id: 'tenant-a',
  pet_id: 'pet-1',
  alergia: 'Dipirona',
  gravidade: 'grave',
  observacoes: null,
  ativo: true,
  criado_em: new Date('2026-08-01T10:00:00.000Z'),
  atualizado_em: null,
  atualizado_por: null,
  removido_em: null,
  removido_por: null,
  motivo_remocao: null
};

describe('ficha-clinica.controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Escopo v1.0: o veterinário só mexe na ficha de pet que atendeu. Aqui ele
    // atendeu; o caso contrário vive em tests/security/ficha-clinica-escopo-vet.
    prisma.solicitacao.findFirst.mockResolvedValue({ id: 'sol-1' });
    prisma.agendamento.findFirst.mockResolvedValue(null);
  });

  describe('remoção é lógica e exige motivo', () => {
    it('rejeita motivo curto no schema, antes de chegar ao controller', () => {
      const resultado = removerRegistroClinicoSchema.safeParse({ motivo: 'erro' });

      expect(resultado.success).toBe(false);
      expect(resultado.error.issues[0].message).toMatch(/pelo menos 5 caracteres/);
    });

    it('rejeita remoção sem motivo nenhum', () => {
      expect(removerRegistroClinicoSchema.safeParse({}).success).toBe(false);
      expect(removerRegistroClinicoSchema.safeParse({ motivo: '     ' }).success).toBe(false);
    });

    it('aceita motivo com 5 caracteres ou mais, já sem espaços nas pontas', () => {
      const resultado = removerRegistroClinicoSchema.parse({ motivo: '  lancado no pet errado  ' });

      expect(resultado.motivo).toBe('lancado no pet errado');
    });

    it('marca ativo=false com quem/quando/por quê e nunca deleta a linha', async () => {
      prisma.petAlergia.findFirst.mockResolvedValue(ALERGIA);
      prisma.petAlergia.update.mockImplementation(({ data }) => Promise.resolve({ ...ALERGIA, ...data }));

      const req = reqVet({ body: { motivo: 'Lançada no pet errado' } });
      const res = responseDouble();
      const next = jest.fn();

      await controller.removerAlergia(req, res, next);

      expect(next).not.toHaveBeenCalled();
      // O modelo nem expõe `delete` no mock: se o controller tentasse deletar,
      // o teste quebraria aqui em vez de passar em silêncio.
      expect(prisma.petAlergia.delete).toBeUndefined();
      expect(prisma.petAlergia.update).toHaveBeenCalledWith({
        where: { id: 'reg-1' },
        data: expect.objectContaining({
          ativo: false,
          removido_por: 'user-vet-2',
          motivo_remocao: 'Lançada no pet errado',
          removido_em: expect.any(Date)
        })
      });
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        removido: true,
        registro: expect.objectContaining({ ativo: false })
      }));
    });

    it('audita a remoção com estado anterior, posterior e o motivo', async () => {
      prisma.petVacina.findFirst.mockResolvedValue({
        id: 'vac-1', tenant_id: 'tenant-a', pet_id: 'pet-1', nome_vacina: 'V10', ativo: true
      });
      prisma.petVacina.update.mockResolvedValue({
        id: 'vac-1', tenant_id: 'tenant-a', pet_id: 'pet-1', nome_vacina: 'V10', ativo: false
      });

      const req = reqVet({ params: { petId: 'pet-1', id: 'vac-1' }, body: { motivo: 'Duplicada no mesmo dia' } });
      await controller.removerVacina(req, responseDouble(), jest.fn());

      expect(AuditService.logForensicEvent).toHaveBeenCalledWith(expect.objectContaining({
        entityType: 'PetVacina',
        entityId: 'vac-1',
        action: 'ficha_clinica.registro_removido',
        motivo: 'Duplicada no mesmo dia',
        estadoAnterior: expect.objectContaining({ ativo: true }),
        estadoPosterior: expect.objectContaining({ ativo: false })
      }));
    });
  });

  describe('correção', () => {
    it('grava atualizado_em/por e audita o antes e o depois', async () => {
      prisma.petAlergia.findFirst.mockResolvedValue(ALERGIA);
      prisma.petAlergia.update.mockImplementation(({ data }) => Promise.resolve({ ...ALERGIA, ...data }));

      const req = reqVet({ body: { gravidade: 'leve' } });
      const res = responseDouble();
      const next = jest.fn();

      await controller.corrigirAlergia(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(prisma.petAlergia.update).toHaveBeenCalledWith({
        where: { id: 'reg-1' },
        data: expect.objectContaining({
          gravidade: 'leve',
          atualizado_por: 'user-vet-2',
          atualizado_em: expect.any(Date)
        })
      });
      // Corrigir não é ressuscitar nem remover: `ativo` não é tocado no PUT.
      expect(prisma.petAlergia.update.mock.calls[0][0].data.ativo).toBeUndefined();
      expect(AuditService.logForensicEvent).toHaveBeenCalledWith(expect.objectContaining({
        entityType: 'PetAlergia',
        action: 'ficha_clinica.registro_corrigido',
        estadoAnterior: expect.objectContaining({ gravidade: 'grave' }),
        estadoPosterior: expect.objectContaining({ gravidade: 'leve' })
      }));
    });

    it('exige ao menos um campo — um PUT vazio não vira evento de auditoria', () => {
      expect(corrigirAlergiaSchema.safeParse({}).success).toBe(false);
      expect(corrigirVacinaSchema.safeParse({}).success).toBe(false);
      expect(corrigirMedicamentoSchema.safeParse({}).success).toBe(false);
    });

    it('não deixa a próxima dose cair antes da aplicação já gravada', async () => {
      prisma.petVacina.findFirst.mockResolvedValue({
        id: 'vac-1',
        tenant_id: 'tenant-a',
        pet_id: 'pet-1',
        nome_vacina: 'V10',
        data_aplicacao: new Date('2026-08-10T00:00:00.000Z'),
        proxima_dose: new Date('2026-08-05T00:00:00.000Z'),
        ativo: true
      });

      const req = reqVet({ params: { petId: 'pet-1', id: 'vac-1' }, body: { nome_vacina: 'V10 Plus' } });
      const next = jest.fn();

      await controller.corrigirVacina(req, responseDouble(), next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
      expect(prisma.petVacina.update).not.toHaveBeenCalled();
      expect(AuditService.logForensicEvent).not.toHaveBeenCalled();
    });

    it('não deixa o término do medicamento cair antes do início já gravado', async () => {
      prisma.petMedicamento.findFirst.mockResolvedValue({
        id: 'med-1',
        tenant_id: 'tenant-a',
        pet_id: 'pet-1',
        nome_medicamento: 'Prednisolona',
        data_inicio: new Date('2026-08-10T00:00:00.000Z'),
        ativo: true
      });

      const req = reqVet({
        params: { petId: 'pet-1', id: 'med-1' },
        body: { data_fim: new Date('2026-08-01T00:00:00.000Z') }
      });
      const next = jest.fn();

      await controller.corrigirMedicamento(req, responseDouble(), next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
      expect(prisma.petMedicamento.update).not.toHaveBeenCalled();
    });
  });

  describe('fronteiras', () => {
    it('veterinário de outro tenant não altera: a busca é recortada pelo tenant autenticado', async () => {
      prisma.petAlergia.findFirst.mockResolvedValue(null);

      const req = reqVet({ tenantId: 'tenant-b', body: { gravidade: 'leve' } });
      const next = jest.fn();

      await controller.corrigirAlergia(req, responseDouble(), next);

      expect(prisma.petAlergia.findFirst).toHaveBeenCalledWith({
        where: { id: 'reg-1', tenant_id: 'tenant-b', pet_id: 'pet-1', ativo: true }
      });
      // 404 e não 403: não confirmamos a existência de ficha clínica alheia.
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
      expect(prisma.petAlergia.update).not.toHaveBeenCalled();
      expect(AuditService.logForensicEvent).not.toHaveBeenCalled();
    });

    it('veterinário de outro tenant também não remove', async () => {
      prisma.petMedicamento.findFirst.mockResolvedValue(null);

      const req = reqVet({
        tenantId: 'tenant-b',
        params: { petId: 'pet-1', id: 'med-1' },
        body: { motivo: 'Registro incorreto' }
      });
      const next = jest.fn();

      await controller.removerMedicamento(req, responseDouble(), next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
      expect(prisma.petMedicamento.update).not.toHaveBeenCalled();
    });

    it('registro já removido não é encontrado de novo: a busca filtra ativo=true', async () => {
      prisma.petAlergia.findFirst.mockResolvedValue(null);

      const next = jest.fn();
      await controller.removerAlergia(reqVet({ body: { motivo: 'Já saiu da ficha' } }), responseDouble(), next);

      expect(prisma.petAlergia.findFirst).toHaveBeenCalledWith({
        where: expect.objectContaining({ ativo: true })
      });
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
    });
  });
});
