/**
 * O aviso de mensagem nova leva à conversa — e à conversa DA PESSOA CERTA.
 *
 * A URL do push era escolhida pelo tipo de conta de quem ENVIOU: se o remetente
 * era tutor, mandava para a área do veterinário; senão, para a do tutor. Isso
 * funciona enquanto um lado é sempre tutor e o outro sempre veterinário.
 *
 * Desde que o veterinário também pode ser tutor do próprio pet, essa premissa
 * caiu: ele escreve como tutor, o `tipo_usuario` da conta continua dizendo
 * "veterinario", e o aviso jogava o veterinário do outro lado em `/tutor/...` —
 * onde aquela conversa não existe. A pessoa tocava no aviso e chegava numa
 * caixa de entrada vazia.
 *
 * Quem decide aqui é o VÍNCULO, igual ao chat e à videochamada: quem é o
 * `tutor_id` daquele atendimento é o tutor ali.
 */

jest.mock('../../../src/config/r2', () => ({
  uploadBuffer: jest.fn(),
  deleteObject: jest.fn(),
  getSignedDownloadUrl: jest.fn(async (chave: string) => `https://assinada.exemplo/${chave}`)
}));

jest.mock('../../../src/services/push.service', () => ({
  enviarParaUsuario: jest.fn().mockResolvedValue({ enviados: 1 })
}));

jest.mock('../../../src/services/vinculo-atendimento.service', () => ({
  buscarVinculoProfissional: jest.fn()
}));

const prisma = require('../../../src/config/database');
const push = require('../../../src/services/push.service');
const { buscarVinculoProfissional } = require('../../../src/services/vinculo-atendimento.service');
const mensagemController = require('../../../src/controllers/mensagem.controller');

const TUTOR = 'usuario-tutor';
const VET = 'usuario-vet';
/** Conta de veterinário que, NESTE atendimento, é o tutor do próprio pet. */
const VET_DONO_DO_PET = 'usuario-vet-dono-do-pet';

function resposta() {
  const res: any = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

/** Envia uma mensagem e devolve o aviso de push que saiu. */
async function enviar(remetente: string, tipoDaConta: string, body: Record<string, unknown>) {
  const req: any = {
    userId: remetente,
    userType: tipoDaConta,
    tenantId: 'tenant-1',
    user: { id: remetente, nome: 'Quem Escreveu' },
    body: { conteudo: 'Como está a Amora hoje?', tipo: 'texto', ...body },
    file: null,
    params: {},
    query: {},
    app: { get: () => null }
  };

  const next = jest.fn();
  await mensagemController.enviar(req, resposta(), next);
  if (next.mock.calls[0]?.[0]) throw next.mock.calls[0][0];

  return push.enviarParaUsuario.mock.calls[0]?.[1];
}

describe('Para onde o aviso de mensagem leva', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.mensagem.create.mockResolvedValue({
      id: 'msg-1',
      conteudo: 'Como está a Amora hoje?',
      anexos: []
    });
  });

  describe('dentro de um atendimento', () => {
    it('o tutor escreve e o VETERINÁRIO abre na área dele, no atendimento', async () => {
      prisma.solicitacao.findFirst.mockResolvedValue({
        id: 'atend-1',
        tutor_id: TUTOR,
        veterinario: { usuario_id: VET }
      });

      const aviso = await enviar(TUTOR, 'tutor', { atendimentoId: 'atend-1' });

      expect(aviso.url).toBe(`/veterinario/chat/${TUTOR}?atendimento=atend-1`);
    });

    it('o veterinário escreve e o TUTOR abre na área dele, no atendimento', async () => {
      prisma.solicitacao.findFirst.mockResolvedValue({
        id: 'atend-1',
        tutor_id: TUTOR,
        veterinario: { usuario_id: VET }
      });

      const aviso = await enviar(VET, 'veterinario', { atendimentoId: 'atend-1' });

      expect(aviso.url).toBe(`/tutor/chat/${VET}?atendimento=atend-1`);
    });

    /**
     * O caso que quebrava. A conta de quem escreve é `veterinario`, mas neste
     * atendimento ele é o TUTOR — levou o próprio cachorro. Pelo tipo da conta
     * o aviso ia para `/tutor/mensagens`, e quem recebe é o veterinário que
     * está atendendo: a conversa dele mora do outro lado.
     */
    it('veterinário que é tutor do próprio pet não desvia o aviso do outro lado', async () => {
      prisma.solicitacao.findFirst.mockResolvedValue({
        id: 'atend-2',
        tutor_id: VET_DONO_DO_PET,
        veterinario: { usuario_id: VET }
      });

      const aviso = await enviar(VET_DONO_DO_PET, 'veterinario', { atendimentoId: 'atend-2' });

      expect(aviso.url).toBe(`/veterinario/chat/${VET_DONO_DO_PET}?atendimento=atend-2`);
      // O tipo da conta diz "veterinario" nos dois lados e não serve de critério.
      expect(aviso.url).not.toContain('/tutor/');
    });

    it('leva à conversa, não à caixa de entrada — quem toca no aviso quer responder', async () => {
      prisma.solicitacao.findFirst.mockResolvedValue({
        id: 'atend-1',
        tutor_id: TUTOR,
        veterinario: { usuario_id: VET }
      });

      const aviso = await enviar(TUTOR, 'tutor', { atendimentoId: 'atend-1' });

      expect(aviso.url).toContain('/chat/');
      expect(aviso.url).not.toContain('/mensagens');
    });
  });

  describe('conversa direta, fora de um atendimento aberto', () => {
    it('o papel vem do vínculo, o único lugar onde ele está escrito', async () => {
      buscarVinculoProfissional.mockResolvedValue({
        id: 'atend-antigo',
        status: 'finalizado',
        tutorId: TUTOR,
        veterinarioUsuarioId: VET
      });

      const aviso = await enviar(VET, 'veterinario', { destinatarioId: TUTOR });

      // Sem atendimento em curso, sem `?atendimento=` — a conversa abre inteira.
      expect(aviso.url).toBe(`/tutor/chat/${VET}`);
    });

    it('vínculo sem os papéis cai na rota que aceita os dois tipos de conta', async () => {
      // Defensivo: `/veterinario/chat` recusa conta de tutor e a tela nem abre.
      // Na dúvida, errar para o lado que pelo menos mostra a conversa.
      buscarVinculoProfissional.mockResolvedValue({ id: 'atend-antigo', status: 'finalizado' });

      const aviso = await enviar(VET, 'veterinario', { destinatarioId: TUTOR });

      expect(aviso.url).toBe(`/tutor/chat/${VET}`);
    });
  });
});
