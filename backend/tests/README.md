# 🧪 Guia de Testes - Saúde Pet Backend

## 📊 Estrutura de Testes

```
tests/
├── setup.js                    # Configuração global de testes
├── helpers/
│   ├── fixtures.js            # Dados de teste reutilizáveis
│   └── utils.js               # Utilidades e helpers
├── mocks/
│   └── prisma.mock.js         # Mock completo do Prisma
├── unit/                       # Testes unitários
│   ├── controllers/           # Testes de controllers
│   ├── services/              # Testes de services
│   └── middleware/            # Testes de middlewares
├── integration/                # Testes de integração
│   └── routes/                # Testes de rotas
│       ├── auth.test.js
│       ├── formulario.test.js
│       ├── billing.test.js
│       ├── moderacao.test.js
│       └── ...
└── e2e/                        # Testes end-to-end
    └── flows/                  # Fluxos completos
```

## 🚀 Comandos de Teste

### Executar todos os testes
```bash
npm test
```

### Testes por categoria
```bash
# Testes unitários
npm run test:unit

# Testes de integração
npm run test:integration

# Testes end-to-end
npm run test:e2e

# Testes de rotas
npm run test:routes

# Testes de controllers
npm run test:controllers

# Testes de services
npm run test:services
```

### Modo watch
```bash
# Watch mode (apenas arquivos alterados)
npm run test:watch

# Watch all (todos os arquivos)
npm run test:watchAll
```

### Coverage
```bash
# Gerar relatório de cobertura
npm run test:coverage

# Abrir relatório HTML
# coverage/index.html
```

### CI/CD
```bash
# Executar em ambiente de CI
npm run test:ci
```

## 📦 Fixtures e Builders

### Usar fixtures pré-definidos
```javascript
const { fixtures } = require('../helpers/fixtures');

test('exemplo com fixture', () => {
  const admin = fixtures.usuarios.admin;
  const tenant = fixtures.tenants.clinicaDemo;
});
```

### Usar builders para dados dinâmicos
```javascript
const { builders } = require('../helpers/fixtures');

test('exemplo com builder', () => {
  const usuario = builders.usuario({
    nome: 'Custom Name',
    email: 'custom@test.com'
  });
});
```

## 🔧 Helpers Disponíveis

### Utils de teste
```javascript
const {
  createTestApp,
  authenticatedRequest,
  expectErrorResponse,
  expectSuccessResponse,
  expectPaginationResponse,
  randomData
} = require('../helpers/utils');

// Criar app de teste
const app = createTestApp({
  '/api/v1/auth': authRoutes
});

// Requisição autenticada
const response = await authenticatedRequest(
  app,
  'GET',
  '/api/v1/auth/me',
  token
);

// Validar resposta de erro
expectErrorResponse(response, 401, 'Token não fornecido');

// Validar resposta de sucesso
expectSuccessResponse(response, 200, ['usuario', 'access_token']);

// Validar paginação
expectPaginationResponse(response);

// Gerar dados aleatórios
const email = randomData.email();
const telefone = randomData.telefone();
```

### Mock do Prisma
```javascript
const { mockPrisma } = require('../helpers/utils');

// Mock de um modelo específico
mockPrisma('usuario', {
  findUnique: () => Promise.resolve({ id: '1', nome: 'Test' }),
  create: () => Promise.resolve({ id: '2', nome: 'Created' })
});
```

## 📝 Exemplos de Testes

### Teste de Rota (Integration)
```javascript
describe('POST /api/v1/auth/register', () => {
  it('deve registrar novo usuário', async () => {
    const response = await request(app)
      .post('/api/v1/auth/register')
      .send({
        nome: 'João Silva',
        email: 'joao@test.com',
        senha: 'Senha@123',
        tipo_usuario: 'tutor',
        cidade: 'São Paulo',
        tenant_slug: 'clinica-demo'
      });

    expectSuccessResponse(response, 201, ['usuario', 'access_token']);
  });
});
```

### Teste de Controller (Unit)
```javascript
describe('AuthController', () => {
  it('deve criar usuário com senha hash', async () => {
    const mockReq = {
      body: {
        nome: 'Test',
        email: 'test@test.com',
        senha: 'Test@123'
      }
    };

    const mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    await authController.register(mockReq, mockRes);

    expect(mockRes.status).toHaveBeenCalledWith(201);
  });
});
```

### Teste de Service (Unit)
```javascript
describe('TokenService', () => {
  it('deve gerar token seguro', () => {
    const token = TokenService.generateSecureToken(32);
    
    expect(token).toHaveLength(64); // 32 bytes = 64 hex chars
    expect(token).toMatch(/^[a-f0-9]{64}$/);
  });
});
```

## 🎯 Metas de Coverage

- **Global**: 70%
- **Branches**: 70%
- **Functions**: 70%
- **Lines**: 70%
- **Statements**: 70%

## 🔍 Debugging Testes

### Executar teste específico
```bash
npm test -- auth.test.js
```

### Executar com descrição
```bash
npm test -- -t "deve registrar novo usuário"
```

### Ver todos os logs
```bash
SILENT_TESTS=false npm test
```

### Debug com VSCode
Adicionar em `.vscode/launch.json`:
```json
{
  "type": "node",
  "request": "launch",
  "name": "Jest Tests",
  "program": "${workspaceFolder}/node_modules/.bin/jest",
  "args": ["--runInBand", "--no-cache"],
  "console": "integratedTerminal"
}
```

## 📊 Relatórios

### Coverage HTML
```bash
npm run test:coverage
# Abrir: coverage/index.html
```

### Coverage JSON (para CI)
```bash
npm test -- --coverage --coverageReporters=json
# Arquivo: coverage/coverage-final.json
```

## ⚡ Performance

### Executar em paralelo
```bash
jest --maxWorkers=4
```

### Executar sequencialmente
```bash
jest --runInBand
```

### Cache
```bash
# Limpar cache
jest --clearCache

# Sem cache
jest --no-cache
```

## 🛠️ Boas Práticas

1. **Isolamento**: Cada teste deve ser independente
2. **Mocks**: Usar mocks para dependências externas
3. **Fixtures**: Reutilizar dados de teste
4. **Nomenclatura**: Descrições claras e objetivas
5. **AAA Pattern**: Arrange, Act, Assert
6. **Cleanup**: Limpar após cada teste
7. **Fast**: Testes devem ser rápidos
8. **Coverage**: Manter acima de 70%

## 📚 Recursos

- [Jest Documentation](https://jestjs.io/)
- [Supertest](https://github.com/visionmedia/supertest)
- [Testing Best Practices](https://testingjavascript.com/)
