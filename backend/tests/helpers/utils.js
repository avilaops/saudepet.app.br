const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

/**
 * Gerar token JWT válido para testes
 */
function generateTestToken(userId, userType = 'tutor', tenantId = 'test-tenant-1') {
  return jwt.sign(
    { 
      id: userId,
      tipo_usuario: userType,
      tenant_id: tenantId
    },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

/**
 * Criar app de teste com rotas específicas
 */
function createTestApp(routes, middlewares = []) {
  const app = express();
  app.use(express.json());
  
  // Aplicar middlewares customizados
  middlewares.forEach(middleware => app.use(middleware));
  
  // Aplicar rotas
  Object.entries(routes).forEach(([path, router]) => {
    app.use(path, router);
  });
  
  // Error handler
  const { errorHandler } = require('../../src/middleware/error.middleware');
  app.use(errorHandler);
  
  return app;
}

/**
 * Fazer requisição autenticada
 */
function authenticatedRequest(app, method, url, token, data = null) {
  const req = request(app)[method.toLowerCase()](url)
    .set('Authorization', `Bearer ${token}`);
  
  if (data) {
    req.send(data);
  }
  
  return req;
}

/**
 * Verificar estrutura de resposta de erro
 */
function expectErrorResponse(response, statusCode, errorMessage = null) {
  expect(response.status).toBe(statusCode);
  expect(response.body).toHaveProperty('error');
  
  if (errorMessage) {
    expect(response.body.error).toContain(errorMessage);
  }
}

/**
 * Verificar estrutura de resposta de sucesso
 */
function expectSuccessResponse(response, statusCode, properties = []) {
  expect(response.status).toBe(statusCode);
  
  properties.forEach(prop => {
    expect(response.body).toHaveProperty(prop);
  });
}

/**
 * Verificar estrutura de paginação
 */
function expectPaginationResponse(response) {
  expect(response.status).toBe(200);
  expect(response.body).toHaveProperty('paginacao');
  expect(response.body.paginacao).toHaveProperty('total');
  expect(response.body.paginacao).toHaveProperty('pagina');
  expect(response.body.paginacao).toHaveProperty('limite');
  expect(response.body.paginacao).toHaveProperty('total_paginas');
}

/**
 * Mock do Prisma para testes
 */
function mockPrisma(modelName, methods = {}) {
  const prisma = require('../../src/config/database');
  
  if (!prisma[modelName]) {
    prisma[modelName] = {};
  }
  
  Object.entries(methods).forEach(([method, mockFn]) => {
    if (typeof mockFn === 'function') {
      prisma[modelName][method] = jest.fn(mockFn);
    } else {
      prisma[modelName][method] = jest.fn().mockResolvedValue(mockFn);
    }
  });
  
  return prisma[modelName];
}

/**
 * Limpar todos os mocks do Prisma
 */
function clearPrismaMocks() {
  const prisma = require('../../src/config/database');
  Object.keys(prisma).forEach(key => {
    if (prisma[key] && typeof prisma[key] === 'object') {
      Object.keys(prisma[key]).forEach(method => {
        if (jest.isMockFunction(prisma[key][method])) {
          prisma[key][method].mockClear();
        }
      });
    }
  });
}

/**
 * Esperar por tempo específico (para testes assíncronos)
 */
function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Gerar dados aleatórios
 */
const randomData = {
  email: () => `test-${Date.now()}-${Math.random().toString(36).substring(7)}@test.com`,
  telefone: () => `11${Math.floor(Math.random() * 900000000 + 100000000)}`,
  cpf: () => {
    const n = () => Math.floor(Math.random() * 10);
    return `${n()}${n()}${n()}.${n()}${n()}${n()}.${n()}${n()}${n()}-${n()}${n()}`;
  },
  cnpj: () => {
    const n = () => Math.floor(Math.random() * 10);
    return `${n()}${n()}.${n()}${n()}${n()}.${n()}${n()}${n()}/${n()}${n()}${n()}${n()}-${n()}${n()}`;
  },
  slug: () => `test-${Date.now()}-${Math.random().toString(36).substring(7)}`,
  uuid: () => `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`
};

/**
 * Validar formato de UUID
 */
function isValidUUID(uuid) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Validar formato de email
 */
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Criar snapshot de resposta sem campos dinâmicos
 */
function createSnapshot(data, excludeFields = ['id', 'criado_em', 'atualizado_em']) {
  if (Array.isArray(data)) {
    return data.map(item => createSnapshot(item, excludeFields));
  }
  
  if (data && typeof data === 'object') {
    const snapshot = {};
    Object.keys(data).forEach(key => {
      if (!excludeFields.includes(key)) {
        snapshot[key] = createSnapshot(data[key], excludeFields);
      }
    });
    return snapshot;
  }
  
  return data;
}

module.exports = {
  generateTestToken,
  createTestApp,
  authenticatedRequest,
  expectErrorResponse,
  expectSuccessResponse,
  expectPaginationResponse,
  mockPrisma,
  clearPrismaMocks,
  wait,
  randomData,
  isValidUUID,
  isValidEmail,
  createSnapshot
};
