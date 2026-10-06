// ═══════════════════════════════════════════════════════
// SETUP GLOBAL DE TESTES
// ═══════════════════════════════════════════════════════

// Configurar variáveis de ambiente
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-key-super-secure';
process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'; // 64 hex chars
// Banco local do Saúde Pet, na 5445 — ver `docker-compose.dev-db.yml`. A porta
// 5432 desta máquina é disputada por outro projeto, e apontar para lá fazia o
// teste bater no banco errado e morrer em "password authentication failed", sem
// dizer por quê. Continua sendo só o padrão: `DATABASE_URL` do ambiente vence.
// `connect_timeout` alto de propósito: as duas suítes E2E abrem cliente Prisma
// real enquanto dezenas de suítes unitárias disputam CPU. Com o padrão de 5s, o
// Prisma desistia da conexão e reportava "Can't reach database server" — as E2E
// passavam sozinhas e falhavam na suíte inteira, que é o pior tipo de teste:
// o que só quebra quando ninguém está olhando. `connection_limit` baixo evita
// que dois clientes sozinhos comam o `max_connections` do contêiner.
process.env.DATABASE_URL = process.env.DATABASE_URL
  || 'postgresql://postgres:postgres@localhost:5445/saudepet_test?connection_limit=5&pool_timeout=30&connect_timeout=30';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';
process.env.FRONTEND_URL = 'http://localhost:5173';

// Timeout para testes
jest.setTimeout(15000);

// Mock do Prisma globalmente
jest.mock('../src/config/database', () => require('./mocks/prisma.mock'));

// O mock do Redis saiu junto com o Redis: `config/redis` importava `ioredis`,
// que nunca esteve nas dependências, e o único arquivo que o usava
// (`cache.middleware`) não era importado por rota nenhuma. Era uma armadilha —
// bastava alguém pendurar o middleware numa rota para o servidor não subir.

// Mock do Email Service. A lista espelha todos os métodos públicos do serviço:
// quando faltava um, o código chamava `undefined` e a notificação caía no
// `catch` de best-effort — o teste passava sem nunca exercitar o envio.
jest.mock('../src/services/email.service', () =>
  require('./mocks/email-service.mock').criarMockDoEmailService());

// Silenciar console em testes (opcional)
if (process.env.SILENT_TESTS === 'true') {
  global.console = {
    ...console,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
}

// Cleanup após cada teste
afterEach(() => {
  jest.clearAllMocks();
});

// Cleanup global
afterAll(() => {
  jest.restoreAllMocks();
});
