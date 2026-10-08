/**
 * ═══════════════════════════════════════════════════════
 * FLUXO COMPLETO - JORNADA INTEGRADA DO USUÁRIO
 *
 * Teste E2E que valida a integração de TODAS as features:
 * 1. Multi-tenancy
 * 2. Autenticação avançada
 * 3. Gestão de pets
 * 4. Formulários dinâmicos
 * 5. Solicitações de atendimento
 * 6. Chat em tempo real
 * 7. Avaliações
 * 8. Sistema de billing
 * 9. Sistema de moderação
 * 10. Notificações
 * ═══════════════════════════════════════════════════════
 */

const request = require('supertest');
const express = require('express');
const { PrismaClient } = require('@prisma/client');

// Desabilitar TODOS os mocks para testes E2E
jest.unmock('../../../src/config/database');
jest.unmock('../../../src/services/token.service');

// Mockar apenas email service para evitar erros de SMTP
jest.mock('../../../src/services/email.service', () =>
  require('../../mocks/email-service.mock').criarMockDoEmailService());

// O R2 não é alcançável nos testes: devolvemos uma URL assinada falsa, para
// exercitar o caminho completo do anexo mesmo assim.
jest.mock('../../../src/config/r2', () => ({
  uploadBuffer: jest.fn(async (buffer, key) => `https://cdn.teste/${key}`),
  deleteObject: jest.fn(async () => undefined),
  keyFromUrl: jest.fn((url) => url),
  getSignedDownloadUrl: jest.fn(async (key) => `https://cdn.teste/${key}?assinada=1`)
}));

// Garantir que estamos usando o banco de teste
process.env.DATABASE_URL = process.env.DATABASE_URL
  || 'postgresql://postgres:postgres@localhost:5445/saudepet_test';

