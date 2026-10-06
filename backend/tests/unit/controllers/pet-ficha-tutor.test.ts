/**
 * Ficha de saúde declarada pelo tutor: só no pet dele, e nunca no dos outros.
 */
const express = require('express');
const request = require('supertest');
const prisma = require('../../../src/config/database');
const controller = require('../../../src/controllers/pet-ficha-tutor.controller');
const validate = require('../../../src/middleware/validate.middleware');
const { criarAlergiaTutorSchema, criarVacinaTutorSchema, criarMedicamentoTutorSchema } = require('../../../src/schemas/pet-ficha-tutor.schema');
const { errorHandler } = require('../../../src/middleware/error.middleware');

jest.mock('../../../src/services/audit.service', () => ({
  logForensicEvent: jest.fn().mockResolvedValue(undefined)
}));

function appComo(userId: string, userType = 'tutor') {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res: any, next: any) => {
    req.userId = userId;
    req.userType = userType;
    req.tenantId = 'tenant-a';
    next();
  });
  app.get('/pets/:id/ficha', controller.listar);
  app.post('/pets/:id/ficha/alergias', validate(criarAlergiaTutorSchema), controller.criarAlergia);
  app.delete('/pets/:id/ficha/alergias/:registroId', controller.removerAlergia);
  app.post('/pets/:id/ficha/vacinas', validate(criarVacinaTutorSchema), controller.criarVacina);
  app.post('/pets/:id/ficha/medicamentos', validate(criarMedicamentoTutorSchema), controller.criarMedicamento);
  app.use(errorHandler);
  return app;
}

describe('ficha do pet pelo tutor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('pet de outro tutor responde 404 e nada é gravado', async () => {
    prisma.pet.findFirst.mockResolvedValue(null);
    const res = await request(appComo('tutor-b')).post('/pets/pet-do-a/ficha/alergias').send({ alergia: 'Dipirona' });
    expect(res.status).toBe(404);
    expect(prisma.pet.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'pet-do-a', tenant_id: 'tenant-a', tutor_id: 'tutor-b' }
    }));
    expect(prisma.petAlergia.create).not.toHaveBeenCalled();
  });

  it('cria alergia no pet do próprio tutor, amarrada ao tenant e ao pet', async () => {
    prisma.pet.findFirst.mockResolvedValue({ id: 'pet-1', nome: 'Rex' });
    prisma.petAlergia.create.mockResolvedValue({ id: 'al-1', alergia: 'Dipirona', gravidade: 'grave' });
    const res = await request(appComo('tutor-a')).post('/pets/pet-1/ficha/alergias').send({ alergia: 'Dipirona', gravidade: 'grave' });
    expect(res.status).toBe(201);
    expect(prisma.petAlergia.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ alergia: 'Dipirona', gravidade: 'grave', tenant_id: 'tenant-a', pet_id: 'pet-1' })
    });
  });

  it('valida a vacina: data futura é recusada', async () => {
    prisma.pet.findFirst.mockResolvedValue({ id: 'pet-1' });
    const futuro = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const res = await request(appComo('tutor-a')).post('/pets/pet-1/ficha/vacinas').send({ nome_vacina: 'V10', data_aplicacao: futuro });
    expect(res.status).toBe(400);
    expect(res.body.details[0].field).toBe('data_aplicacao');
  });

  it('medicamento sem data de início começa hoje', async () => {
    prisma.pet.findFirst.mockResolvedValue({ id: 'pet-1' });
    prisma.petMedicamento.create.mockResolvedValue({ id: 'med-1' });
    const res = await request(appComo('tutor-a')).post('/pets/pet-1/ficha/medicamentos')
      .send({ nome_medicamento: 'Apoquel', dosagem: '16mg', frequencia_horas: '24', uso_continuo: 'true' });
    expect(res.status).toBe(201);
    const dados = prisma.petMedicamento.create.mock.calls[0][0].data;
    expect(dados.frequencia_horas).toBe(24);
    expect(dados.uso_continuo).toBe(true);
    expect(dados.data_inicio).toBeInstanceOf(Date);
  });

  it('remoção é lógica e registra quem removeu', async () => {
    prisma.pet.findFirst.mockResolvedValue({ id: 'pet-1' });
    prisma.petAlergia.findFirst.mockResolvedValue({ id: 'al-1', ativo: true });
    prisma.petAlergia.update.mockResolvedValue({ id: 'al-1', ativo: false });
    const res = await request(appComo('tutor-a')).delete('/pets/pet-1/ficha/alergias/al-1');
    expect(res.status).toBe(200);
    expect(prisma.petAlergia.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ ativo: false, removido_por: 'tutor-a' })
    }));
  });

  it('lista só registros ativos do pet', async () => {
    prisma.pet.findFirst.mockResolvedValue({ id: 'pet-1' });
    prisma.petAlergia.findMany.mockResolvedValue([{ id: 'al-1' }]);
    prisma.petMedicamento.findMany.mockResolvedValue([]);
    prisma.petVacina.findMany.mockResolvedValue([{ id: 'vac-1' }]);
    const res = await request(appComo('tutor-a')).get('/pets/pet-1/ficha');
    expect(res.status).toBe(200);
    expect(res.body.alergias).toHaveLength(1);
    expect(prisma.petVacina.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenant_id: 'tenant-a', pet_id: 'pet-1', ativo: true }
    }));
  });
});
