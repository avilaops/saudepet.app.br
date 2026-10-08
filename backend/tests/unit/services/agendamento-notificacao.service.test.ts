const prisma = require('../../../src/config/database');
const emailService = require('../../../src/services/email.service');
const notificacao = require('../../../src/services/agendamento-notificacao.service');

const TUTOR_ID = 'tutor-1';
const VET_USUARIO_ID = 'vet-usuario-1';

function agendamentoCompleto(extra = {}) {
  return {
    id: 'ag-1',
    inicio: new Date('2026-09-01T14:00:00Z'),
    tipo_atendimento: 'consulta_domiciliar',
    pet: { nome: 'Rex' },
    tutor: { id: TUTOR_ID, nome: 'Maria', email: 'maria@exemplo.com' },
    veterinario: {
      usuario: { id: VET_USUARIO_ID, nome: 'João', email: 'joao@exemplo.com' }
    },
    ...extra
  };
}

describe('Notificações de agendamento', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.agendamento.findUnique.mockResolvedValue(agendamentoCompleto());
  });

  describe('criação e remarcação', () => {
    it('avisa o tutor quando o vet marca uma consulta', async () => {
      const enviado = await notificacao.notificarCriacao('ag-1');

      expect(enviado).toBe(true);
      expect(emailService.enviarEmailAgendamentoTutor).toHaveBeenCalledWith(
        'maria@exemplo.com',
        expect.objectContaining({ evento: 'marcado', nomePet: 'Rex' })
      );
    });

    it('remarcação avisa o tutor com o evento próprio', async () => {
      await notificacao.notificarRemarcacao('ag-1');

      expect(emailService.enviarEmailAgendamentoTutor).toHaveBeenCalledWith(
        'maria@exemplo.com',
        expect.objectContaining({ evento: 'remarcado' })
      );
    });

    it('tutor sem e-mail não gera envio nem erro', async () => {
      prisma.agendamento.findUnique.mockResolvedValue(
        agendamentoCompleto({ tutor: { id: TUTOR_ID, nome: 'Maria', email: null } })
      );

      const enviado = await notificacao.notificarCriacao('ag-1');

      expect(enviado).toBe(false);
      expect(emailService.enviarEmailAgendamentoTutor).not.toHaveBeenCalled();
    });
  });

  describe('mudança de status: avisa a OUTRA parte', () => {
    it('cancelamento pelo tutor avisa o veterinário', async () => {
      await notificacao.notificarMudancaDeStatus('ag-1', {
        novoStatus: 'cancelado',
        atorId: TUTOR_ID,
        motivo: 'Imprevisto'
      });

      expect(emailService.enviarEmailAgendamentoVet).toHaveBeenCalledWith(
        'joao@exemplo.com',
        expect.objectContaining({ evento: 'cancelado', motivo: 'Imprevisto' })
      );
      expect(emailService.enviarEmailAgendamentoTutor).not.toHaveBeenCalled();
    });

    it('cancelamento pelo vet avisa o tutor', async () => {
      await notificacao.notificarMudancaDeStatus('ag-1', {
        novoStatus: 'cancelado',
        atorId: VET_USUARIO_ID,
        motivo: 'Plantão de emergência'
      });

      expect(emailService.enviarEmailAgendamentoTutor).toHaveBeenCalledWith(
        'maria@exemplo.com',
        expect.objectContaining({ evento: 'cancelado', motivo: 'Plantão de emergência' })
      );
      expect(emailService.enviarEmailAgendamentoVet).not.toHaveBeenCalled();
    });

    it('confirmação pelo tutor avisa o veterinário', async () => {
      await notificacao.notificarMudancaDeStatus('ag-1', {
        novoStatus: 'confirmado',
        atorId: TUTOR_ID
      });

      expect(emailService.enviarEmailAgendamentoVet).toHaveBeenCalledWith(
        'joao@exemplo.com',
        expect.objectContaining({ evento: 'confirmado' })
      );
    });

    it('confirmação pelo próprio vet não avisa ninguém — o tutor já soube da criação', async () => {
      const enviado = await notificacao.notificarMudancaDeStatus('ag-1', {
        novoStatus: 'confirmado',
        atorId: VET_USUARIO_ID
      });

      expect(enviado).toBe(false);
      expect(emailService.enviarEmailAgendamentoTutor).not.toHaveBeenCalled();
      expect(emailService.enviarEmailAgendamentoVet).not.toHaveBeenCalled();
    });

    it('status interno (concluído / não compareceu) não gera e-mail', async () => {
      for (const novoStatus of ['concluido', 'nao_compareceu']) {
        const enviado = await notificacao.notificarMudancaDeStatus('ag-1', {
          novoStatus,
          atorId: VET_USUARIO_ID
        });
        expect(enviado).toBe(false);
      }

      expect(prisma.agendamento.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('best-effort', () => {
    it('falha de e-mail não lança — o agendamento já está gravado', async () => {
      emailService.enviarEmailAgendamentoTutor.mockRejectedValue(new Error('SMTP fora'));

      await expect(notificacao.notificarCriacao('ag-1')).resolves.toBe(false);
    });

    it('agendamento inexistente não lança', async () => {
      prisma.agendamento.findUnique.mockResolvedValue(null);

      await expect(
        notificacao.notificarMudancaDeStatus('sumiu', { novoStatus: 'cancelado', atorId: TUTOR_ID })
      ).resolves.toBe(false);
    });
  });
});

export {};