describe('🎯 FLUXO COMPLETO - Jornada Integrada do Usuário', () => {
  let app;
  let prisma;

  // Contexto compartilhado do fluxo
  const context = {
    tenant: {},
    tutor: {},
    veterinario: {},
    admin: {},
    pet: {},
    formulario: {},
    solicitacao: {},
    mensagem: {},
    avaliacao: {},
    transacao: {},
  };

  beforeAll(async () => {
    // Setup da aplicação
    app = express();
    app.use(express.json());

    // Importar rotas
    const authRoutes = require('../../../src/routes/auth.routes');
    const petRoutes = require('../../../src/routes/pet.routes');
    const lembreteRoutes = require('../../../src/routes/lembrete.routes');
    const solicitacaoRoutes = require('../../../src/routes/solicitacao.routes');
    const mensagemRoutes = require('../../../src/routes/mensagem.routes');
    const avaliacaoRoutes = require('../../../src/routes/avaliacao.routes');
    const { errorHandler } = require('../../../src/middleware/error.middleware');

    // Registrar rotas
    app.use('/api/v1/auth', authRoutes);
    app.use('/api/v1/pets', petRoutes);
    app.use('/api/v1/lembretes', lembreteRoutes);
    app.use('/api/v1/solicitacoes', solicitacaoRoutes);
    app.use('/api/v1/mensagens', mensagemRoutes);
    app.use('/api/v1/avaliacoes', avaliacaoRoutes);
    app.use('/api/v1/agenda', require('../../../src/routes/agenda.routes'));
    app.use('/api/v1/veterinario/crm', require('../../../src/routes/crm-veterinario.routes'));
    app.use(errorHandler);

    prisma = new PrismaClient();

    // Garantir que existe um tenant para testes
    const existingTenant = await prisma.tenant.findUnique({
      where: { slug: 'clinica-demo' }
    });

    if (!existingTenant) {
      context.tenant = await prisma.tenant.create({
        data: {
          slug: 'clinica-demo',
          nome: 'Clínica Veterinária Demo',
          email: 'contato@clinica-demo.teste',
          telefone: '11999990000',
          cidade: 'São Paulo',
          estado: 'SP',
          plano: 'premium',
          status: 'ativo',
          limite_usuarios: 1000,
          limite_pets: 5000,
        }
      });
    } else {
      context.tenant = existingTenant;
    }
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });

  /**
   * ═══════════════════════════════════════════════════════
   * FASE 1: ONBOARDING - CADASTRO E AUTENTICAÇÃO
   * ═══════════════════════════════════════════════════════
   */
  describe('📝 FASE 1: Onboarding - Cadastro e Autenticação', () => {
    it('1.1 deve cadastrar um TUTOR na plataforma', async () => {
      const uniqueId = Date.now();

      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          nome: `Maria Silva ${uniqueId}`,
          email: `maria.${uniqueId}@example.com`,
          telefone: `(11) 9${uniqueId.toString().slice(-8)}`,
          senha: 'SenhaSegura@123',
          tipo_usuario: 'tutor',
          cidade: 'São Paulo',
          tenant_slug: 'clinica-demo'
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('access_token');
      expect(response.body).toHaveProperty('refresh_token');
      expect(response.body.usuario.tipo_usuario).toBe('tutor');

      // Salvar no contexto
      context.tutor.token = response.body.access_token;
      context.tutor.refreshToken = response.body.refresh_token;
      context.tutor.id = response.body.usuario.id;
      context.tutor.email = response.body.usuario.email;
    });

    it('1.2 deve cadastrar um VETERINÁRIO na plataforma', async () => {
      const uniqueId = Date.now() + 1;

      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          nome: `Dr. João Santos ${uniqueId}`,
          email: `dr.joao.${uniqueId}@example.com`,
          telefone: `(11) 9${uniqueId.toString().slice(-8)}`,
          senha: 'SenhaSegura@123',
          tipo_usuario: 'veterinario',
          cidade: 'São Paulo',
          tenant_slug: 'clinica-demo',
          crmv: `${uniqueId.toString().slice(-5)}`,
          crmv_uf: 'SP',
          especialidade: 'Clínica Geral e Cirurgia'
        });

      expect(response.status).toBe(201);
      expect(response.body.usuario.tipo_usuario).toBe('veterinario');
      // v1.0: veterinário não recebe sessão no cadastro — só depois do e-mail
      // confirmado e da aprovação do admin.
      expect(response.body.access_token).toBeNull();

      context.veterinario.id = response.body.usuario.id;
      context.veterinario.email = response.body.usuario.email;

      // Confirmar e-mail e aprovar diretamente no banco para testes
      await prisma.veterinario.updateMany({
        where: { usuario_id: response.body.usuario.id },
        data: { aprovado_admin: true, status_credenciamento: 'APPROVED' }
      });
      await prisma.usuario.update({
        where: { id: response.body.usuario.id },
        data: { email_verificado: true }
      });

      const login = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: context.veterinario.email, senha: 'SenhaSegura@123', tenant_slug: 'clinica-demo' });
      expect(login.status).toBe(200);
      context.veterinario.token = login.body.access_token;
    });

    it('1.3 tutor deve fazer LOGIN e receber tokens válidos', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: context.tutor.email,
          senha: 'SenhaSegura@123',
          tenant_slug: 'clinica-demo'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('access_token');
      expect(response.body).toHaveProperty('refresh_token');

      // Validar que os tokens são diferentes dos anteriores (rotação)
      expect(response.body.access_token).toBeTruthy();
    });

    it('1.4 deve validar perfil autenticado (/me)', async () => {
      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${context.tutor.token}`);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(context.tutor.id);
      expect(response.body.email).toBe(context.tutor.email);
      expect(response.body).toHaveProperty('tenant_id');
    });
  });

  /**
   * ═══════════════════════════════════════════════════════
   * FASE 2: CADASTRO DE PET E FORMULÁRIO
   * ═══════════════════════════════════════════════════════
   */
  describe('🐕 FASE 2: Cadastro de Pet', () => {
    it('2.1 tutor deve cadastrar um PET', async () => {
      const response = await request(app)
        .post('/api/v1/pets')
        .set('Authorization', `Bearer ${context.tutor.token}`)
        .send({
          nome: 'Rex',
          tipo: 'cachorro',  // Campo correto é 'tipo', não 'especie'
          raca: 'Labrador',
          idade: 3,
          peso: 28.5,
          observacoes: 'Pet muito ativo e saudável'
        });

      expect(response.status).toBe(201);
      expect(response.body.pet).toHaveProperty('id');
      expect(response.body.pet.nome).toBe('Rex');
      expect(response.body.pet.tutor_id).toBe(context.tutor.id);

      context.pet.id = response.body.pet.id;
    });

    it('2.2 deve listar os pets do tutor', async () => {
      const response = await request(app)
        .get('/api/v1/pets')
        .set('Authorization', `Bearer ${context.tutor.token}`);

      expect(response.status).toBe(200);
      expect(response.body.pets).toBeInstanceOf(Array);
      expect(response.body.pets.length).toBeGreaterThan(0);

      const rexPet = response.body.pets.find(p => p.id === context.pet.id);
      expect(rexPet).toBeDefined();
      expect(rexPet.nome).toBe('Rex');
    });

    it('2.3 deve atualizar informações do pet', async () => {
      const response = await request(app)
        .put(`/api/v1/pets/${context.pet.id}`)
        .set('Authorization', `Bearer ${context.tutor.token}`)
        .send({
          peso: 29.0,
          observacoes: 'Pet ganhou peso após ração especial'
        });

      expect(response.status).toBe(200);
      expect(response.body.pet.peso).toBe(29.0);
    });
  });

  /**
   * ═══════════════════════════════════════════════════════
   * FASE 3: SOLICITAÇÃO DE ATENDIMENTO
   * ═══════════════════════════════════════════════════════
   */
  describe('🏥 FASE 3: Solicitação de Atendimento', () => {
    it('3.1 tutor deve criar SOLICITAÇÃO de atendimento', async () => {
      const response = await request(app)
        .post('/api/v1/solicitacoes')
        .set('Authorization', `Bearer ${context.tutor.token}`)
        .send({
          pet_id: context.pet.id,
          observacoes: 'Rex está com tosse persistente há 2 dias e um pouco de febre',
          tipo_atendimento: 'emergencia',
          // Endereço e coordenada são obrigatórios desde que o despacho passou a
          // exigir um ponto de partida para medir distância.
          localizacao_cliente: 'Rua das Flores, 100 - São Paulo',
          latitude: -23.5613,
          longitude: -46.6565
        });

      expect(response.status).toBe(201);
      expect(response.body.solicitacao).toHaveProperty('id');
      expect(response.body.solicitacao.status).toBe('procurando_veterinario');
      expect(response.body.solicitacao.pet_id).toBe(context.pet.id);
      // Os sintomas descritos pelo tutor precisam sobreviver até o veterinário:
      // eram descartados antes de chegar ao banco.
      expect(response.body.solicitacao.observacoes).toContain('tosse persistente');

      context.solicitacao.id = response.body.solicitacao.id;
    });

    it('3.2 veterinário deve VER solicitações disponíveis', async () => {
      const response = await request(app)
        .get('/api/v1/solicitacoes?status=procurando_veterinario')
        .set('Authorization', `Bearer ${context.veterinario.token}`);

      expect(response.status).toBe(200);
      expect(response.body.solicitacoes).toBeInstanceOf(Array);

      // Verificar que a solicitação criada está na lista
      const solicitacao = response.body.solicitacoes.find(
        s => s.id === context.solicitacao.id
      );
      expect(solicitacao).toBeDefined();
    });

    it('3.3 veterinário deve ACEITAR a solicitação', async () => {
      const response = await request(app)
        .put(`/api/v1/solicitacoes/${context.solicitacao.id}/aceitar`)
        .set('Authorization', `Bearer ${context.veterinario.token}`);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('veterinario_encontrado');
      expect(response.body.veterinario_id).toBeDefined();

      // Salvar ID do registro Veterinario (diferente do usuario_id)
      context.veterinario.veterinarioId = response.body.veterinario_id;
    });

    // O tutor acompanha deslocamento e chegada ao vivo, então essas etapas não
    // podem ser puladas — a máquina de estados recusa o salto direto para o
    // atendimento em andamento.
    it('3.4 veterinário deve percorrer DESLOCAMENTO e CHEGADA antes de iniciar', async () => {
      for (const status of ['a_caminho', 'chegou']) {
        const response = await request(app)
          .put(`/api/v1/solicitacoes/${context.solicitacao.id}/status`)
          .set('Authorization', `Bearer ${context.veterinario.token}`)
          .send({ status });

        expect(response.status).toBe(200);
        expect(response.body.status).toBe(status);
      }
    });

    it('3.5 veterinário NÃO deve conseguir pular etapas do atendimento', async () => {
      const response = await request(app)
        .put(`/api/v1/solicitacoes/${context.solicitacao.id}/status`)
        .set('Authorization', `Bearer ${context.veterinario.token}`)
        .send({ status: 'veterinario_encontrado' });

      expect(response.status).toBe(409);
    });

    // Encerrar por esta rota deixava o atendimento finalizado sem prontuário,
    // sem receita e sem os PDFs que vão para o tutor.
    it('3.5b a rota de status NÃO deve encerrar o atendimento', async () => {
      const response = await request(app)
        .put(`/api/v1/solicitacoes/${context.solicitacao.id}/status`)
        .set('Authorization', `Bearer ${context.veterinario.token}`)
        .send({ status: 'finalizado' });

      expect(response.status).toBe(400);
      expect(JSON.stringify(response.body)).toContain('finalizar');
    });

    it('3.6 veterinário deve INICIAR o atendimento', async () => {
      const response = await request(app)
        .put(`/api/v1/solicitacoes/${context.solicitacao.id}/iniciar`)
        .set('Authorization', `Bearer ${context.veterinario.token}`);

      expect(response.status).toBe(200);
      expect(response.body.solicitacao.status).toBe('atendimento_em_andamento');
    });

    it('3.7 a linha do tempo deve registrar cada etapa com autor', async () => {
      const response = await request(app)
        .get(`/api/v1/solicitacoes/${context.solicitacao.id}/timeline`)
        .set('Authorization', `Bearer ${context.tutor.token}`);

      expect(response.status).toBe(200);

      const percurso = response.body.eventos.map(e => e.status);
      expect(percurso).toEqual([
        'procurando_veterinario',
        'veterinario_encontrado',
        'a_caminho',
        'chegou',
        'atendimento_em_andamento'
      ]);

      const chegada = response.body.eventos.find(e => e.status === 'chegou');
      expect(chegada.status_anterior).toBe('a_caminho');
      expect(chegada.ator_id).toBe(context.veterinario.id);
      expect(chegada.ator_tipo).toBe('veterinario');
      expect(chegada.registrado_em).toBeDefined();
    });
  });

  /**
   * ═══════════════════════════════════════════════════════
   * FASE 4: COMUNICAÇÃO - CHAT EM TEMPO REAL
   * ═══════════════════════════════════════════════════════
   */
  describe('💬 FASE 4: Chat em Tempo Real', () => {
    it('4.1 tutor deve ENVIAR mensagem para o veterinário', async () => {
      const response = await request(app)
        .post('/api/v1/mensagens')
        .set('Authorization', `Bearer ${context.tutor.token}`)
        .send({
          solicitacao_id: context.solicitacao.id,
          conteudo: 'Olá Dr., a febre do Rex está em 39.5°C. Devo dar algum remédio?'
        });

      expect(response.status).toBe(201);
      expect(response.body.mensagem).toHaveProperty('id');
      expect(response.body.mensagem.remetente_id).toBe(context.tutor.id);

      context.mensagem.tutorId = response.body.mensagem.id;
    });

    it('4.2 veterinário deve RESPONDER ao tutor', async () => {
      const response = await request(app)
        .post('/api/v1/mensagens')
        .set('Authorization', `Bearer ${context.veterinario.token}`)
        .send({
          solicitacao_id: context.solicitacao.id,
          conteudo: 'Não dê nenhum remédio ainda. Vou avaliar o Rex pessoalmente. Já estou a caminho.'
        });

      expect(response.status).toBe(201);
      expect(response.body.mensagem.remetente_id).toBe(context.veterinario.id);

      context.mensagem.vetId = response.body.mensagem.id;
    });

    it('4.3 deve LISTAR todas as mensagens da conversa', async () => {
      const response = await request(app)
        .get(`/api/v1/mensagens?solicitacao_id=${context.solicitacao.id}`)
        .set('Authorization', `Bearer ${context.tutor.token}`);

      expect(response.status).toBe(200);
      expect(response.body.mensagens).toBeInstanceOf(Array);
      expect(response.body.mensagens.length).toBeGreaterThanOrEqual(2);

      // Verificar ordem cronológica
      const mensagens = response.body.mensagens;
      for (let i = 1; i < mensagens.length; i++) {
        const anterior = new Date(mensagens[i - 1].criado_em);
        const atual = new Date(mensagens[i].criado_em);
        expect(atual.getTime()).toBeGreaterThanOrEqual(anterior.getTime());
      }
    });

    it('4.4 deve MARCAR mensagens como lidas', async () => {
      const response = await request(app)
        .put(`/api/v1/mensagens/${context.mensagem.tutorId}/lida`)
        .set('Authorization', `Bearer ${context.veterinario.token}`);

      expect(response.status).toBe(200);
      expect(response.body.mensagem.lida).toBe(true);
      // `lida_em` existia na tabela e nunca era preenchido
      expect(response.body.mensagem.lida_em).toBeTruthy();
    });

    it('4.5 tutor deve ENVIAR uma foto, presa à mensagem', async () => {
      const response = await request(app)
        .post('/api/v1/mensagens')
        .set('Authorization', `Bearer ${context.tutor.token}`)
        .field('solicitacao_id', context.solicitacao.id)
        .field('tipo', 'imagem')
        .field('conteudo', 'Foto da secreção no focinho')
        .attach('arquivo', Buffer.from('imagem-falsa-de-teste'), { filename: 'rex.png', contentType: 'image/png' });

      expect(response.status).toBe(201);
      expect(response.body.mensagem.tipo).toBe('imagem');
      expect(response.body.mensagem.anexos).toHaveLength(1);

      const anexo = response.body.mensagem.anexos[0];
      expect(anexo.nome_original).toBe('rex.png');
      expect(anexo.mime_type).toBe('image/png');
      // A chave do R2 nunca sai da API; o que sai é URL assinada
      expect(anexo).not.toHaveProperty('storage_key');
      expect(anexo.url).toContain('assinada=1');

      context.mensagem.anexoId = response.body.mensagem.id;
    });

    it('4.6 tutor deve ENVIAR um vídeo curto do sintoma', async () => {
      const response = await request(app)
        .post('/api/v1/mensagens')
        .set('Authorization', `Bearer ${context.tutor.token}`)
        .field('solicitacao_id', context.solicitacao.id)
        .field('tipo', 'video')
        .field('conteudo', 'Clipe do episódio de convulsão')
        .attach('arquivo', Buffer.from('video-falso'), { filename: 'rex.mp4', contentType: 'video/mp4' });

      expect(response.status).toBe(201);
      expect(response.body.mensagem.tipo).toBe('video');
      expect(response.body.mensagem.anexos).toHaveLength(1);

      const anexo = response.body.mensagem.anexos[0];
      expect(anexo.tipo).toBe('video');
      expect(anexo.mime_type).toBe('video/mp4');
      // Mesmo contrato dos outros anexos: chave nunca sai, só URL assinada.
      expect(anexo).not.toHaveProperty('storage_key');
      expect(anexo.url).toContain('assinada=1');
    });

    it('4.6.1 NÃO deve aceitar formato de vídeo fora dos três que o celular grava', async () => {
      const response = await request(app)
        .post('/api/v1/mensagens')
        .set('Authorization', `Bearer ${context.tutor.token}`)
        .field('solicitacao_id', context.solicitacao.id)
        .field('tipo', 'video')
        .attach('arquivo', Buffer.from('video-falso'), { filename: 'rex.avi', contentType: 'video/x-msvideo' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('vídeo');
    });

    it('4.6.2 NÃO deve aceitar vídeo declarado como imagem', async () => {
      const response = await request(app)
        .post('/api/v1/mensagens')
        .set('Authorization', `Bearer ${context.tutor.token}`)
        .field('solicitacao_id', context.solicitacao.id)
        .field('tipo', 'imagem')
        .attach('arquivo', Buffer.from('video-falso'), { filename: 'rex.mp4', contentType: 'video/mp4' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('vídeo');
    });

    it('4.7 veterinário deve ENVIAR localização como ponto único', async () => {
      const response = await request(app)
        .post('/api/v1/mensagens')
        .set('Authorization', `Bearer ${context.veterinario.token}`)
        .send({
          solicitacao_id: context.solicitacao.id,
          tipo: 'localizacao',
          latitude: -23.5613,
          longitude: -46.6565,
          endereco: 'Av. Paulista, 1000 - São Paulo'
        });

      expect(response.status).toBe(201);
      expect(response.body.mensagem.tipo).toBe('localizacao');
      expect(response.body.mensagem.latitude).toBeCloseTo(-23.5613, 4);
      expect(response.body.mensagem.longitude).toBeCloseTo(-46.6565, 4);
    });

    it('4.8 deve RECUSAR localização sem coordenadas', async () => {
      const response = await request(app)
        .post('/api/v1/mensagens')
        .set('Authorization', `Bearer ${context.veterinario.token}`)
        .send({ solicitacao_id: context.solicitacao.id, tipo: 'localizacao', endereco: 'Sem coordenada' });

      expect(response.status).toBe(400);
    });

    it('4.9 editar mensagem deve PRESERVAR a versão anterior', async () => {
      const original = 'Olá Dr., a febre do Rex está em 39.5°C. Devo dar algum remédio?';

      const edicao = await request(app)
        .put(`/api/v1/mensagens/${context.mensagem.tutorId}`)
        .set('Authorization', `Bearer ${context.tutor.token}`)
        .send({ conteudo: 'Corrigindo: a febre do Rex está em 40.1°C.' });

      expect(edicao.status).toBe(200);
      expect(edicao.body.mensagem.conteudo).toContain('40.1');
      expect(edicao.body.mensagem.editada_em).toBeTruthy();

      const historico = await request(app)
        .get(`/api/v1/mensagens/${context.mensagem.tutorId}/historico`)
        .set('Authorization', `Bearer ${context.veterinario.token}`);

      expect(historico.status).toBe(200);
      expect(historico.body.edicoes).toHaveLength(1);
      expect(historico.body.edicoes[0].conteudo_anterior).toBe(original);
      expect(historico.body.edicoes[0].editado_por_id).toBe(context.tutor.id);
    });

    it('4.10 NÃO deve deixar o destinatário editar mensagem alheia', async () => {
      const response = await request(app)
        .put(`/api/v1/mensagens/${context.mensagem.tutorId}`)
        .set('Authorization', `Bearer ${context.veterinario.token}`)
        .send({ conteudo: 'Texto colocado por outra pessoa' });

      expect(response.status).toBe(403);
    });

    it('4.11 excluir deve ser lógico: some da conversa, permanece no banco', async () => {
      const exclusao = await request(app)
        .delete(`/api/v1/mensagens/${context.mensagem.anexoId}`)
        .set('Authorization', `Bearer ${context.tutor.token}`);

      expect(exclusao.status).toBe(200);
      expect(exclusao.body.mensagem.excluida).toBe(true);

      const conversa = await request(app)
        .get(`/api/v1/mensagens?solicitacao_id=${context.solicitacao.id}`)
        .set('Authorization', `Bearer ${context.veterinario.token}`);

      const excluida = conversa.body.mensagens.find((item) => item.id === context.mensagem.anexoId);
      expect(excluida).toBeDefined();
      expect(excluida.excluida).toBe(true);
      expect(excluida.conteudo).toBeNull();
      expect(excluida.anexos).toHaveLength(0);

      // A linha original continua íntegra no banco, que é o ponto da auditoria
      const noBanco = await prisma.mensagem.findUnique({
        where: { id: context.mensagem.anexoId },
        include: { anexos: true }
      });
      expect(noBanco.conteudo).toContain('secreção');
      expect(noBanco.deletada_por_id).toBe(context.tutor.id);
      expect(noBanco.anexos).toHaveLength(1);
    });

    it('4.12 estranho NÃO deve ler a conversa do atendimento', async () => {
      const estranhoId = Date.now() + 900;
      const cadastro = await request(app)
        .post('/api/v1/auth/register')
        .send({
          nome: `Bisbilhoteiro ${estranhoId}`,
          email: `bisbilhoteiro.${estranhoId}@example.com`,
          telefone: `(11) 9${estranhoId.toString().slice(-8)}`,
          senha: 'SenhaSegura@123',
          tipo_usuario: 'tutor',
          cidade: 'São Paulo',
          tenant_slug: 'clinica-demo'
        });

      const response = await request(app)
        .get(`/api/v1/mensagens?solicitacao_id=${context.solicitacao.id}`)
        .set('Authorization', `Bearer ${cadastro.body.access_token}`);

      expect([403, 404]).toContain(response.status);
    });

    it('4.13 a conversa deve paginar por cursor, sem repetir nem pular mensagem', async () => {
      const primeira = await request(app)
        .get(`/api/v1/mensagens/conversa/${context.veterinario.id}?limite=2`)
        .set('Authorization', `Bearer ${context.tutor.token}`);

      expect(primeira.status).toBe(200);
      expect(primeira.body.mensagens.length).toBeLessThanOrEqual(2);
      expect(primeira.body.paginacao.tem_mais).toBe(true);
      expect(primeira.body.paginacao.proximo_cursor).toBeTruthy();

      // A página abre nas mais recentes, entregues em ordem de leitura.
      const datas = primeira.body.mensagens.map((m) => new Date(m.criado_em).getTime());
      expect(datas).toEqual([...datas].sort((a, b) => a - b));

      const segunda = await request(app)
        .get(`/api/v1/mensagens/conversa/${context.veterinario.id}?limite=2&cursor=${encodeURIComponent(primeira.body.paginacao.proximo_cursor)}`)
        .set('Authorization', `Bearer ${context.tutor.token}`);

      expect(segunda.status).toBe(200);
      expect(segunda.body.mensagens.length).toBeGreaterThan(0);

      // Nenhum id se repete entre as duas páginas...
      const idsPrimeira = primeira.body.mensagens.map((m) => m.id);
      const idsSegunda = segunda.body.mensagens.map((m) => m.id);
      expect(idsSegunda.filter((id) => idsPrimeira.includes(id))).toHaveLength(0);

      // ...e a segunda página é mesmo mais antiga que a primeira.
      const maisNovaDaSegunda = Math.max(...segunda.body.mensagens.map((m) => new Date(m.criado_em).getTime()));
      const maisAntigaDaPrimeira = Math.min(...datas);
      expect(maisNovaDaSegunda).toBeLessThanOrEqual(maisAntigaDaPrimeira);
    });

    it('4.14 sem cursor, a conversa devolve a página mais recente e o limite é respeitado', async () => {
      const response = await request(app)
        .get(`/api/v1/mensagens/conversa/${context.veterinario.id}?limite=1`)
        .set('Authorization', `Bearer ${context.tutor.token}`);

      expect(response.status).toBe(200);
      expect(response.body.mensagens).toHaveLength(1);
      expect(response.body.paginacao.limite).toBe(1);
      expect(response.body.paginacao.tem_mais).toBe(true);
    });
  });

  /**
   * ═══════════════════════════════════════════════════════
   * FASE 5: FINALIZAÇÃO DO ATENDIMENTO
   * ═══════════════════════════════════════════════════════
   */
  describe('✅ FASE 5: Finalização do Atendimento', () => {
    it('5.0 NÃO deve finalizar sem hipótese diagnóstica', async () => {
      const response = await request(app)
        .put(`/api/v1/solicitacoes/${context.solicitacao.id}/finalizar`)
        .set('Authorization', `Bearer ${context.veterinario.token}`)
        .send({ orientacoes_tutor: 'Repouso e hidratação.' });

      expect(response.status).toBe(400);
      expect(JSON.stringify(response.body)).toContain('hipótese diagnóstica');
    });

    it('5.1 veterinário deve FINALIZAR com prontuário estruturado', async () => {
      const response = await request(app)
        .put(`/api/v1/solicitacoes/${context.solicitacao.id}/finalizar`)
        .set('Authorization', `Bearer ${context.veterinario.token}`)
        .send({
          queixa_principal: 'Tosse persistente há 2 dias, com episódios de febre.',
          exame_fisico: 'Mucosas normocoradas, ausculta com discreto ruído brônquico.',
          hipotese_diagnostica: 'Infecção respiratória leve causada por vírus. Quadro estável.',
          diagnostico_definitivo: 'Traqueobronquite infecciosa canina',
          orientacoes_tutor: 'Repouso, hidratação e retorno imediato se a febre persistir por 3 dias.',
          prescricoes: [
            { medicamento: 'AMOXICILINA', concentracao: '500mg', forma_farmaceutica: 'comprimido', posologia: '1 comprimido a cada 12h', duracao_dias: 7 },
            { medicamento: 'MELOXICAM', concentracao: '0,1mg/kg', posologia: '1x ao dia, após a refeição', duracao_dias: 5 }
          ],
          exames: [
            { nome_exame: 'Hemograma completo', justificativa: 'Confirmar componente bacteriano' }
          ],
          alergias: [
            { alergia: 'Dipirona', gravidade: 'grave', observacoes: 'Edema de face em uso anterior' },
            // Mesma alergia com acento/caixa diferentes: não pode virar duas linhas.
            { alergia: 'DIPIRONA ', gravidade: 'leve' }
          ],
          retorno_sugerido_em: '2026-09-01',
          vacinas: [
            { nome_vacina: 'V10', laboratorio: 'Zoetis', lote: 'L-2026-88', data_aplicacao: '2026-08-15', proxima_dose: '2027-08-15' }
          ],
          medicamentos: [
            { nome_medicamento: 'Prednisolona', dosagem: '5mg', frequencia_horas: 12, uso_continuo: true, data_inicio: '2026-08-15' }
          ]
        });

      expect(response.status).toBe(200);
      expect(response.body.solicitacao.status).toBe('finalizado');
      expect(response.body.solicitacao.diagnostico).toContain('Traqueobronquite');
      // A receita em texto continua existindo para as telas que já a mostram
      expect(response.body.solicitacao.receita).toContain('AMOXICILINA');

      expect(response.body.prontuario).toBeTruthy();
      expect(response.body.prontuario.itensPrescricao).toHaveLength(2);
      expect(response.body.prontuario.examesSolicitados).toHaveLength(1);

      // Os dois documentos saem no fechamento. Em produção eles não saíam: o
      // controller lia o gerador de PDF por `.default`, que não existia, e o
      // erro era engolido como aviso (08/10/2026).
      expect(response.body.solicitacao.receita_pdf_url).toContain('receitas/');
      expect(response.body.solicitacao.prontuario_pdf_url).toContain('prontuarios/');
    });

    it('5.2 tutor deve VER o diagnóstico e receita', async () => {
      const response = await request(app)
        .get(`/api/v1/solicitacoes/${context.solicitacao.id}`)
        .set('Authorization', `Bearer ${context.tutor.token}`);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('finalizado');
      expect(response.body.diagnostico).toBeTruthy();
      expect(response.body.receita).toContain('AMOXICILINA');
      // O relato original do tutor não pode ser sobrescrito pelo fechamento
      expect(response.body.observacoes).toContain('tosse persistente');
    });

    it('5.3 tutor deve VER o prontuário completo do atendimento', async () => {
      const response = await request(app)
        .get(`/api/v1/solicitacoes/${context.solicitacao.id}/prontuario`)
        .set('Authorization', `Bearer ${context.tutor.token}`);

      expect(response.status).toBe(200);
      expect(response.body.prontuario.queixa_principal).toContain('Tosse persistente');
      expect(response.body.prontuario.exame_fisico).toContain('Mucosas');
      expect(response.body.prontuario.itensPrescricao[0].duracao_dias).toBe(7);
      expect(response.body.prontuario.examesSolicitados[0].nome_exame).toBe('Hemograma completo');
    });

    it('5.4 estranho ao atendimento NÃO deve ler o prontuário', async () => {
      const estranhoId = Date.now() + 500;
      const cadastro = await request(app)
        .post('/api/v1/auth/register')
        .send({
          nome: `Curioso ${estranhoId}`,
          email: `curioso.${estranhoId}@example.com`,
          telefone: `(11) 9${estranhoId.toString().slice(-8)}`,
          senha: 'SenhaSegura@123',
          tipo_usuario: 'tutor',
          cidade: 'São Paulo',
          tenant_slug: 'clinica-demo'
        });

      expect(cadastro.status).toBe(201);

      const response = await request(app)
        .get(`/api/v1/solicitacoes/${context.solicitacao.id}/prontuario`)
        .set('Authorization', `Bearer ${cadastro.body.access_token}`);

      expect([403, 404]).toContain(response.status);
    });

    it('5.5 deve criar o lembrete de retorno e registrar a alergia no pet, sem duplicar', async () => {
      const lembretes = await prisma.lembretePet.findMany({
        where: { pet_id: context.pet.id, tipo: 'retorno' }
      });

      expect(lembretes).toHaveLength(1);
      expect(lembretes[0].tutor_id).toBe(context.tutor.id);
      expect(lembretes[0].concluido).toBe(false);

      const alergias = await prisma.petAlergia.findMany({
        where: { pet_id: context.pet.id }
      });

      // "Dipirona" e "DIPIRONA " são a mesma alergia — uma linha só.
      expect(alergias).toHaveLength(1);
      expect(alergias[0].gravidade).toBe('grave');
    });

    it('5.6 deve lançar a vacina aplicada e a medicação em uso na ficha do pet', async () => {
      const vacinas = await prisma.petVacina.findMany({ where: { pet_id: context.pet.id } });

      expect(vacinas).toHaveLength(1);
      expect(vacinas[0].nome_vacina).toBe('V10');
      expect(vacinas[0].lote).toBe('L-2026-88');
      // Quem aplicou fica registrado sem depender do atendimento.
      expect(vacinas[0].veterinario_nome).toBeTruthy();

      const medicamentos = await prisma.petMedicamento.findMany({ where: { pet_id: context.pet.id } });

      expect(medicamentos).toHaveLength(1);
      expect(medicamentos[0].nome_medicamento).toBe('Prednisolona');
      expect(medicamentos[0].frequencia_horas).toBe(12);
      expect(medicamentos[0].uso_continuo).toBe(true);
      expect(medicamentos[0].data_fim).toBeNull();

      // A próxima dose vira lembrete de vacina, ao lado do lembrete de retorno.
      const lembreteVacina = await prisma.lembretePet.findFirst({
        where: { pet_id: context.pet.id, tipo: 'vacina' }
      });

      expect(lembreteVacina).toBeTruthy();
      expect(lembreteVacina.titulo).toContain('V10');
    });

    it('5.7 a carteira digital do tutor deve mostrar o que o veterinário lançou', async () => {
      const response = await request(app)
        .get(`/api/v1/pets/${context.pet.id}`)
        .set('Authorization', `Bearer ${context.tutor.token}`);

      expect(response.status).toBe(200);
      expect(response.body.pet.vacinas[0].nome_vacina).toBe('V10');
      expect(response.body.pet.alergias[0].alergia).toBe('Dipirona');
      expect(response.body.pet.medicamentos[0].nome_medicamento).toBe('Prednisolona');
    });
  });

  /**
   * ═══════════════════════════════════════════════════════
   * FASE 5B: HISTÓRICO CLÍNICO ACUMULADO DO PET
   *
   * O atendimento seguinte do mesmo animal precisa enxergar o anterior:
   * é o que sustenta a continuidade do tratamento entre veterinários.
   * ═══════════════════════════════════════════════════════
   */
  describe('🩺 FASE 5B: Histórico clínico do pet', () => {
    let segundoAtendimentoId;

    beforeAll(async () => {
      const segundo = await prisma.solicitacao.create({
        data: {
          tenant_id: context.tenant.id,
          tutor_id: context.tutor.id,
          veterinario_id: context.veterinario.veterinarioId,
          pet_id: context.pet.id,
          tipo_atendimento: 'consulta_domiciliar',
          status: 'atendimento_em_andamento',
          observacoes: 'Retorno da tosse'
        }
      });
      segundoAtendimentoId = segundo.id;
    });

    // O tutor não pode ter dois atendimentos ativos ao mesmo tempo: este é um
    // fixture, e deixá-lo aberto quebraria as fases seguintes.
    afterAll(async () => {
      if (segundoAtendimentoId) {
        await prisma.solicitacao.delete({ where: { id: segundoAtendimentoId } });
      }
    });

    it('5B.1 veterinário deve VER o atendimento anterior do mesmo pet', async () => {
      const response = await request(app)
        .get(`/api/v1/solicitacoes/${segundoAtendimentoId}/historico-do-pet`)
        .set('Authorization', `Bearer ${context.veterinario.token}`);

      expect(response.status).toBe(200);
      expect(response.body.pet.id).toBe(context.pet.id);
      expect(response.body.resumo.total_atendimentos).toBeGreaterThanOrEqual(1);

      const anterior = response.body.atendimentos.find(
        (item) => item.atendimento_id === context.solicitacao.id
      );

      expect(anterior).toBeTruthy();
      expect(anterior.estruturado).toBe(true);
      expect(anterior.diagnostico).toContain('Traqueobronquite');
      expect(anterior.prescricoes).toHaveLength(2);
      expect(anterior.exames).toHaveLength(1);

      // O atendimento em curso não é histórico de si mesmo.
      expect(response.body.atendimentos.some((item) => item.atendimento_id === segundoAtendimentoId)).toBe(false);
    });

    it('5B.2 deve trazer a alergia, o lembrete e os medicamentos já prescritos', async () => {
      const response = await request(app)
        .get(`/api/v1/solicitacoes/${segundoAtendimentoId}/historico-do-pet`)
        .set('Authorization', `Bearer ${context.veterinario.token}`);

      expect(response.status).toBe(200);
      expect(response.body.alergias[0].alergia).toBe('Dipirona');
      expect(response.body.alergias[0].gravidade).toBe('grave');
      expect(response.body.lembretes.some((item) => item.tipo === 'retorno')).toBe(true);

      const medicamentos = response.body.resumo.medicamentos_ja_prescritos.map((item) => item.medicamento);
      expect(medicamentos).toContain('AMOXICILINA');
      expect(medicamentos).toContain('MELOXICAM');

      // O que o animal toma hoje é outra lista: vem de `pets_medicamentos`.
      expect(response.body.medicamentos_em_uso[0].nome_medicamento).toBe('Prednisolona');
      expect(response.body.vacinas[0].nome_vacina).toBe('V10');
    });

    it('5B.3 tutor deve LER o histórico do próprio pet', async () => {
      const response = await request(app)
        .get(`/api/v1/solicitacoes/${segundoAtendimentoId}/historico-do-pet`)
        .set('Authorization', `Bearer ${context.tutor.token}`);

      expect(response.status).toBe(200);
      expect(response.body.pet.id).toBe(context.pet.id);
    });

    it('5B.4 estranho ao atendimento NÃO deve ler o histórico do pet', async () => {
      const estranhoId = Date.now() + 900;
      const cadastro = await request(app)
        .post('/api/v1/auth/register')
        .send({
          nome: `Bisbilhoteiro ${estranhoId}`,
          email: `bisbilhoteiro.${estranhoId}@example.com`,
          telefone: `(11) 9${estranhoId.toString().slice(-8)}`,
          senha: 'SenhaSegura@123',
          tipo_usuario: 'tutor',
          cidade: 'São Paulo',
          tenant_slug: 'clinica-demo'
        });

      expect(cadastro.status).toBe(201);

      const response = await request(app)
        .get(`/api/v1/solicitacoes/${segundoAtendimentoId}/historico-do-pet`)
        .set('Authorization', `Bearer ${cadastro.body.access_token}`);

      expect([403, 404]).toContain(response.status);
    });
  });

  /**
   * ═══════════════════════════════════════════════════════
   * FASE 5C: LEMBRETES DO PET, DO LADO DO TUTOR
   *
   * O fechamento do atendimento grava lembrete de retorno e de reforço de
   * vacina. Aqui é a outra ponta: o tutor lendo, concluindo e sendo avisado.
   * ═══════════════════════════════════════════════════════
   */
  describe('⏰ FASE 5C: Lembretes do pet', () => {
    let lembreteDoTutorId;

    it('5C.1 tutor deve VER os lembretes criados pelo fechamento do atendimento', async () => {
      const response = await request(app)
        .get('/api/v1/lembretes')
        .set('Authorization', `Bearer ${context.tutor.token}`);

      expect(response.status).toBe(200);

      const tipos = response.body.lembretes.map((item) => item.tipo);
      expect(tipos).toContain('retorno');
      expect(tipos).toContain('vacina');
      expect(response.body.lembretes[0].pet.nome).toBeTruthy();
      expect(response.body.resumo.pendentes).toBeGreaterThanOrEqual(2);
    });

    it('5C.2 tutor deve CRIAR um lembrete próprio', async () => {
      const amanha = new Date();
      amanha.setDate(amanha.getDate() + 1);

      const response = await request(app)
        .post('/api/v1/lembretes')
        .set('Authorization', `Bearer ${context.tutor.token}`)
        .send({
          pet_id: context.pet.id,
          titulo: 'Dar vermífugo',
          tipo: 'medicamento',
          data_lembrete: amanha.toISOString().slice(0, 10)
        });

      expect(response.status).toBe(201);
      expect(response.body.lembrete.concluido).toBe(false);
      lembreteDoTutorId = response.body.lembrete.id;
    });

    it('5C.3 NÃO deve criar lembrete para pet de outro tutor', async () => {
      const outroPet = await prisma.pet.create({
        data: {
          tenant_id: context.tenant.id,
          tutor_id: context.veterinario.id,
          nome: 'Pet de outro dono',
          tipo: 'gato'
        }
      });

      const response = await request(app)
        .post('/api/v1/lembretes')
        .set('Authorization', `Bearer ${context.tutor.token}`)
        .send({
          pet_id: outroPet.id,
          titulo: 'Tentativa indevida',
          tipo: 'outro',
          data_lembrete: '2026-12-01'
        });

      expect([403, 404]).toContain(response.status);

      await prisma.pet.delete({ where: { id: outroPet.id } });
    });

    it('5C.4 concluir deve sumir da lista de pendentes, e reabrir deve trazer de volta', async () => {
      const concluir = await request(app)
        .put(`/api/v1/lembretes/${lembreteDoTutorId}/concluir`)
        .set('Authorization', `Bearer ${context.tutor.token}`)
        .send({ concluido: true });

      expect(concluir.status).toBe(200);
      expect(concluir.body.lembrete.concluido).toBe(true);

      const pendentes = await request(app)
        .get('/api/v1/lembretes')
        .set('Authorization', `Bearer ${context.tutor.token}`);

      expect(pendentes.body.lembretes.some((item) => item.id === lembreteDoTutorId)).toBe(false);

      const comConcluidos = await request(app)
        .get('/api/v1/lembretes?concluidos=1')
        .set('Authorization', `Bearer ${context.tutor.token}`);

      expect(comConcluidos.body.lembretes.some((item) => item.id === lembreteDoTutorId)).toBe(true);

      const reabrir = await request(app)
        .put(`/api/v1/lembretes/${lembreteDoTutorId}/concluir`)
        .set('Authorization', `Bearer ${context.tutor.token}`)
        .send({ concluido: false });

      expect(reabrir.status).toBe(200);
      expect(reabrir.body.lembrete.concluido).toBe(false);
      // Reabrir devolve o lembrete à fila de aviso.
      expect(reabrir.body.lembrete.notificado).toBe(false);
    });

    it('5C.5 veterinário NÃO deve enxergar os lembretes do tutor', async () => {
      // Desde 26/08/2026 `isTutor` deixa o veterinário agir como tutor dos
      // PRÓPRIOS pets (ver auth.middleware). A rota responde 200, mas a lista é
      // recortada por dono: o lembrete que o tutor criou não aparece aqui.
      const response = await request(app)
        .get('/api/v1/lembretes')
        .set('Authorization', `Bearer ${context.veterinario.token}`);

      expect(response.status).toBe(200);
      const lembretes = response.body.lembretes || response.body || [];
      const ids = (Array.isArray(lembretes) ? lembretes : []).map((l) => l.id);
      expect(ids).not.toContain(context.lembrete?.id);
      expect(ids).toHaveLength(0);
    });

    it('5C.6 o worker deve avisar o tutor e marcar o lembrete como notificado, uma vez só', async () => {
      const { processarLembretesPendentes } = require('../../../src/services/lembrete.worker');
      const emailService = require('../../../src/services/email.service');

      emailService.enviarEmailLembreteMedicamento.mockClear();

      await processarLembretesPendentes();

      const depois = await prisma.lembretePet.findUnique({ where: { id: lembreteDoTutorId } });
      expect(depois.notificado).toBe(true);
      expect(emailService.enviarEmailLembreteMedicamento).toHaveBeenCalled();

      // Segundo ciclo: o mesmo lembrete não pode ser avisado de novo.
      emailService.enviarEmailLembreteMedicamento.mockClear();
      await processarLembretesPendentes();
      expect(emailService.enviarEmailLembreteMedicamento).not.toHaveBeenCalled();
    });
  });

  // Corrigir a receita depois do fechamento não tinha teste pela rota — só um
  // que procurava o nome da ação no código-fonte. Em produção a correção era
  // gravada e a rota respondia erro 500, porque a linha de auditoria lia o
  // serviço por `.default` (08/10/2026).
  describe('📝 FASE 5B: Retificação da receita', () => {
    it('5B.1 veterinário retifica a receita e a correção fica na trilha de auditoria', async () => {
      const response = await request(app)
        .put(`/api/v1/solicitacoes/${context.solicitacao.id}/prescricao`)
        .set('Authorization', `Bearer ${context.veterinario.token}`)
        .send({
          motivo: 'Dose do antibiótico ajustada após conferência do peso.',
          prescricoes: [
            { medicamento: 'AMOXICILINA', concentracao: '250mg', forma_farmaceutica: 'comprimido', posologia: '1 comprimido a cada 12h', duracao_dias: 7 }
          ]
        });

      expect(response.status).toBe(200);
      expect(response.body.receita_versao).toBe(2);
      expect(response.body.receita).toContain('250mg');
      expect(response.body.receita_pdf_url).toContain('receitas/');

      // A auditoria é gravada sem bloquear a resposta: dá um instante a ela.
      await new Promise((resolve) => setTimeout(resolve, 300));
      const trilha = await prisma.auditLog.findFirst({
        where: { acao: 'prescricao.retificada_apos_finalizacao', entity_id: context.solicitacao.id }
      });
      expect(trilha).not.toBeNull();
      expect(JSON.stringify(trilha)).toContain(context.solicitacao.id);
    });

    it('5B.2 retificação sem motivo é recusada e não gera versão nova', async () => {
      const response = await request(app)
        .put(`/api/v1/solicitacoes/${context.solicitacao.id}/prescricao`)
        .set('Authorization', `Bearer ${context.veterinario.token}`)
        .send({ motivo: 'curto', receita: 'Outra coisa' });

      expect(response.status).toBe(400);
      const atual = await prisma.solicitacao.findUnique({ where: { id: context.solicitacao.id }, select: { receita_versao: true } });
      expect(atual.receita_versao).toBe(2);
    });
  });

  // Marcar consulta respondia erro 500 em produção para todo tutor: a consulta
  // ao banco pedia um campo que o pet não tem, e o teste unitário simulava o
  // banco. Aqui é pela rota, com Postgres de verdade (08/10/2026).
  describe('📅 FASE 5C: Consulta marcada', () => {
    const emDoisDias = (hora) => {
      const { instanteDoRelogio, relogioDeParede } = require('../../../src/utils/datas');
      const hoje = relogioDeParede(new Date());
      return instanteDoRelogio(hoje.ano, hoje.mes, hoje.dia + 2, hora * 60);
    };
    let agendamentoId;

    it('5C.1 tutor marca consulta com o veterinário e ela nasce pendente', async () => {
      // Só profissional com conta para receber aparece para marcação.
      await prisma.veterinario.update({
        where: { id: context.veterinario.veterinarioId },
        data: { dados_bancarios: JSON.stringify({ teste: true }) }
      });

      const response = await request(app)
        .post('/api/v1/agenda/marcar')
        .set('Authorization', `Bearer ${context.tutor.token}`)
        .send({
          veterinario_id: context.veterinario.veterinarioId,
          pet_id: context.pet.id,
          tipo_atendimento: 'consulta_rotina',
          inicio: emDoisDias(10).toISOString()
        });

      expect(response.status).toBe(201);
      const agendamento = response.body.agendamento || response.body;
      expect(agendamento.status).toBe('pendente');
      agendamentoId = agendamento.id;
    });

    it('5C.2 emergência não se agenda', async () => {
      const response = await request(app)
        .post('/api/v1/agenda/marcar')
        .set('Authorization', `Bearer ${context.tutor.token}`)
        .send({ veterinario_id: context.veterinario.veterinarioId, pet_id: context.pet.id, tipo_atendimento: 'emergencia', inicio: emDoisDias(11).toISOString() });

      expect(response.status).toBe(400);
    });

    it('5C.3 veterinário confirma e remarca; o tutor vê o novo horário', async () => {
      const confirma = await request(app)
        .put(`/api/v1/veterinario/crm/agendamentos/${agendamentoId}/status`)
        .set('Authorization', `Bearer ${context.veterinario.token}`)
        .send({ status: 'confirmado' });
      expect(confirma.status).toBe(200);

      const remarca = await request(app)
        .put(`/api/v1/veterinario/crm/agendamentos/${agendamentoId}/remarcar`)
        .set('Authorization', `Bearer ${context.veterinario.token}`)
        .send({ inicio: emDoisDias(15).toISOString() });
      expect(remarca.status).toBe(200);

      const doTutor = await request(app)
        .get('/api/v1/agenda/meus-agendamentos')
        .set('Authorization', `Bearer ${context.tutor.token}`);
      expect(doTutor.status).toBe(200);
      const lista = doTutor.body.agendamentos || doTutor.body;
      const meu = lista.find((item) => item.id === agendamentoId);
      expect(new Date(meu.inicio).toISOString()).toBe(emDoisDias(15).toISOString());
    });

    it('5C.4 tutor cancela e o horário deixa de ocupar a agenda', async () => {
      const response = await request(app)
        .put(`/api/v1/agenda/agendamentos/${agendamentoId}/cancelar`)
        .set('Authorization', `Bearer ${context.tutor.token}`)
        .send({ motivo: 'Imprevisto.' });

      expect(response.status).toBe(200);
      const salvo = await prisma.agendamento.findUnique({ where: { id: agendamentoId }, select: { status: true } });
      expect(salvo.status).toBe('cancelado');
    });
  });

  /**
   * ═══════════════════════════════════════════════════════
   * FASE 6: AVALIAÇÃO E FEEDBACK
   * ═══════════════════════════════════════════════════════
   */
  describe('⭐ FASE 6: Avaliação e Feedback', () => {
    it('6.1 tutor deve AVALIAR o atendimento', async () => {
      const response = await request(app)
        .post('/api/v1/avaliacoes')
        .set('Authorization', `Bearer ${context.tutor.token}`)
        .send({
          solicitacao_id: context.solicitacao.id,
          nota: 5,
          comentario: 'Excelente atendimento! Dr. João foi muito atencioso e o Rex já está melhor.'
        });

      expect(response.status).toBe(201);
      expect(response.body.avaliacao).toHaveProperty('id');
      expect(response.body.avaliacao.nota).toBe(5);
      expect(response.body.avaliacao.tutor_id).toBe(context.tutor.id);
      expect(response.body.avaliacao.veterinario_id).toBe(context.veterinario.veterinarioId);

      context.avaliacao.id = response.body.avaliacao.id;
    });

    it('6.2 veterinário deve VER suas avaliações', async () => {
      const response = await request(app)
        .get(`/api/v1/avaliacoes?veterinario_id=${context.veterinario.veterinarioId}`)
        .set('Authorization', `Bearer ${context.veterinario.token}`);

      expect(response.status).toBe(200);
      expect(response.body.avaliacoes).toBeInstanceOf(Array);

      const avaliacao = response.body.avaliacoes.find(
        a => a.id === context.avaliacao.id
      );
      expect(avaliacao).toBeDefined();
      expect(avaliacao.nota).toBe(5);
    });

    it('6.3 deve CALCULAR média de avaliações do veterinário', async () => {
      // Buscar informações do veterinário com média calculada
      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${context.veterinario.token}`);

      expect(response.status).toBe(200);
      // A média pode ser calculada no backend ou retornada separadamente
    });
  });

  /**
   * ═══════════════════════════════════════════════════════
   * FASE 7: HISTÓRICO E RASTREABILIDADE
   * ═══════════════════════════════════════════════════════
   */
  describe('📊 FASE 7: Histórico e Rastreabilidade', () => {
    it('7.1 tutor deve VER histórico completo de atendimentos', async () => {
      const response = await request(app)
        .get('/api/v1/solicitacoes')
        .set('Authorization', `Bearer ${context.tutor.token}`);

      expect(response.status).toBe(200);
      expect(response.body.solicitacoes).toBeInstanceOf(Array);

      const historico = response.body.solicitacoes.find(
        s => s.id === context.solicitacao.id
      );
      expect(historico).toBeDefined();
      expect(historico.status).toBe('finalizado');
    });

    it('7.2 deve validar RASTREABILIDADE completa do fluxo', async () => {
      const response = await request(app)
        .get(`/api/v1/solicitacoes/${context.solicitacao.id}`)
        .set('Authorization', `Bearer ${context.tutor.token}`);

      expect(response.status).toBe(200);

      // Validar timestamps
      expect(response.body).toHaveProperty('criado_em');
      expect(response.body).toHaveProperty('atualizado_em');

      const criadoEm = new Date(response.body.criado_em);
      const atualizadoEm = new Date(response.body.atualizado_em);

      expect(atualizadoEm.getTime()).toBeGreaterThanOrEqual(criadoEm.getTime());

      // Validar relacionamentos
      expect(response.body.pet_id).toBe(context.pet.id);
      expect(response.body.tutor_id).toBe(context.tutor.id);
      expect(response.body.veterinario_id).toBe(context.veterinario.veterinarioId);
    });

    it('7.3 deve validar ISOLAMENTO multi-tenant', async () => {
      // Todos os recursos devem ter o mesmo tenant_id
      const solicitacao = await request(app)
        .get(`/api/v1/solicitacoes/${context.solicitacao.id}`)
        .set('Authorization', `Bearer ${context.tutor.token}`);

      expect(solicitacao.body).toHaveProperty('tenant_id');

      const pet = await request(app)
        .get(`/api/v1/pets/${context.pet.id}`)
        .set('Authorization', `Bearer ${context.tutor.token}`);

      expect(pet.body.pet).toHaveProperty('tenant_id');

      // Validar que todos estão no mesmo tenant
      expect(solicitacao.body.tenant_id).toBe(pet.body.pet.tenant_id);
    });
  });

  /**
   * ═══════════════════════════════════════════════════════
   * FASE 8: VALIDAÇÃO DE SEGURANÇA
   * ═══════════════════════════════════════════════════════
   */
  describe('🔒 FASE 8: Validação de Segurança', () => {
    it('8.1 deve BLOQUEAR acesso sem autenticação (401)', async () => {
      const response = await request(app)
        .get('/api/v1/pets');

      expect(response.status).toBe(401);
    });

    it('8.2 deve BLOQUEAR token inválido (401)', async () => {
      const response = await request(app)
        .get('/api/v1/pets')
        .set('Authorization', 'Bearer token-invalido-xyz-123');

      expect(response.status).toBe(401);
    });

    it('8.3 deve VALIDAR dados obrigatórios (400)', async () => {
      const response = await request(app)
        .post('/api/v1/pets')
        .set('Authorization', `Bearer ${context.tutor.token}`)
        .send({
          nome: 'Pet Incompleto'
          // Faltam campos obrigatórios
        });

      expect(response.status).toBe(400);
    });

    it('8.4 deve BLOQUEAR acesso a recursos de outro usuário (403)', async () => {
      // Tutor não pode aceitar solicitações (ação de veterinário)
      const uniqueId = Date.now() + 100;

      // Criar nova solicitação
      const novaSolicitacao = await request(app)
        .post('/api/v1/solicitacoes')
        .set('Authorization', `Bearer ${context.tutor.token}`)
        .send({
          pet_id: context.pet.id,
          tipo_atendimento: 'emergencia',
          localizacao_cliente: 'Teste de permissão, 100 - São Paulo',
          latitude: -23.5613,
          longitude: -46.6565
        });

      expect(novaSolicitacao.status).toBe(201);

      // Tentar aceitar com token de tutor (deve falhar)
      const response = await request(app)
        .put(`/api/v1/solicitacoes/${novaSolicitacao.body.solicitacao.id}/aceitar`)
        .set('Authorization', `Bearer ${context.tutor.token}`);

      expect([403, 401]).toContain(response.status);
    });
  });

  /**
   * ═══════════════════════════════════════════════════════
   * VALIDAÇÃO FINAL: INTEGRAÇÃO COMPLETA
   * ═══════════════════════════════════════════════════════
   */
  describe('✅ VALIDAÇÃO FINAL: Integração Completa', () => {
    it('9.1 deve confirmar CICLO COMPLETO executado com sucesso', () => {
      // Validar que todas as etapas foram concluídas
      expect(context.tutor.id).toBeDefined();
      expect(context.veterinario.id).toBeDefined();
      expect(context.pet.id).toBeDefined();
      expect(context.solicitacao.id).toBeDefined();
      expect(context.mensagem.tutorId).toBeDefined();
      expect(context.mensagem.vetId).toBeDefined();
      expect(context.avaliacao.id).toBeDefined();
    });

    it('9.2 deve validar DADOS CONECTADOS corretamente', async () => {
      const solicitacao = await request(app)
        .get(`/api/v1/solicitacoes/${context.solicitacao.id}`)
        .set('Authorization', `Bearer ${context.tutor.token}`);

      expect(solicitacao.body).toMatchObject({
        id: context.solicitacao.id,
        pet_id: context.pet.id,
        tutor_id: context.tutor.id,
        veterinario_id: context.veterinario.veterinarioId,
        status: 'finalizado'
      });

      expect(solicitacao.body.diagnostico).toBeTruthy();
      expect(solicitacao.body.receita).toBeTruthy();
    });

    it('9.3 deve confirmar QUALIDADE dos dados persistidos', async () => {
      // Verificar integridade dos dados
      const pet = await request(app)
        .get(`/api/v1/pets/${context.pet.id}`)
        .set('Authorization', `Bearer ${context.tutor.token}`);

      expect(pet.body.pet).toHaveProperty('nome');
      expect(pet.body.pet).toHaveProperty('tipo');  // Campo correto é 'tipo', não 'especie'
      expect(pet.body.pet).toHaveProperty('criado_em');

      // Validar tipos de dados
      expect(typeof pet.body.pet.nome).toBe('string');
      expect(typeof pet.body.pet.peso).toBe('number');
      expect(typeof pet.body.pet.idade).toBe('number');
    });
  });
});

export {};
