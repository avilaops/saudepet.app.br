const http = require('http');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const { io: createClient } = require('socket.io-client');
const prisma = require('../../src/config/database');
const TokenService = require('../../src/services/token.service');
const { registerSocketSecurity } = require('../../src/services/socket-security.service');

const USER_A = {
  id: 'user-a',
  tenant_id: 'tenant-a',
  tipo_usuario: 'tutor',
  email_verificado: true,
  tenant: { status: 'ativo', expira_em: null },
  veterinario: null
};

function waitFor(socket, event) {
  return new Promise((resolve) => socket.once(event, resolve));
}

describe('Socket.IO autenticado e isolado', () => {
  let httpServer;
  let io;
  let url;
  const clients = [];

  beforeEach(async () => {
    process.env.REQUIRE_EMAIL_VERIFICATION = 'true';
    httpServer = http.createServer();
    io = new Server(httpServer, { cors: { origin: '*' } });
    registerSocketSecurity(io, { prisma, jwt, TokenService });
    await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    url = `http://127.0.0.1:${httpServer.address().port}`;
    prisma.tokenBlacklist.findUnique.mockResolvedValue(null);
    prisma.usuario.findUnique.mockResolvedValue(USER_A);
  });

  afterEach(async () => {
    clients.forEach((client) => client.disconnect());
    clients.length = 0;
    await io.close();
    await new Promise((resolve) => httpServer.close(resolve));
  });

  const client = (auth = {}) => {
    const socket = createClient(url, { auth, transports: ['websocket'], reconnection: false, forceNew: true });
    clients.push(socket);
    return socket;
  };

  it('rejeita conexão sem token', async () => {
    const socket = client();
    const error = await waitFor(socket, 'connect_error');
    expect(error.message).toBe('Não autorizado');
  });

  it('rejeita token inválido', async () => {
    const socket = client({ token: 'token-invalido' });
    const error = await waitFor(socket, 'connect_error');
    expect(error.message).toBe('Não autorizado');
  });

  it('impede entrada em atendimento de outro tenant', async () => {
    const token = jwt.sign({ id: USER_A.id }, process.env.JWT_SECRET);
    const socket = client({ token });
    await waitFor(socket, 'connect');
    prisma.solicitacao.findFirst.mockResolvedValue(null);
    socket.emit('atendimento:join', { solicitacaoId: 'request-tenant-b' });
    const error = await waitFor(socket, 'erro:autorizacao');
    expect(error.error).toBe('Evento não autorizado');
    expect(prisma.solicitacao.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ tenant_id: USER_A.tenant_id })
    }));
  });

  it('impede retransmissão de mensagem não persistida ou sem participação', async () => {
    const token = jwt.sign({ id: USER_A.id }, process.env.JWT_SECRET);
    const socket = client({ token });
    await waitFor(socket, 'connect');
    prisma.mensagem.findFirst.mockResolvedValue(null);
    socket.emit('chat:mensagem', { mensagemId: 'forged-message', remetenteId: 'another-user' });
    const error = await waitFor(socket, 'erro:autorizacao');
    expect(error.error).toBe('Evento não autorizado');
  });

  it('autoriza participante válido a entrar na room do atendimento', async () => {
    const token = jwt.sign({ id: USER_A.id }, process.env.JWT_SECRET);
    const socket = client({ token });
    await waitFor(socket, 'connect');
    prisma.solicitacao.findFirst.mockResolvedValue({
      id: 'request-a',
      tenant_id: USER_A.tenant_id,
      tutor_id: USER_A.id,
      veterinario: { id: 'vet-a', usuario_id: 'vet-user-a' }
    });
    socket.emit('atendimento:join', { solicitacaoId: 'request-a' });
    await new Promise((resolve) => setTimeout(resolve, 30));
    const serverSocket = [...io.sockets.sockets.values()][0];
    expect(serverSocket.rooms.has('atendimento:request-a')).toBe(true);
  });
});

export {};
