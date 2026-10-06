/**
 * A central de notificações de ponta a ponta, contra o Postgres real.
 *
 * O que esta suíte protege, e que a tela antiga não tinha: a central mostra o
 * que REALMENTE foi avisado. Até 31/08/2026 ela era um array de quatro
 * exemplos escritos no frontend, igual para todo mundo.
 *
 * O caso mais importante aqui é o do aparelho sem push: sem inscrição, sem
 * chave VAPID ou com a permissão bloqueada no navegador, o aviso continua
 * tendo que aparecer na central — é exatamente aí que a pessoa precisa
 * encontrá-lo depois. Por isso este arquivo NÃO faz mock do `push.service`:
 * ele exercita o funil de verdade, e só o `web-push` (a rede) é substituído.
 */
const request = require('supertest');
const express = require('express');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

jest.unmock('../../../src/config/database');
jest.unmock('../../../src/services/token.service');
jest.mock('../../../src/services/email.service', () =>
  require('../../mocks/email-service.mock').criarMockDoEmailService());

// Só a rede sai do caminho. O `push.service` roda inteiro, que é o ponto.
jest.mock('web-push', () => ({
  setVapidDetails: jest.fn(),
  sendNotification: jest.fn().mockResolvedValue({ statusCode: 201 })
}));

process.env.DATABASE_URL = process.env.DATABASE_URL
  || 'postgresql://postgres:postgres@localhost:5445/saudepet_test';

const prisma = new PrismaClient();

