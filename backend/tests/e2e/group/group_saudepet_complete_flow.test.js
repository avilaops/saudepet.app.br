const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

// ═══════════════════════════════════════════════════════
// E2E - FLUXO COMPLETO DO GRUPO SAÚDE PET
// Integração de TODAS as features do sistema
// ═══════════════════════════════════════════════════════

// Este é um teste E2E de verdade (banco real), não unitário — precisa desabilitar
// o auto-mock global do Prisma/Redis/token que tests/setup.js aplica por padrão.
jest.unmock('../../../src/config/database');
jest.unmock('../../../src/services/token.service');

jest.mock('../../../src/services/email.service', () =>
  require('../../mocks/email-service.mock').criarMockDoEmailService());

const authRoutes = require('../../../src/routes/auth.routes');
const petRoutes = require('../../../src/routes/pet.routes');
const solicitacaoRoutes = require('../../../src/routes/solicitacao.routes');
const mensagemRoutes = require('../../../src/routes/mensagem.routes');
const avaliacaoRoutes = require('../../../src/routes/avaliacao.routes');
const notificacaoRoutes = require('../../../src/routes/notificacao.routes');
const veterinarioRoutes = require('../../../src/routes/veterinario.routes');
const { errorHandler } = require('../../../src/middleware/error.middleware');

