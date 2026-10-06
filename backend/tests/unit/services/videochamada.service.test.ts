/**
 * A videochamada da teleorientação.
 *
 * O que estes casos travam: a chamada não abre em atendimento que não é
 * teleorientação, não abre em atendimento encerrado, e o sinal só é repassado
 * por quem participa — o resto é assunto do navegador, e o servidor não vê nem
 * grava a consulta.
 *
 * E, desde 27/08/2026, que a chamada CHAMA. Antes disso `chamada:entrou` só
 * alcançava quem já estava na sala, então o veterinário precisava adivinhar a
 * hora de abrir a tela. Uma videochamada em que ninguém pode ser chamado é uma
 * sala de espera onde os dois combinam por fora.
 */

jest.mock('../../../src/services/push.service', () => ({
  estaConfigurado: () => true,
  enviarParaUsuario: jest.fn().mockResolvedValue({ enviados: 1 })
}));

const push = require('../../../src/services/push.service');
const servico = require('../../../src/services/videochamada.service');

function socketFalso() {
  const emitirNaSala = jest.fn();
  return {
    id: 'socket-1',
    join: jest.fn(),
    leave: jest.fn(),
    emit: jest.fn(),
    to: jest.fn(() => ({ emit: emitirNaSala })),
    emitirNaSala
  };
}

/** Coleta os handlers para dispará-los como o Socket.IO faria. */
function coletor() {
  const handlers: Record<string, (p: Record<string, unknown>) => Promise<void>> = {};
  const registrar = (evento: string, handler: (p: Record<string, unknown>) => Promise<void>) => {
    handlers[evento] = handler;
  };
  return { handlers, registrar };
}

const TUTOR = 'usuario-tutor';
const VET = 'usuario-vet';

const teleorientacao = (status = 'atendimento_em_andamento') => ({
  id: 'atend-1',
  status,
  tipo_atendimento: 'teleorientacao',
  tutor_id: TUTOR,
  veterinario: { usuario_id: VET }
});

/** Entra na chamada como `quem` e devolve o socket usado. */
async function entrarComo(quem: string, atendimento = teleorientacao()) {
  const socket: any = socketFalso();
  socket.user = { id: quem, tipo_usuario: quem === VET ? 'veterinario' : 'tutor' };
  const { handlers, registrar } = coletor();

  servico.registrarSinalizacao({
    socket,
    registrar,
    buscarAtendimentoAutorizado: async () => atendimento
  });

  await handlers['chamada:entrar']({ atendimentoId: atendimento.id });
  return socket;
}

describe('A chamada toca do outro lado', () => {
  beforeEach(() => jest.clearAllMocks());

  it('o tutor entra e o telefone do VETERINÁRIO toca', async () => {
    await entrarComo(TUTOR);

    expect(push.enviarParaUsuario).toHaveBeenCalledTimes(1);
    const [destino, aviso] = push.enviarParaUsuario.mock.calls[0];
    expect(destino).toBe(VET);
    expect(aviso.title).toMatch(/chamada/i);
  });

  it('o veterinário entra e o telefone do TUTOR toca', async () => {
    await entrarComo(VET);

    expect(push.enviarParaUsuario).toHaveBeenCalledWith(TUTOR, expect.anything());
  });

  it('ninguém toca o próprio telefone', async () => {
    await entrarComo(TUTOR);

    const destinos = push.enviarParaUsuario.mock.calls.map((c: any[]) => c[0]);
    expect(destinos).not.toContain(TUTOR);
  });

  it('admin em visita de suporte assiste, não toca telefone de ninguém', async () => {
    await entrarComo('usuario-admin');

    expect(push.enviarParaUsuario).not.toHaveBeenCalled();
  });

  it('o aviso leva a pessoa AO ATENDIMENTO, na tela do papel dela', async () => {
    await entrarComo(TUTOR);
    // Quem recebe é o veterinário: tela do veterinário.
    expect(push.enviarParaUsuario.mock.calls[0][1].url).toBe('/veterinario/atendimento/atend-1');

    jest.clearAllMocks();
    await entrarComo(VET);
    // Quem recebe é o tutor: tela do tutor. Mandar os dois para `/` obrigava a
    // pessoa a procurar o atendimento na mão enquanto o outro lado espera.
    expect(push.enviarParaUsuario.mock.calls[0][1].url).toBe('/tutor/acompanhar/atend-1');
  });

  it('o toque VENCE em 90 s — telefone tocando 40 min depois é aviso falso', async () => {
    await entrarComo(TUTOR);

    const aviso = push.enviarParaUsuario.mock.calls[0][1];
    expect(aviso.ttlSegundos).toBe(90);
    // O padrão de uma hora serve para status, não para chamada.
    expect(aviso.ttlSegundos).toBeLessThan(60 * 60);
  });

  it('avisos do mesmo atendimento se substituem em vez de empilhar', async () => {
    await entrarComo(TUTOR);
    await entrarComo(TUTOR);

    const tags = push.enviarParaUsuario.mock.calls.map((c: any[]) => c[1].tag);
    expect(new Set(tags).size).toBe(1);
    expect(tags[0]).toBe('chamada-atend-1');
  });

  it('push que falha NÃO impede a sala de abrir', async () => {
    push.enviarParaUsuario.mockRejectedValueOnce(new Error('aparelho sem inscrição'));

    const socket = await entrarComo(TUTOR);

    // O que importa é a sala: quem está com a tela aberta continua conectando.
    expect(socket.join).toHaveBeenCalled();
    expect(socket.emit).toHaveBeenCalledWith('chamada:pronto', expect.anything());
  });
});

