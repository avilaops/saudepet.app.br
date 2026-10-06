// Colisão de rotas em /api/pets.
//
// `ficha-clinica.routes` é montado no MESMO caminho de `pet.routes` e antes
// dele. Com um `router.use(vetAprovadoOuAdmin)` — guarda de router, sem path —
// toda requisição que entrava ali era barrada, inclusive `GET /api/pets`, que é
// a lista de pets do TUTOR e não casa com nenhuma rota da ficha clínica. O
// tutor via "Acesso negado. Apenas veterinários." ao abrir "Meus pets".
//
// As outras suítes não pegavam porque montam só um router por vez; a colisão só
// existe com a ordem real do servidor, reproduzida aqui.
const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const prisma = require('../../../src/config/database');

const fichaClinicaRoutes = require('../../../src/routes/ficha-clinica.routes');
const petRoutes = require('../../../src/routes/pet.routes');
const { errorHandler } = require('../../../src/middleware/error.middleware');

const TUTOR = '11111111-2222-4333-8444-555555555555';
const TENANT = 'tenant-1';

const token = (tipo = 'tutor') =>
  jwt.sign({ id: TUTOR, tipo_usuario: tipo, tenant_id: TENANT }, process.env.JWT_SECRET, { expiresIn: '5m' });

function montarComoNoServidor() {
  const app = express();
  app.use(express.json());
  // Mesma ordem do server.js.
  app.use('/api/pets', fichaClinicaRoutes);
  app.use('/api/pets', petRoutes);
  app.use(errorHandler);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
  prisma.usuario.findUnique.mockResolvedValue({
    id: TUTOR,
    tenant_id: TENANT,
    nome: 'Maria',
    email: 'maria@x.com',
    tipo_usuario: 'tutor',
    email_verificado: true,
    sessoes_revogadas_em: null,
    bloqueado: false,
    bloqueado_ate: null,
    bloqueio_motivo: null,
    tenant: { status: 'ativo', expira_em: null },
    veterinario: null
  });
  prisma.pet.findMany.mockResolvedValue([]);
  // `requireActiveTenant` relê a organização do banco.
  prisma.tenant.findUnique.mockResolvedValue({ id: TENANT, status: 'ativo', expira_em: null });
});

describe('GET /api/pets com a ficha clínica montada no mesmo caminho', () => {
  it('o tutor consegue listar os próprios pets', async () => {
    const resposta = await request(montarComoNoServidor())
      .get('/api/pets')
      .set('Authorization', `Bearer ${token()}`);

    expect(resposta.status).not.toBe(403);
    expect(resposta.status).toBe(200);
  });

  it('a guarda da ficha clínica continua valendo nas rotas dela', async () => {
    // Corrigir alergia é ato de veterinário: o tutor não pode.
    const resposta = await request(montarComoNoServidor())
      .delete(`/api/pets/${TUTOR}/alergias/abc`)
      .set('Authorization', `Bearer ${token()}`)
      .send({ motivo: 'qualquer coisa aqui' });

    expect(resposta.status).toBe(403);
  });
});
