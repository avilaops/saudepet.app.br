const prisma = require('../../../src/config/database');
const agendamento = require('../../../src/services/agendamento.service');

const TENANT = 'tenant-1';
const VET = 'vet-1';
const TUTOR = 'tutor-1';
const PET = 'pet-1';

const { instanteDoRelogio, relogioDeParede } = require('../../../src/utils/datas');

// Uma data futura estável para os testes não dependerem de "hoje". As horas
// são do relógio do Brasil, que é o da grade do veterinário — não o da máquina
// que roda o teste (ver `agendamento-fuso.test.ts`).
function amanhaAs(hora, minuto = 0) {
  const hoje = relogioDeParede(new Date());
  return instanteDoRelogio(hoje.ano, hoje.mes, hoje.dia + 1, hora * 60 + minuto);
}
const diaDaSemanaDe = (instante) => relogioDeParede(instante).diaDaSemana;

describe('Agendamento de consulta', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation((callback) => callback(prisma));
    prisma.pet.findFirst.mockResolvedValue({ id: PET });
    prisma.veterinario.findFirst.mockResolvedValue({ id: VET, aprovado_admin: true });
    prisma.agendaDisponivel.findMany.mockResolvedValue([]);
    prisma.agendamento.findFirst.mockResolvedValue(null);
    prisma.agendamento.create.mockImplementation(({ data }) => Promise.resolve({ id: 'ag-1', ...data }));
  });

  describe('conflito de horário', () => {
    it('recusa quando o horário se sobrepõe a outro agendamento', async () => {
      prisma.agendamento.findFirst.mockResolvedValue({
        id: 'ag-existente',
        inicio: amanhaAs(10),
        fim: amanhaAs(11)
      });

      await expect(
        agendamento.criar({
          tenantId: TENANT,
          veterinarioId: VET,
          tutorId: TUTOR,
          petId: PET,
          inicio: amanhaAs(10, 30),
          tipoAtendimento: 'consulta_domiciliar',
          criadoPorId: 'user-1'
        })
      ).rejects.toThrow(/já está ocupado/i);

      expect(prisma.agendamento.create).not.toHaveBeenCalled();
    });

    it('a busca por conflito usa sobreposição real (inicio < fim && fim > inicio)', async () => {
      await agendamento.criar({
        tenantId: TENANT,
        veterinarioId: VET,
        tutorId: TUTOR,
        petId: PET,
        inicio: amanhaAs(14),
        duracaoMinutos: 60,
        tipoAtendimento: 'consulta_domiciliar',
        criadoPorId: 'user-1'
      });

      const where = prisma.agendamento.findFirst.mock.calls[0][0].where;
      expect(where.inicio.lt).toEqual(amanhaAs(15));
      expect(where.fim.gt).toEqual(amanhaAs(14));
      // Cancelado e não-compareceu liberam o horário.
      expect(where.status.in).toEqual(['pendente', 'confirmado']);
    });

    it('encostar não é conflito: a consulta seguinte pode começar quando a anterior termina', async () => {
      // O `findFirst` do Prisma com `lt`/`gt` já exclui o encosto; aqui
      // garantimos que a janela pedida é exatamente a do novo horário.
      await agendamento.criar({
        tenantId: TENANT,
        veterinarioId: VET,
        tutorId: TUTOR,
        petId: PET,
        inicio: amanhaAs(11),
        duracaoMinutos: 30,
        tipoAtendimento: 'teleorientacao',
        criadoPorId: 'user-1'
      });

      const where = prisma.agendamento.findFirst.mock.calls[0][0].where;
      expect(where.inicio.lt).toEqual(amanhaAs(11, 30));
      expect(where.fim.gt).toEqual(amanhaAs(11));
    });

    it('a checagem de conflito e a criação acontecem na mesma transação', async () => {
      await agendamento.criar({
        tenantId: TENANT,
        veterinarioId: VET,
        tutorId: TUTOR,
        petId: PET,
        inicio: amanhaAs(9),
        tipoAtendimento: 'consulta_domiciliar',
        criadoPorId: 'user-1'
      });

      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });

  describe('validações de entrada', () => {
    it('recusa data no passado', async () => {
      const ontem = new Date(Date.now() - 86400000);

      await expect(
        agendamento.criar({
          tenantId: TENANT,
          veterinarioId: VET,
          tutorId: TUTOR,
          petId: PET,
          inicio: ontem,
          tipoAtendimento: 'consulta_domiciliar',
          criadoPorId: 'user-1'
        })
      ).rejects.toThrow(/que já passou/i);
    });

    it('recusa pet que não pertence ao tutor', async () => {
      prisma.pet.findFirst.mockResolvedValue(null);

      await expect(
        agendamento.criar({
          tenantId: TENANT,
          veterinarioId: VET,
          tutorId: TUTOR,
          petId: 'pet-de-outra-pessoa',
          inicio: amanhaAs(10),
          tipoAtendimento: 'consulta_domiciliar',
          criadoPorId: 'user-1'
        })
      ).rejects.toThrow(/Pet não encontrado/i);
    });

    it('recusa veterinário ainda não aprovado', async () => {
      prisma.veterinario.findFirst.mockResolvedValue({ id: VET, aprovado_admin: false });

      await expect(
        agendamento.criar({
          tenantId: TENANT,
          veterinarioId: VET,
          tutorId: TUTOR,
          petId: PET,
          inicio: amanhaAs(10),
          tipoAtendimento: 'consulta_domiciliar',
          criadoPorId: 'user-1'
        })
      ).rejects.toThrow(/não está habilitado/i);
    });
  });

  describe('grade semanal', () => {
    it('vet sem grade cadastrada aceita qualquer horário', async () => {
      prisma.agendaDisponivel.findMany.mockResolvedValue([]);

      await expect(
        agendamento.criar({
          tenantId: TENANT,
          veterinarioId: VET,
          tutorId: TUTOR,
          petId: PET,
          inicio: amanhaAs(23),
          tipoAtendimento: 'teleorientacao',
          criadoPorId: 'user-1'
        })
      ).resolves.toBeDefined();
    });

    it('recusa horário fora da faixa declarada', async () => {
      const alvo = amanhaAs(20);
      prisma.agendaDisponivel.findMany.mockResolvedValue([
        { dia_semana: diaDaSemanaDe(alvo), hora_inicio: '08:00', hora_fim: '18:00', ativo: true }
      ]);

      await expect(
        agendamento.criar({
          tenantId: TENANT,
          veterinarioId: VET,
          tutorId: TUTOR,
          petId: PET,
          inicio: alvo,
          tipoAtendimento: 'consulta_domiciliar',
          criadoPorId: 'user-1'
        })
      ).rejects.toThrow(/não atende nesse horário/i);
    });

    it('aceita horário que cabe inteiro dentro da faixa', async () => {
      const alvo = amanhaAs(9);
      prisma.agendaDisponivel.findMany.mockResolvedValue([
        { dia_semana: diaDaSemanaDe(alvo), hora_inicio: '08:00', hora_fim: '18:00', ativo: true }
      ]);

      await expect(
        agendamento.criar({
          tenantId: TENANT,
          veterinarioId: VET,
          tutorId: TUTOR,
          petId: PET,
          inicio: alvo,
          duracaoMinutos: 60,
          tipoAtendimento: 'consulta_domiciliar',
          criadoPorId: 'user-1'
        })
      ).resolves.toBeDefined();
    });

    it('recusa consulta que começa dentro da faixa mas termina depois dela', async () => {
      const alvo = amanhaAs(17, 30);
      prisma.agendaDisponivel.findMany.mockResolvedValue([
        { dia_semana: diaDaSemanaDe(alvo), hora_inicio: '08:00', hora_fim: '18:00', ativo: true }
      ]);

      await expect(
        agendamento.criar({
          tenantId: TENANT,
          veterinarioId: VET,
          tutorId: TUTOR,
          petId: PET,
          inicio: alvo,
          duracaoMinutos: 60, // terminaria 18:30
          tipoAtendimento: 'consulta_domiciliar',
          criadoPorId: 'user-1'
        })
      ).rejects.toThrow(/não atende nesse horário/i);
    });
  });

  describe('horários livres', () => {
    it('não oferece slot que colide com agendamento existente', async () => {
      const dia = amanhaAs(0);
      prisma.agendaDisponivel.findMany.mockResolvedValue([
        { dia_semana: diaDaSemanaDe(dia), hora_inicio: '08:00', hora_fim: '11:00', ativo: true }
      ]);
      prisma.agendamento.findMany.mockResolvedValue([
        { inicio: amanhaAs(9), fim: amanhaAs(10) }
      ]);

      const livres = await agendamento.horariosLivres({
        tenantId: TENANT,
        veterinarioId: VET,
        data: dia,
        duracaoMinutos: 60
      });

      const horas = livres.map((s) => Math.floor(relogioDeParede(s.inicio).minutos / 60));
      expect(horas).toContain(8);
      expect(horas).not.toContain(9); // ocupado
      expect(horas).toContain(10);
    });

    it('devolve vazio quando o vet não tem grade naquele dia', async () => {
      prisma.agendaDisponivel.findMany.mockResolvedValue([]);

      const livres = await agendamento.horariosLivres({
        tenantId: TENANT,
        veterinarioId: VET,
        data: amanhaAs(0)
      });

      expect(livres).toEqual([]);
    });
  });

  describe('mudança de status', () => {
    beforeEach(() => {
      prisma.agendamento.update.mockImplementation(({ data }) => Promise.resolve({ id: 'ag-1', ...data }));
    });

    it('não deixa reabrir um agendamento cancelado', async () => {
      prisma.agendamento.findFirst.mockResolvedValue({ id: 'ag-1', status: 'cancelado' });

      await expect(
        agendamento.alterarStatus({
          tenantId: TENANT,
          agendamentoId: 'ag-1',
          novoStatus: 'confirmado',
          usuarioId: 'user-1'
        })
      ).rejects.toThrow(/Não é possível mudar/i);
    });

    it('registra quem cancelou e por quê', async () => {
      prisma.agendamento.findFirst.mockResolvedValue({ id: 'ag-1', status: 'confirmado' });

      await agendamento.alterarStatus({
        tenantId: TENANT,
        agendamentoId: 'ag-1',
        novoStatus: 'cancelado',
        usuarioId: 'user-9',
        motivo: 'Tutor pediu para desmarcar'
      });

      const data = prisma.agendamento.update.mock.calls[0][0].data;
      expect(data.cancelado_por_id).toBe('user-9');
      expect(data.motivo_cancelamento).toBe('Tutor pediu para desmarcar');
    });

    it('permite marcar falta a partir de confirmado', async () => {
      prisma.agendamento.findFirst.mockResolvedValue({ id: 'ag-1', status: 'confirmado' });

      await expect(
        agendamento.alterarStatus({
          tenantId: TENANT,
          agendamentoId: 'ag-1',
          novoStatus: 'nao_compareceu',
          usuarioId: 'user-1'
        })
      ).resolves.toBeDefined();
    });
  });
});

export {};