describe('Videochamada', () => {
  describe('quando a chamada pode abrir', () => {
    it('abre em teleorientação com o atendimento de pé', () => {
      expect(servico.podeAbrirChamada(teleorientacao('aceito'))).toBe(true);
      expect(servico.podeAbrirChamada(teleorientacao('atendimento_em_andamento'))).toBe(true);
    });

    it('não abre em consulta domiciliar — lá o veterinário vai até a casa', () => {
      expect(
        servico.podeAbrirChamada({ id: 'a', status: 'aceito', tipo_atendimento: 'consulta_domiciliar' })
      ).toBe(false);
    });

    it('não abre em atendimento encerrado nem em chamado sem veterinário', () => {
      expect(servico.podeAbrirChamada(teleorientacao('finalizado'))).toBe(false);
      expect(servico.podeAbrirChamada(teleorientacao('procurando_veterinario'))).toBe(false);
      expect(servico.podeAbrirChamada(null)).toBe(false);
    });
  });

  describe('sinalização', () => {
    it('entrar avisa quem já estava na sala — é quem faz a oferta', async () => {
      const socket = socketFalso();
      const { handlers, registrar } = coletor();

      servico.registrarSinalizacao({
        socket,
        registrar,
        buscarAtendimentoAutorizado: async () => teleorientacao()
      });

      await handlers['chamada:entrar']({ atendimentoId: 'atend-1' });

      expect(socket.join).toHaveBeenCalledWith('chamada:atend-1');
      expect(socket.to).toHaveBeenCalledWith('chamada:atend-1');
      expect(socket.emitirNaSala).toHaveBeenCalledWith('chamada:entrou', { socketId: 'socket-1' });
    });

    it('quem não participa do atendimento não entra', async () => {
      const socket = socketFalso();
      const { handlers, registrar } = coletor();

      servico.registrarSinalizacao({
        socket,
        registrar,
        buscarAtendimentoAutorizado: async () => null
      });

      await expect(handlers['chamada:entrar']({ atendimentoId: 'atend-1' })).rejects.toThrow();
      expect(socket.join).not.toHaveBeenCalled();
    });

    it('o sinal é repassado ao destinatário sem o servidor interpretar o conteúdo', async () => {
      const socket = socketFalso();
      const { handlers, registrar } = coletor();
      const dados = { tipo: 'oferta', descricao: { type: 'offer', sdp: 'v=0…' } };

      servico.registrarSinalizacao({
        socket,
        registrar,
        buscarAtendimentoAutorizado: async () => teleorientacao()
      });

      await handlers['chamada:sinal']({ atendimentoId: 'atend-1', para: 'socket-2', dados });

      expect(socket.to).toHaveBeenCalledWith('socket-2');
      expect(socket.emitirNaSala).toHaveBeenCalledWith('chamada:sinal', { de: 'socket-1', dados });
    });

    it('sinal sem destinatário é recusado', async () => {
      const socket = socketFalso();
      const { handlers, registrar } = coletor();

      servico.registrarSinalizacao({
        socket,
        registrar,
        buscarAtendimentoAutorizado: async () => teleorientacao()
      });

      await expect(
        handlers['chamada:sinal']({ atendimentoId: 'atend-1', dados: {} })
      ).rejects.toThrow();
    });

    it('sair avisa o outro lado e deixa a sala', async () => {
      const socket = socketFalso();
      const { handlers, registrar } = coletor();

      servico.registrarSinalizacao({
        socket,
        registrar,
        buscarAtendimentoAutorizado: async () => teleorientacao()
      });

      await handlers['chamada:sair']({ atendimentoId: 'atend-1' });

      expect(socket.emitirNaSala).toHaveBeenCalledWith('chamada:saiu', { socketId: 'socket-1' });
      expect(socket.leave).toHaveBeenCalledWith('chamada:atend-1');
    });
  });

  describe('servidores de conexão', () => {
    const original = { ...process.env };
    afterEach(() => { process.env = { ...original }; });

    it('sem TURN configurado, avisa que não há retransmissão', () => {
      delete process.env.TURN_URL;
      const config = servico.servidoresDeConexao();

      expect(config.tem_retransmissao).toBe(false);
      expect(config.iceServers).toHaveLength(1);
    });

    it('com TURN, entra na lista com as credenciais', () => {
      process.env.TURN_URL = 'turn:turn.exemplo.com:3478';
      process.env.TURN_USERNAME = 'saudepet';
      process.env.TURN_PASSWORD = 'segredo';

      const config = servico.servidoresDeConexao();

      expect(config.tem_retransmissao).toBe(true);
      expect(config.iceServers[1]).toEqual(
        expect.objectContaining({ urls: 'turn:turn.exemplo.com:3478', username: 'saudepet' })
      );
    });
  });
});
