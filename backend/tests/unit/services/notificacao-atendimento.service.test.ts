/**
 * A matriz de avisos.
 *
 * O caso que mais importa aqui é o de cobertura: um status novo não pode entrar
 * em produção mudo. Ou ele avisa alguém, ou está declarado como silencioso com
 * o motivo escrito — e o teste falha se não for nem um nem outro.
 */

jest.mock('../../../src/services/push.service', () => ({
  estaConfigurado: jest.fn(() => true),
  enviarParaUsuario: jest.fn()
}));

jest.mock('../../../src/services/email.service', () => ({
  sendMail: jest.fn()
}));

const prisma = require('../../../src/config/database');
const pushService = require('../../../src/services/push.service');
const emailService = require('../../../src/services/email.service');
const { MATRIZ, SILENCIOSOS, notificarTransicao } = require('../../../src/services/notificacao-atendimento.service');
const { TRANSICOES } = require('../../../src/services/atendimento-state.service');

function atendimento() {
  return {
    tutor_id: 'tutor-1',
    pet: { nome: 'Amora' },
    tutor: { email: 'marina@exemplo.com.br', nome: 'Marina' },
    veterinario: {
      usuario_id: 'vet-usuario-1',
      usuario: { email: 'henrique@exemplo.com.br', nome: 'Henrique' }
    }
  };
}

describe('Avisos das transições do atendimento', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.solicitacao.findFirst.mockResolvedValue(atendimento());
    pushService.estaConfigurado.mockReturnValue(true);
    pushService.enviarParaUsuario.mockResolvedValue(undefined);
    emailService.sendMail.mockResolvedValue(undefined);
  });

  describe('cobertura', () => {
    it('todo status alcançável avisa alguém ou está declarado silencioso', () => {
      const alcancaveis = new Set<string>();
      for (const destinos of Object.values(TRANSICOES) as string[][]) {
        destinos.forEach((destino) => alcancaveis.add(destino));
      }

      const mudos = [...alcancaveis].filter(
        (status) => !MATRIZ[status] && !(status in SILENCIOSOS)
      );

      expect(mudos).toEqual([]);
    });

    it('todo silencioso tem o motivo escrito, não só o nome na lista', () => {
      for (const [status, motivo] of Object.entries(SILENCIOSOS)) {
        expect(typeof motivo).toBe('string');
        expect(motivo.length).toBeGreaterThan(20);
        // Silencioso e com aviso ao mesmo tempo seria contradição.
        expect(MATRIZ[status]).toBeUndefined();
      }
    });

    it('todo aviso tem título, corpo e ao menos um canal', () => {
      for (const linha of Object.values(MATRIZ) as Record<string, unknown>[]) {
        for (const aviso of Object.values(linha) as Array<{
          titulo: string; corpo: (p: string) => string; canais: string[];
        }>) {
          expect(aviso.titulo.length).toBeGreaterThan(3);
          expect(aviso.corpo('Amora')).toContain('Amora');
          expect(aviso.canais.length).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('envio', () => {
    it('avisa o tutor por push com link relativo — o service worker abre dentro do app', async () => {
      await notificarTransicao({ id: 'atend-1', tenantId: 'tenant-1', para: 'chegou' });

      expect(pushService.enviarParaUsuario).toHaveBeenCalledWith(
        'tutor-1',
        expect.objectContaining({ url: '/tutor/acompanhar/atend-1', tag: 'atendimento-atend-1' })
      );
    });

    it('o encaminhamento sai pelos dois canais — é o aviso mais grave do produto', async () => {
      await notificarTransicao({ id: 'atend-1', tenantId: 'tenant-1', para: 'encaminhado' });

      expect(pushService.enviarParaUsuario).toHaveBeenCalled();
      expect(emailService.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'marina@exemplo.com.br' })
      );
    });

    it('cancelamento do tutor avisa o veterinário, que pode estar dirigindo para lá', async () => {
      await notificarTransicao({ id: 'atend-1', tenantId: 'tenant-1', para: 'cancelado_tutor' });

      expect(pushService.enviarParaUsuario).toHaveBeenCalledWith('vet-usuario-1', expect.anything());
      // E não avisa o tutor do que ele mesmo fez.
      expect(pushService.enviarParaUsuario).not.toHaveBeenCalledWith('tutor-1', expect.anything());
    });

    it('status silencioso não manda nada', async () => {
      await notificarTransicao({ id: 'atend-1', tenantId: 'tenant-1', para: 'procurando_veterinario' });

      expect(pushService.enviarParaUsuario).not.toHaveBeenCalled();
      expect(emailService.sendMail).not.toHaveBeenCalled();
    });

    it('push desligado não impede o e-mail', async () => {
      pushService.estaConfigurado.mockReturnValue(false);

      // `sem_veterinario` e não `finalizado`: o fechamento manda o e-mail com a
      // receita em anexo por outro caminho, e somar um genérico aqui daria dois
      // e-mails no mesmo minuto sobre a mesma coisa.
      await notificarTransicao({ id: 'atend-1', tenantId: 'tenant-1', para: 'sem_veterinario' });

      expect(pushService.enviarParaUsuario).not.toHaveBeenCalled();
      expect(emailService.sendMail).toHaveBeenCalled();
    });

    it('falha de um canal não cala o outro nem lança', async () => {
      pushService.enviarParaUsuario.mockRejectedValue(new Error('inscrição expirada'));

      await expect(
        notificarTransicao({ id: 'atend-1', tenantId: 'tenant-1', para: 'sem_veterinario' })
      ).resolves.toBeDefined();
      expect(emailService.sendMail).toHaveBeenCalled();
    });

    it('a finalização não manda e-mail genérico — o das receitas já vai por outro caminho', async () => {
      await notificarTransicao({ id: 'atend-1', tenantId: 'tenant-1', para: 'finalizado' });

      expect(pushService.enviarParaUsuario).toHaveBeenCalled();
      expect(emailService.sendMail).not.toHaveBeenCalled();
    });

    it('"a caminho" usa o template do momento, não o texto genérico', async () => {
      emailService.enviarEmailVeterinarioACaminho = jest.fn().mockResolvedValue(undefined);

      await notificarTransicao({ id: 'atend-1', tenantId: 'tenant-1', para: 'a_caminho' });

      expect(emailService.enviarEmailVeterinarioACaminho).toHaveBeenCalledWith(
        'marina@exemplo.com.br',
        expect.objectContaining({ nomePet: 'Amora', nomeVet: 'Henrique' })
      );
      expect(emailService.sendMail).not.toHaveBeenCalled();
    });

    it('atendimento inexistente não quebra', async () => {
      prisma.solicitacao.findFirst.mockResolvedValue(null);

      await expect(
        notificarTransicao({ id: 'sumiu', tenantId: 'tenant-1', para: 'chegou' })
      ).resolves.toEqual({ enviados: 0 });
    });
  });
});