describe('🔔 Central de notificações — ponta a ponta', () => {
  const carimbo = Date.now();
  const senha = 'Senha@123';

  let app: any;
  let tenantId = '';
  let tokenAna = '';
  let tokenBruno = '';
  let usuarioAna = '';
  let usuarioBruno = '';
  let pushService: typeof import('../../../src/services/push.service');

  async function registrarELogar(nome: string, email: string) {
    const cadastro = await request(app).post('/api/v1/auth/register').send({
      nome, email, senha, tipo_usuario: 'tutor', tenant_slug: 'clinica-demo'
    });
    expect(cadastro.status).toBe(201);
    const login = await request(app).post('/api/v1/auth/login').send({ email, senha, tenant_slug: 'clinica-demo' });
    expect(login.status).toBe(200);
    return { token: login.body.access_token as string, id: login.body.usuario.id as string };
  }

  beforeAll(async () => {
    process.env.REQUIRE_EMAIL_VERIFICATION = 'false';
    // As chaves precisam existir ANTES do módulo carregar: o `configurado` do
    // push.service é decidido uma vez, no topo do arquivo.
    process.env.WEB_PUSH_VAPID_PUBLIC_KEY = 'chave-publica-de-teste';
    process.env.WEB_PUSH_VAPID_PRIVATE_KEY = 'chave-privada-de-teste';
    pushService = require('../../../src/services/push.service');

    app = express();
    app.use(express.json());
    app.use('/api/v1/auth', require('../../../src/routes/auth.routes'));
    app.use('/api/v1/minhas-notificacoes', require('../../../src/routes/minhas-notificacoes.routes'));
    app.use(require('../../../src/middleware/error.middleware').errorHandler);

    const tenant = await prisma.tenant.upsert({
      where: { slug: 'clinica-demo' },
      update: {},
      create: {
        slug: 'clinica-demo', nome: 'Clínica Veterinária Demo', email: 'contato@clinica-demo.teste',
        telefone: '11999990000', cidade: 'São Paulo', estado: 'SP', plano: 'premium', status: 'ativo',
        limite_usuarios: 1000, limite_pets: 5000
      }
    });
    tenantId = tenant.id;

    const ana = await registrarELogar(`Ana ${carimbo}`, `ana.${carimbo}@example.com`);
    const bruno = await registrarELogar(`Bruno ${carimbo}`, `bruno.${carimbo}@example.com`);
    tokenAna = ana.token; usuarioAna = ana.id;
    tokenBruno = bruno.token; usuarioBruno = bruno.id;
  });

  afterAll(async () => {
    await prisma.notificacao.deleteMany({ where: { usuario_id: { in: [usuarioAna, usuarioBruno] } } });
    await prisma.$disconnect();
  });

  it('1. sem nenhum aviso, a central vem vazia — e não inventa exemplo', async () => {
    const resposta = await request(app)
      .get('/api/v1/minhas-notificacoes')
      .set('Authorization', `Bearer ${tokenAna}`);

    expect(resposta.status).toBe(200);
    expect(resposta.body.notificacoes).toEqual([]);
    expect(resposta.body.naoLidas).toBe(0);
  });

  it('2. aviso enviado sem aparelho inscrito ainda assim entra na central', async () => {
    // Ana não tem PushSubscription: não há para onde entregar.
    const resultado = await pushService.enviarParaUsuario(usuarioAna, {
      title: 'Veterinário a caminho',
      body: 'O Dr. Lucas saiu para o atendimento do Lufi.',
      url: '/tutor/acompanhar/123',
      icone: 'ambulance'
    });

    expect(resultado.enviados).toBe(0);

    const resposta = await request(app)
      .get('/api/v1/minhas-notificacoes')
      .set('Authorization', `Bearer ${tokenAna}`);

    expect(resposta.status).toBe(200);
    expect(resposta.body.naoLidas).toBe(1);
    expect(resposta.body.notificacoes).toHaveLength(1);
    expect(resposta.body.notificacoes[0]).toMatchObject({
      titulo: 'Veterinário a caminho',
      link: '/tutor/acompanhar/123',
      icone: 'ambulance',
      lida: false
    });
  });

  it('3. aviso sem link não guarda a rota-raiz como se fosse destino', async () => {
    await pushService.enviarParaUsuario(usuarioAna, {
      title: 'Comprovante disponível',
      body: 'O comprovante do último pagamento já pode ser visto.'
    });

    const resposta = await request(app)
      .get('/api/v1/minhas-notificacoes')
      .set('Authorization', `Bearer ${tokenAna}`);

    expect(resposta.body.notificacoes[0].titulo).toBe('Comprovante disponível');
    expect(resposta.body.notificacoes[0].link).toBeNull();
  });

  it('4. `semHistorico` fica só no instante: não vira linha na central', async () => {
    await pushService.enviarParaUsuario(usuarioAna, {
      title: 'Chamada de vídeo',
      body: 'O veterinário está chamando.',
      semHistorico: true
    });

    const resposta = await request(app)
      .get('/api/v1/minhas-notificacoes')
      .set('Authorization', `Bearer ${tokenAna}`);

    expect(resposta.body.notificacoes.map((n: any) => n.titulo)).not.toContain('Chamada de vídeo');
  });

  it('5. a central de uma pessoa não mostra o aviso da outra', async () => {
    await pushService.enviarParaUsuario(usuarioBruno, {
      title: 'Aviso do Bruno',
      body: 'Só ele deve ver isto.'
    });

    const daAna = await request(app)
      .get('/api/v1/minhas-notificacoes')
      .set('Authorization', `Bearer ${tokenAna}`);
    const doBruno = await request(app)
      .get('/api/v1/minhas-notificacoes')
      .set('Authorization', `Bearer ${tokenBruno}`);

    expect(daAna.body.notificacoes.map((n: any) => n.titulo)).not.toContain('Aviso do Bruno');
    expect(doBruno.body.notificacoes.map((n: any) => n.titulo)).toContain('Aviso do Bruno');
    expect(doBruno.body.naoLidas).toBe(1);
  });

  it('6. a lista é uma só: tudo da pessoa vem junto, mais novo primeiro', async () => {
    const resposta = await request(app)
      .get('/api/v1/minhas-notificacoes')
      .set('Authorization', `Bearer ${tokenAna}`);

    expect(resposta.status).toBe(200);
    expect(resposta.body.notificacoes.length).toBeGreaterThan(1);

    const datas = resposta.body.notificacoes.map((n: any) => new Date(n.criado_em).getTime());
    expect(datas).toEqual([...datas].sort((a, b) => b - a));
  });

  it('7. marcar uma como lida derruba o contador do sino', async () => {
    const antes = await request(app)
      .get('/api/v1/minhas-notificacoes')
      .set('Authorization', `Bearer ${tokenAna}`);
    const alvo = antes.body.notificacoes[0];
    expect(antes.body.naoLidas).toBe(2);

    const resposta = await request(app)
      .patch(`/api/v1/minhas-notificacoes/${alvo.id}/lida`)
      .set('Authorization', `Bearer ${tokenAna}`);

    expect(resposta.status).toBe(200);
    expect(resposta.body.naoLidas).toBe(1);
  });

  it('8. ninguém marca como lida a notificação de outra pessoa', async () => {
    const doBruno = await request(app)
      .get('/api/v1/minhas-notificacoes')
      .set('Authorization', `Bearer ${tokenBruno}`);
    const alvoDoBruno = doBruno.body.notificacoes[0];

    // A Ana tenta, conhecendo o id. A rota responde ok (é idempotente), mas
    // a escrita filtra por dono e nada muda para o Bruno.
    await request(app)
      .patch(`/api/v1/minhas-notificacoes/${alvoDoBruno.id}/lida`)
      .set('Authorization', `Bearer ${tokenAna}`);

    const depois = await request(app)
      .get('/api/v1/minhas-notificacoes/nao-lidas')
      .set('Authorization', `Bearer ${tokenBruno}`);

    expect(depois.body.naoLidas).toBe(1);
  });

  it('9. marcar todas zera o contador, e só as de quem pediu', async () => {
    const resposta = await request(app)
      .post('/api/v1/minhas-notificacoes/lidas')
      .set('Authorization', `Bearer ${tokenAna}`);

    expect(resposta.status).toBe(200);
    expect(resposta.body.naoLidas).toBe(0);

    const doBruno = await request(app)
      .get('/api/v1/minhas-notificacoes/nao-lidas')
      .set('Authorization', `Bearer ${tokenBruno}`);
    expect(doBruno.body.naoLidas).toBe(1);
  });

  it('10. a central exige login', async () => {
    const resposta = await request(app).get('/api/v1/minhas-notificacoes');
    expect(resposta.status).toBe(401);
  });

  it('11. o limite tem teto: `?limite=999999` não vira dump da tabela', async () => {
    for (let i = 0; i < 3; i += 1) {
      await pushService.enviarParaUsuario(usuarioAna, { title: `Extra ${i}`, body: 'corpo' });
    }

    const resposta = await request(app)
      .get('/api/v1/minhas-notificacoes?limite=999999')
      .set('Authorization', `Bearer ${tokenAna}`);

    expect(resposta.status).toBe(200);
    expect(resposta.body.notificacoes.length).toBeLessThanOrEqual(50);
  });

  it('12. a paginação por cursor não repete nem pula aviso', async () => {
    const primeira = await request(app)
      .get('/api/v1/minhas-notificacoes?limite=2')
      .set('Authorization', `Bearer ${tokenAna}`);

    expect(primeira.body.notificacoes).toHaveLength(2);
    expect(primeira.body.proximoCursor).toBeTruthy();

    const segunda = await request(app)
      .get(`/api/v1/minhas-notificacoes?limite=2&antes_de=${encodeURIComponent(primeira.body.proximoCursor)}`)
      .set('Authorization', `Bearer ${tokenAna}`);

    const idsPrimeira = primeira.body.notificacoes.map((n: any) => n.id);
    const idsSegunda = segunda.body.notificacoes.map((n: any) => n.id);

    expect(idsSegunda.some((id: string) => idsPrimeira.includes(id))).toBe(false);
  });

  it('13. com aparelho inscrito, o aviso sai E fica guardado', async () => {
    await prisma.pushSubscription.create({
      data: {
        tenant_id: tenantId,
        usuario_id: usuarioBruno,
        endpoint: `https://push.teste/${carimbo}`,
        p256dh: 'chave-p256dh-de-teste',
        auth: 'chave-auth-de-teste'
      }
    });

    const resultado = await pushService.enviarParaUsuario(usuarioBruno, {
      title: 'Atendimento finalizado',
      body: 'O prontuário do Lufi já está disponível.'
    });

    expect(resultado.enviados).toBe(1);

    const resposta = await request(app)
      .get('/api/v1/minhas-notificacoes')
      .set('Authorization', `Bearer ${tokenBruno}`);

    expect(resposta.body.notificacoes[0].titulo).toBe('Atendimento finalizado');
  });
});
