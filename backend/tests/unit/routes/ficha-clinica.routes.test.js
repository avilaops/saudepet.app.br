/**
 * Quem pode mexer na ficha clínica do pet.
 *
 * v1.0: o veterinário aprovado corrige a ficha do pet que ATENDEU (solicitação
 * ou agendamento), e o admin do tenant corrige qualquer uma. Tutor, não — e é
 * justamente o tutor que já chega autenticado nas rotas `/pets`, por isso a
 * checagem vive numa rota separada e é testada aqui.
 */
const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');

const prisma = require('../../../src/config/database');
const { errorHandler } = require('../../../src/middleware/error.middleware');
const router = require('../../../src/routes/ficha-clinica.routes');

function token(tipo) {
  return jwt.sign(
    { id: `user-${tipo}`, tipo_usuario: tipo, tenant_id: 'tenant-a' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

function autenticar(tipo, { aprovado = true } = {}) {
  prisma.usuario.findUnique.mockResolvedValue({
    id: `user-${tipo}`,
    tenant_id: 'tenant-a',
    tipo_usuario: tipo,
    ativo: true,
    email_verificado: true,
    // `authMiddleware` seleciona o tenant junto do usuário e exige status ativo.
    tenant: { status: 'ativo', expira_em: null },
    veterinario: tipo === 'veterinario' ? { id: 'vet-1', aprovado_admin: aprovado } : null
  });
  prisma.tokenBlacklist.findUnique.mockResolvedValue(null);
  prisma.tokenBlacklist.findFirst.mockResolvedValue(null);
  prisma.tenant.findUnique.mockResolvedValue({ id: 'tenant-a', status: 'ativo', ativo: true });
  prisma.tenant.findFirst.mockResolvedValue({ id: 'tenant-a', status: 'ativo', ativo: true });
}

describe('rotas de correção da ficha clínica', () => {
  const app = express();
  app.use(express.json());
  app.use('/pets', router);
  app.use(errorHandler);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('exige autenticação', async () => {
    const resposta = await request(app).put('/pets/pet-1/alergias/reg-1').send({ gravidade: 'leve' });
    expect(resposta.status).toBe(401);
  });

  it('barra o tutor: a ficha clínica não é editável pelo dono do animal', async () => {
    autenticar('tutor');

    const resposta = await request(app)
      .put('/pets/pet-1/alergias/reg-1')
      .set('Authorization', `Bearer ${token('tutor')}`)
      .send({ gravidade: 'leve' });

    expect(resposta.status).toBe(403);
    expect(prisma.petAlergia.findFirst).not.toHaveBeenCalled();
  });

  it('barra veterinário ainda não aprovado', async () => {
    autenticar('veterinario', { aprovado: false });

    const resposta = await request(app)
      .put('/pets/pet-1/alergias/reg-1')
      .set('Authorization', `Bearer ${token('veterinario')}`)
      .send({ gravidade: 'leve' });

    expect(resposta.status).toBe(403);
    expect(prisma.petAlergia.findFirst).not.toHaveBeenCalled();
  });

  it('barra veterinário aprovado que nunca atendeu o pet', async () => {
    autenticar('veterinario');
    prisma.solicitacao.findFirst.mockResolvedValue(null);
    prisma.agendamento.findFirst.mockResolvedValue(null);

    const resposta = await request(app)
      .put('/pets/pet-1/alergias/reg-1')
      .set('Authorization', `Bearer ${token('veterinario')}`)
      .send({ gravidade: 'leve' });

    expect(resposta.status).toBe(403);
    expect(prisma.petAlergia.update).not.toHaveBeenCalled();
  });

  it('deixa passar o veterinário aprovado que atendeu o pet, mesmo sem ter registrado o dado', async () => {
    autenticar('veterinario');
    prisma.solicitacao.findFirst.mockResolvedValue({ id: 'sol-1' });
    prisma.agendamento.findFirst.mockResolvedValue(null);
    prisma.petAlergia.findFirst.mockResolvedValue({
      id: 'reg-1', tenant_id: 'tenant-a', pet_id: 'pet-1', alergia: 'Dipirona', gravidade: 'grave', ativo: true
    });
    prisma.petAlergia.update.mockResolvedValue({
      id: 'reg-1', tenant_id: 'tenant-a', pet_id: 'pet-1', alergia: 'Dipirona', gravidade: 'leve', ativo: true
    });

    const resposta = await request(app)
      .put('/pets/pet-1/alergias/reg-1')
      .set('Authorization', `Bearer ${token('veterinario')}`)
      .send({ gravidade: 'leve' });

    expect(resposta.status).toBe(200);
    expect(resposta.body.registro.gravidade).toBe('leve');
  });

  it('deixa passar o admin do tenant, que responde pela ficha quando o vet saiu da plataforma', async () => {
    autenticar('admin');
    prisma.petVacina.findFirst.mockResolvedValue({
      id: 'vac-1', tenant_id: 'tenant-a', pet_id: 'pet-1', nome_vacina: 'V10', ativo: true
    });
    prisma.petVacina.update.mockResolvedValue({
      id: 'vac-1', tenant_id: 'tenant-a', pet_id: 'pet-1', nome_vacina: 'V10', ativo: false
    });

    const resposta = await request(app)
      .delete('/pets/pet-1/vacinas/vac-1')
      .set('Authorization', `Bearer ${token('admin')}`)
      .send({ motivo: 'Lançada no pet errado' });

    expect(resposta.status).toBe(200);
    expect(resposta.body.removido).toBe(true);
  });

  it('recusa remoção sem motivo antes de tocar no banco', async () => {
    autenticar('veterinario');

    const resposta = await request(app)
      .delete('/pets/pet-1/medicamentos/med-1')
      .set('Authorization', `Bearer ${token('veterinario')}`)
      .send({ motivo: 'ops' });

    expect(resposta.status).toBe(400);
    expect(resposta.body.details[0].field).toBe('motivo');
    expect(prisma.petMedicamento.findFirst).not.toHaveBeenCalled();
  });
});