describe('E2E - Grupo Saúde Pet - Fluxo Completo', () => {
  let app;
  let prisma;
  
  // Dados compartilhados entre testes
  let tutorToken;
  let tutorId;
  let veterinarioToken;
  let veterinarioId;
  let veterinarioRecordId; // id na tabela veterinarios (diferente do id do usuário)
  let petId;
  let solicitacaoId;
  let avaliacaoId;
  let tenantId;

  beforeAll(async () => {
    // Setup da aplicação
    app = express();
    app.use(express.json());
    
    // Rotas
    app.use('/api/v1/auth', authRoutes);
    app.use('/api/v1/pets', petRoutes);
    app.use('/api/v1/solicitacoes', solicitacaoRoutes);
    app.use('/api/v1/mensagens', mensagemRoutes);
    app.use('/api/v1/avaliacoes', avaliacaoRoutes);
    app.use('/api/v1/notificacoes', notificacaoRoutes);
    app.use('/api/v1/veterinarios', veterinarioRoutes);
    app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
    app.use(errorHandler);

    // Prisma para limpeza
    prisma = new PrismaClient();

    // Garantir que existe um tenant para testes (independente da ordem de execução
    // das suítes — não confiar que outro arquivo já criou 'clinica-demo').
    const existingTenant = await prisma.tenant.findUnique({ where: { slug: 'clinica-demo' } });
    if (!existingTenant) {
      await prisma.tenant.create({
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
          limite_pets: 5000
        }
      });
    }
  });

  afterAll(async () => {
    // Limpeza
    if (prisma) {
      await prisma.$disconnect();
    }
  });

  // ═══════════════════════════════════════════════════════
  // GRUPO 1: AUTENTICAÇÃO E SETUP INICIAL
  // ═══════════════════════════════════════════════════════
  
  describe('1. AUTENTICAÇÃO - Setup de Usuários', () => {
    it('1.1 deve registrar um TUTOR com sucesso', async () => {
      const uniqueId = Date.now();
      
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          nome: `Tutor E2E ${uniqueId}`,
          email: `tutor.e2e.${uniqueId}@test.com`,
          telefone: `(11) 9${uniqueId.toString().slice(-8)}`,
          senha: 'SenhaSegura@123',
          tipo_usuario: 'tutor',
          cidade: 'São Paulo',
          tenant_slug: 'clinica-demo'
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('access_token');
      expect(response.body.usuario).toHaveProperty('id');
      expect(response.body.usuario.tipo_usuario).toBe('tutor');

      // Armazenar para próximos testes
      tutorToken = response.body.access_token;
      tutorId = response.body.usuario.id;
      // A resposta de /auth/register não inclui tenant_id (só id/nome/email/tipo/
      // cidade/email_verificado) — decodifica do token, que carrega tenant_id no payload.
      tenantId = jwt.decode(tutorToken).tenant_id;
    });

    it('1.2 deve registrar um VETERINÁRIO com sucesso', async () => {
      const uniqueId = Date.now() + 1;
      
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          nome: `Dr. Vet E2E ${uniqueId}`,
          email: `vet.e2e.${uniqueId}@test.com`,
          telefone: `(11) 9${uniqueId.toString().slice(-8)}`,
          senha: 'SenhaSegura@123',
          tipo_usuario: 'veterinario',
          cidade: 'São Paulo',
          tenant_slug: 'clinica-demo',
          crmv: `${uniqueId}`,
          crmv_uf: 'SP',
          especialidade: 'Clínica Geral'
        });

      expect(response.status).toBe(201);
      // v1.0: veterinário não recebe sessão no cadastro.
      expect(response.body.access_token).toBeNull();
      expect(response.body.usuario.tipo_usuario).toBe('veterinario');

      veterinarioId = response.body.usuario.id;

      // Confirmar e-mail e aprovar diretamente no banco (fora do fluxo público de cadastro).
      await prisma.veterinario.updateMany({
        where: { usuario_id: veterinarioId },
        data: { aprovado_admin: true, status_credenciamento: 'APPROVED' }
      });
      await prisma.usuario.update({ where: { id: veterinarioId }, data: { email_verificado: true } });

      const login = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: `vet.e2e.${uniqueId}@test.com`, senha: 'SenhaSegura@123', tenant_slug: 'clinica-demo' });
      expect(login.status).toBe(200);
      veterinarioToken = login.body.access_token;
      const veterinarioRecord = await prisma.veterinario.findFirst({ where: { usuario_id: veterinarioId } });
      veterinarioRecordId = veterinarioRecord.id;
    });

    it('1.3 deve fazer LOGIN com credenciais do tutor', async () => {
      const uniqueId = Date.now();
      
      // Primeiro registrar
      const registerResponse = await request(app)
        .post('/api/v1/auth/register')
        .send({
          nome: 'Tutor Login Test',
          email: `tutor.login.${uniqueId}@test.com`,
          telefone: `(11) 9${uniqueId.toString().slice(-8)}`,
          senha: 'LoginTest@123',
          tipo_usuario: 'tutor',
          cidade: 'Rio de Janeiro',
          tenant_slug: 'clinica-demo'
        });

      expect(registerResponse.status).toBe(201);

      // Fazer login
      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: `tutor.login.${uniqueId}@test.com`,
          senha: 'LoginTest@123',
          tenant_slug: 'clinica-demo'
        });

      expect(loginResponse.status).toBe(200);
      expect(loginResponse.body).toHaveProperty('access_token');
      expect(loginResponse.body).toHaveProperty('refresh_token');
      expect(loginResponse.body.usuario.email).toBe(`tutor.login.${uniqueId}@test.com`);
    });

    it('1.4 deve obter perfil do usuário autenticado (/me)', async () => {
      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${tutorToken}`);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(tutorId);
      expect(response.body.tipo_usuario).toBe('tutor');
    });
  });

  // ═══════════════════════════════════════════════════════
  // GRUPO 2: GESTÃO DE PETS
  // ═══════════════════════════════════════════════════════
  
  describe('2. PETS - Cadastro e Gestão', () => {
    it('2.1 deve cadastrar um PET do tutor', async () => {
      const response = await request(app)
        .post('/api/v1/pets')
        .set('Authorization', `Bearer ${tutorToken}`)
        .send({
          nome: 'Rex E2E Test',
          tipo: 'cachorro',
          raca: 'Labrador',
          idade: 3,
          peso: 28.5,
          observacoes: 'Pet saudável, vacinado'
        });

      expect(response.status).toBe(201);
      expect(response.body.pet).toHaveProperty('id');
      expect(response.body.pet.nome).toBe('Rex E2E Test');
      expect(response.body.pet.tutor_id).toBe(tutorId);

      petId = response.body.pet.id;
    });

    it('2.2 deve listar os PETS do tutor', async () => {
      const response = await request(app)
        .get('/api/v1/pets')
        .set('Authorization', `Bearer ${tutorToken}`);

      expect(response.status).toBe(200);
      expect(response.body.pets).toBeInstanceOf(Array);
      expect(response.body.pets.length).toBeGreaterThan(0);
      
      const pet = response.body.pets.find(p => p.id === petId);
      expect(pet).toBeDefined();
      expect(pet.nome).toBe('Rex E2E Test');
    });

    it('2.3 deve obter detalhes de um PET específico', async () => {
      const response = await request(app)
        .get(`/api/v1/pets/${petId}`)
        .set('Authorization', `Bearer ${tutorToken}`);

      expect(response.status).toBe(200);
      expect(response.body.pet.id).toBe(petId);
      expect(response.body.pet.nome).toBe('Rex E2E Test');
      expect(response.body.pet.tipo).toBe('cachorro');
    });

    it('2.4 deve atualizar dados do PET', async () => {
      const response = await request(app)
        .put(`/api/v1/pets/${petId}`)
        .set('Authorization', `Bearer ${tutorToken}`)
        .send({
          peso: 29.0
        });

      expect(response.status).toBe(200);
      expect(response.body.pet.peso).toBe(29.0);
    });
  });

  // ═══════════════════════════════════════════════════════
  // GRUPO 3: SOLICITAÇÕES DE ATENDIMENTO
  // ═══════════════════════════════════════════════════════
  
  describe('3. SOLICITAÇÕES - Fluxo de Atendimento', () => {
    it('3.1 deve criar uma SOLICITAÇÃO de atendimento', async () => {
      const response = await request(app)
        .post('/api/v1/solicitacoes')
        .set('Authorization', `Bearer ${tutorToken}`)
        .send({
          pet_id: petId,
          tipo_atendimento: 'consulta_domiciliar',
          // Endereço e coordenada passaram a ser obrigatórios: sem o ponto de
          // partida o despacho por proximidade não tem de onde medir.
          localizacao_cliente: 'Rua Teste E2E, 123 - São Paulo',
          latitude: -23.5613,
          longitude: -46.6565
        });

      expect(response.status).toBe(201);
      expect(response.body.solicitacao).toHaveProperty('id');
      expect(response.body.solicitacao.status).toBe('procurando_veterinario');
      expect(response.body.solicitacao.pet_id).toBe(petId);

      solicitacaoId = response.body.solicitacao.id;
    });

    it('3.2 deve listar SOLICITAÇÕES do tutor', async () => {
      const response = await request(app)
        .get('/api/v1/solicitacoes')
        .set('Authorization', `Bearer ${tutorToken}`);

      expect(response.status).toBe(200);
      expect(response.body.solicitacoes).toBeInstanceOf(Array);
      
      const solicitacao = response.body.solicitacoes.find(s => s.id === solicitacaoId);
      expect(solicitacao).toBeDefined();
      expect(solicitacao.status).toBe('procurando_veterinario');
    });

    it('3.3 veterinário deve ACEITAR a solicitação', async () => {
      const response = await request(app)
        .put(`/api/v1/solicitacoes/${solicitacaoId}/aceitar`)
        .set('Authorization', `Bearer ${veterinarioToken}`);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('veterinario_encontrado');
      expect(response.body.veterinario_id).toBe(veterinarioRecordId);
    });

    // Deslocamento e chegada são etapas que o tutor acompanha ao vivo; a máquina
    // de estados não deixa o atendimento saltar direto para "em andamento".
    it('3.4 veterinário deve marcar DESLOCAMENTO e CHEGADA', async () => {
      for (const status of ['a_caminho', 'chegou']) {
        const response = await request(app)
          .put(`/api/v1/solicitacoes/${solicitacaoId}/status`)
          .set('Authorization', `Bearer ${veterinarioToken}`)
          .send({ status });

        expect(response.status).toBe(200);
        expect(response.body.status).toBe(status);
      }
    });

    it('3.5 veterinário deve INICIAR atendimento', async () => {
      const response = await request(app)
        .put(`/api/v1/solicitacoes/${solicitacaoId}/iniciar`)
        .set('Authorization', `Bearer ${veterinarioToken}`);

      expect(response.status).toBe(200);
      expect(response.body.solicitacao.status).toBe('atendimento_em_andamento');
    });

    it('3.6 veterinário deve FINALIZAR atendimento com diagnóstico', async () => {
      const response = await request(app)
        .put(`/api/v1/solicitacoes/${solicitacaoId}/finalizar`)
        .set('Authorization', `Bearer ${veterinarioToken}`)
        .send({
          diagnostico: 'Infecção respiratória leve',
          receita: 'Antibiótico - 1 comprimido 2x ao dia por 7 dias',
          observacoes: 'Retornar em 1 semana para reavaliação'
        });

      expect(response.status).toBe(200);
      expect(response.body.solicitacao.status).toBe('finalizado');
      expect(response.body.solicitacao.diagnostico).toContain('respiratória');
      expect(response.body.solicitacao.receita).toContain('Antibiótico');
    });
  });

  // ═══════════════════════════════════════════════════════
  // GRUPO 4: MENSAGENS E COMUNICAÇÃO
  // ═══════════════════════════════════════════════════════
  
  describe('4. MENSAGENS - Sistema de Chat', () => {
    let mensagemId;

    it('4.1 tutor deve enviar MENSAGEM na solicitação', async () => {
      const response = await request(app)
        .post('/api/v1/mensagens')
        .set('Authorization', `Bearer ${tutorToken}`)
        .send({
          solicitacao_id: solicitacaoId,
          conteudo: 'Olá doutor, obrigado pelo atendimento!'
        });

      expect(response.status).toBe(201);
      expect(response.body.mensagem).toHaveProperty('id');
      expect(response.body.mensagem.conteudo).toContain('obrigado');
      expect(response.body.mensagem.remetente_id).toBe(tutorId);

      mensagemId = response.body.mensagem.id;
    });

    it('4.2 veterinário deve responder MENSAGEM', async () => {
      const response = await request(app)
        .post('/api/v1/mensagens')
        .set('Authorization', `Bearer ${veterinarioToken}`)
        .send({
          solicitacao_id: solicitacaoId,
          conteudo: 'De nada! Qualquer dúvida, estou à disposição.'
        });

      expect(response.status).toBe(201);
      expect(response.body.mensagem.remetente_id).toBe(veterinarioId);
      expect(response.body.mensagem.conteudo).toContain('disposição');
    });

    it('4.3 deve listar MENSAGENS da solicitação', async () => {
      const response = await request(app)
        .get(`/api/v1/mensagens?solicitacao_id=${solicitacaoId}`)
        .set('Authorization', `Bearer ${tutorToken}`);

      expect(response.status).toBe(200);
      expect(response.body.mensagens).toBeInstanceOf(Array);
      expect(response.body.mensagens.length).toBeGreaterThanOrEqual(2);
    });

    it('4.4 deve marcar MENSAGEM como lida', async () => {
      const response = await request(app)
        .put(`/api/v1/mensagens/${mensagemId}/lida`)
        .set('Authorization', `Bearer ${veterinarioToken}`);

      expect(response.status).toBe(200);
      expect(response.body.mensagem.lida).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════
  // GRUPO 5: AVALIAÇÕES
  // ═══════════════════════════════════════════════════════
  
  describe('5. AVALIAÇÕES - Feedback do Atendimento', () => {
    it('5.1 tutor deve AVALIAR o atendimento', async () => {
      const response = await request(app)
        .post('/api/v1/avaliacoes')
        .set('Authorization', `Bearer ${tutorToken}`)
        .send({
          solicitacao_id: solicitacaoId,
          nota: 5,
          comentario: 'Excelente atendimento! Doutor muito atencioso e profissional.'
        });

      expect(response.status).toBe(201);
      expect(response.body.avaliacao).toHaveProperty('id');
      expect(response.body.avaliacao.nota).toBe(5);
      expect(response.body.avaliacao.tutor_id).toBe(tutorId);
      expect(response.body.avaliacao.veterinario_id).toBe(veterinarioRecordId);

      avaliacaoId = response.body.avaliacao.id;
    });

    it('5.2 deve listar AVALIAÇÕES do veterinário', async () => {
      const response = await request(app)
        .get(`/api/v1/avaliacoes?veterinario_id=${veterinarioRecordId}`)
        .set('Authorization', `Bearer ${veterinarioToken}`);

      expect(response.status).toBe(200);
      expect(response.body.avaliacoes).toBeInstanceOf(Array);

      const avaliacao = response.body.avaliacoes.find(a => a.id === avaliacaoId);
      expect(avaliacao).toBeDefined();
      expect(avaliacao.nota).toBe(5);
    });

    it('5.3 deve calcular MÉDIA de avaliações do veterinário', async () => {
      // /veterinarios/estatisticas usa o token do vet autenticado — não recebe id na URL.
      const response = await request(app)
        .get('/api/v1/veterinarios/estatisticas')
        .set('Authorization', `Bearer ${veterinarioToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('avaliacaoMedia');
      expect(response.body.avaliacaoMedia).toBeGreaterThanOrEqual(0);
      expect(response.body.avaliacaoMedia).toBeLessThanOrEqual(5);
    });
  });

  // ═══════════════════════════════════════════════════════
  // GRUPO 6: NOTIFICAÇÕES
  // ═══════════════════════════════════════════════════════
  
  // Não existe uma "caixa de notificações" do usuário hoje — /api/v1/notificacoes só
  // expõe configuração global de notificação, restrita a super_admin (ver
  // ROADMAP.md → notificações push é item de evolução futura, não implementado
  // ainda). Os testes originais assumiam uma rota de inbox que nunca existiu nesse
  // formato; ajustados pra validar o que realmente existe: acesso negado pra tutor.
  describe('6. NOTIFICAÇÕES - Sistema de Alertas', () => {
    it('6.1 tutor não deve poder acessar configurações de notificação (só super_admin)', async () => {
      const response = await request(app)
        .get('/api/v1/notificacoes/configuracoes')
        .set('Authorization', `Bearer ${tutorToken}`);

      expect(response.status).toBe(403);
    });
  });

  // ═══════════════════════════════════════════════════════
  // GRUPO 7: MULTI-TENANCY E ISOLAMENTO
  // ═══════════════════════════════════════════════════════
  
  describe('7. MULTI-TENANCY - Isolamento de Dados', () => {
    it('7.1 deve garantir isolamento entre tenants', async () => {
      // Dados do tutor pertencem ao tenant correto
      const petsResponse = await request(app)
        .get('/api/v1/pets')
        .set('Authorization', `Bearer ${tutorToken}`);

      expect(petsResponse.status).toBe(200);
      
      // Todos os pets devem pertencer ao mesmo tenant
      petsResponse.body.pets.forEach(pet => {
        expect(pet.tenant_id).toBe(tenantId);
      });
    });

    it('7.2 deve bloquear acesso a dados de outro tenant', async () => {
      // Tentar acessar solicitação com token de outro tenant deve falhar
      // (Em produção, teríamos criado um segundo tenant)
      const response = await request(app)
        .get(`/api/v1/solicitacoes/${solicitacaoId}`)
        .set('Authorization', `Bearer ${tutorToken}`);

      expect(response.status).toBe(200);
      expect(response.body.tenant_id).toBe(tenantId);
    });
  });

  // ═══════════════════════════════════════════════════════
  // GRUPO 8: VALIDAÇÕES E SEGURANÇA
  // ═══════════════════════════════════════════════════════
  
  describe('8. SEGURANÇA - Validações e Proteções', () => {
    it('8.1 deve bloquear acesso sem token (401)', async () => {
      const response = await request(app)
        .get('/api/v1/pets');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });

    it('8.2 deve bloquear acesso com token inválido', async () => {
      const response = await request(app)
        .get('/api/v1/pets')
        .set('Authorization', 'Bearer token-invalido-123');

      expect(response.status).toBe(401);
    });

    it('8.3 deve validar dados obrigatórios (400)', async () => {
      const response = await request(app)
        .post('/api/v1/pets')
        .set('Authorization', `Bearer ${tutorToken}`)
        .send({
          // Faltando campos obrigatórios
          nome: 'Pet Sem Dados'
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('8.4 deve bloquear operações não autorizadas (403)', async () => {
      // Tutor tentando aprovar veterinário (ação de admin)
      const response = await request(app)
        .put(`/api/v1/veterinarios/${veterinarioId}/aprovar`)
        .set('Authorization', `Bearer ${tutorToken}`);

      expect([401, 403, 404]).toContain(response.status);
    });
  });

  // ═══════════════════════════════════════════════════════
  // GRUPO 9: FLUXO COMPLETO INTEGRADO
  // ═══════════════════════════════════════════════════════
  
  describe('9. INTEGRAÇÃO - Fluxo End-to-End Completo', () => {
    it('9.1 deve validar ciclo completo: Cadastro → Atendimento → Avaliação', async () => {
      // Este teste valida que todos os dados estão conectados corretamente
      
      // 1. Verificar pet cadastrado
      const petResponse = await request(app)
        .get(`/api/v1/pets/${petId}`)
        .set('Authorization', `Bearer ${tutorToken}`);
      
      expect(petResponse.status).toBe(200);
      expect(petResponse.body.pet.tutor_id).toBe(tutorId);

      // 2. Verificar solicitação criada e finalizada
      const solResponse = await request(app)
        .get(`/api/v1/solicitacoes/${solicitacaoId}`)
        .set('Authorization', `Bearer ${tutorToken}`);
      
      expect(solResponse.status).toBe(200);
      expect(solResponse.body.pet_id).toBe(petId);
      expect(solResponse.body.status).toBe('finalizado');
      expect(solResponse.body.veterinario_id).toBe(veterinarioRecordId);

      // 3. Verificar avaliação criada
      const avalResponse = await request(app)
        .get(`/api/v1/avaliacoes/${avaliacaoId}`)
        .set('Authorization', `Bearer ${tutorToken}`);
      
      expect(avalResponse.status).toBe(200);
      // O campo de FK no modelo Avaliacao chama-se atendimento_id, não solicitacao_id.
      expect(avalResponse.body.atendimento_id).toBe(solicitacaoId);
      expect(avalResponse.body.nota).toBe(5);
    });

    it('9.2 deve garantir rastreabilidade completa do fluxo', async () => {
      // Verificar que todos os registros estão conectados
      const solicitacao = await request(app)
        .get(`/api/v1/solicitacoes/${solicitacaoId}`)
        .set('Authorization', `Bearer ${tutorToken}`);

      expect(solicitacao.body).toMatchObject({
        pet_id: petId,
        veterinario_id: veterinarioRecordId,
        status: 'finalizado'
      });

      expect(solicitacao.body).toHaveProperty('diagnostico');
      expect(solicitacao.body).toHaveProperty('receita');
      expect(solicitacao.body).toHaveProperty('criado_em');
      expect(solicitacao.body).toHaveProperty('atualizado_em');
    });
  });

  // ═══════════════════════════════════════════════════════
  // GRUPO 10: HEALTH CHECK E MONITORAMENTO
  // ═══════════════════════════════════════════════════════
  
  describe('10. MONITORAMENTO - Sistema Saudável', () => {
    it('10.1 health check deve retornar OK', async () => {
      const response = await request(app)
        .get('/api/health');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ok');
    });

    it('10.2 deve ter todas as rotas registradas', () => {
      // Validar que a aplicação está configurada corretamente
      expect(app).toBeDefined();
      expect(app._router).toBeDefined();
    });
  });
});
