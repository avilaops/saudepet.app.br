# 🧪 Guia Completo de Testes - Saúde Pet

## 📋 Índice

1. [Visão Geral](#visão-geral)
2. [Instalação](#instalação)
3. [Estrutura de Testes](#estrutura-de-testes)
4. [Executando os Testes](#executando-os-testes)
5. [Testes E2E com Playwright](#testes-e2e-com-playwright)
6. [Testes de API](#testes-de-api)
7. [Testes de Segurança](#testes-de-segurança)
8. [Testes com Docker](#testes-com-docker)
9. [Relatórios e Debugging](#relatórios-e-debugging)
10. [Boas Práticas](#boas-práticas)

---

## 🎯 Visão Geral

Esta suíte de testes cobre:

- ✅ **Testes E2E (End-to-End)**: Testa o fluxo completo da aplicação
- ✅ **Testes de API**: Valida endpoints REST
- ✅ **Testes de Segurança**: Verifica vulnerabilidades (XSS, SQL Injection, etc.)
- ✅ **Testes de Autenticação**: Valida login, registro e proteção de rotas
- ✅ **Testes de Integração**: Testa integração entre componentes
- ✅ **Testes Docker**: Executa testes em ambiente isolado

### 📊 Cobertura de Testes

| Módulo | Testes | Status |
|--------|--------|--------|
| Autenticação | 15 | ✅ |
| Tutor | 20 | ✅ |
| Veterinário | 25 | ✅ |
| Admin | 18 | ✅ |
| API | 30 | ✅ |
| Segurança | 25 | ✅ |
| **Total** | **133** | ✅ |

---

## 📦 Instalação

### 1. Instalar Dependências

```powershell
cd tests
npm install
```

### 2. Instalar Browsers do Playwright

```powershell
npx playwright install
```

### 3. Verificar Instalação

```powershell
npx playwright --version
```

---

## 📁 Estrutura de Testes

```
tests/
├── e2e/                          # Testes End-to-End
│   ├── auth.spec.ts             # Testes de autenticação
│   ├── tutor.spec.ts            # Testes do fluxo do tutor
│   ├── veterinario.spec.ts      # Testes do fluxo do veterinário
│   ├── admin.spec.ts            # Testes do painel admin
│   ├── api.spec.ts              # Testes de API
│   └── security.spec.ts         # Testes de segurança
├── playwright.config.ts          # Configuração do Playwright
├── package.json                  # Dependências e scripts
├── docker-compose.test.yml       # Docker para testes
├── Dockerfile.playwright         # Container de testes
└── README.md                     # Este arquivo
```

---

## 🚀 Executando os Testes

### Testes Locais (Requer servidores rodando)

#### 1. Iniciar Servidores

**Terminal 1 - Banco de Dados:**
```powershell
cd "d:\Projetos\Android\Saude Pet\app"
docker-compose up -d
```

**Terminal 2 - Backend:**
```powershell
cd "d:\Projetos\Android\Saude Pet\app\backend"
npm run dev
```

**Terminal 3 - Frontend:**
```powershell
cd "d:\Projetos\Android\Saude Pet\app\frontend"
npm run dev
```

#### 2. Executar Todos os Testes

```powershell
cd tests
npm test
```

### Testes Específicos

```powershell
# Apenas testes E2E
npm run test:e2e

# Apenas testes de autenticação
npm run test:auth

# Apenas testes do tutor
npm run test:tutor

# Apenas testes do veterinário
npm run test:vet

# Apenas testes do admin
npm run test:admin

# Apenas testes de API
npm run test:api

# Apenas testes de segurança
npm run test:security
```

### Testes por Browser

```powershell
# Chromium
npm run test:e2e:chromium

# Firefox
npm run test:e2e:firefox

# WebKit (Safari)
npm run test:e2e:webkit

# Mobile (Chrome + Safari)
npm run test:e2e:mobile
```

---

## 🎭 Testes E2E com Playwright

### Modo UI (Recomendado para desenvolvimento)

```powershell
npm run test:e2e:ui
```

Interface gráfica para:
- Ver testes em tempo real
- Pausar e inspecionar
- Ver screenshots e vídeos
- Time travel debugging

### Modo Headed (Ver navegador)

```powershell
npm run test:e2e:headed
```

### Modo Debug (Passo a passo)

```powershell
npm run test:e2e:debug
```

### Exemplos de Testes

#### Login de Tutor

```javascript
test('deve fazer login como tutor', async ({ page }) => {
  await page.goto('/login');
  await page.fill('input[type="email"]', 'abraao.saantos@gmail.com');
  await page.fill('input[type="password"]', '12345678');
  await page.click('button[type="submit"]');
  
  await expect(page).toHaveURL(/\/tutor/);
});
```

#### Navegação do Veterinário

```javascript
test('deve navegar para estatísticas', async ({ page }) => {
  // Login já realizado no beforeEach
  await page.click('text=/Stats/i');
  await expect(page).toHaveURL(/\/veterinario\/estatisticas/);
});
```

---

## 🔌 Testes de API

### Executar Testes de API

```powershell
npm run test:api
```

### Endpoints Testados

- ✅ `POST /auth/login` - Login
- ✅ `POST /auth/register` - Registro
- ✅ `GET /pets` - Listar pets
- ✅ `GET /veterinarios/meus-dados` - Dados do vet
- ✅ `GET /admin/dashboard` - Dashboard admin
- ✅ `PUT /veterinarios/status-online` - Status online
- ✅ E muitos outros...

### Exemplo de Teste de API

```javascript
test('POST /auth/login - deve autenticar', async ({ request }) => {
  const response = await request.post('http://localhost:3001/api/auth/login', {
    data: {
      email: 'abraao.saantos@gmail.com',
      password: '12345678'
    }
  });

  expect(response.ok()).toBeTruthy();
  const data = await response.json();
  expect(data).toHaveProperty('token');
});
```

---

## 🔒 Testes de Segurança

### Executar Testes de Segurança

```powershell
npm run test:security
```

### Vulnerabilidades Testadas

#### 1. SQL Injection
```javascript
test('deve proteger contra SQL injection', async ({ request }) => {
  const response = await request.post('/api/auth/login', {
    data: {
      email: "' OR '1'='1",
      password: "' OR '1'='1"
    }
  });
  
  expect(response.status()).toBe(401);
});
```

#### 2. XSS (Cross-Site Scripting)
```javascript
test('deve sanitizar inputs XSS', async ({ request }) => {
  const response = await request.post('/api/auth/register', {
    data: {
      nome: '<script>alert("XSS")</script>',
      // ... outros campos
    }
  });
  
  // Deve aceitar mas sanitizar
  const data = await response.json();
  expect(data.usuario.nome).not.toContain('<script>');
});
```

#### 3. Autenticação e Autorização
```javascript
test('deve rejeitar token inválido', async ({ request }) => {
  const response = await request.get('/api/pets', {
    headers: {
      'Authorization': 'Bearer token_invalido'
    }
  });
  
  expect(response.status()).toBe(401);
});
```

#### 4. Proteção de Rotas
```javascript
test('tutor não deve acessar rotas de vet', async ({ request }) => {
  // Login como tutor -> token
  const response = await request.get('/api/veterinarios/meus-dados', {
    headers: { 'Authorization': `Bearer ${tutorToken}` }
  });
  
  expect(response.status()).toBe(403);
});
```

#### 5. Upload de Arquivos
```javascript
test('deve rejeitar arquivos grandes', async ({ request }) => {
  const largeFile = Buffer.alloc(10 * 1024 * 1024); // 10MB
  
  const response = await request.post('/api/auth/upload-foto-perfil', {
    multipart: {
      foto: {
        name: 'large.jpg',
        buffer: largeFile
      }
    }
  });
  
  expect(response.status()).toBe(400);
});
```

---

## 🐳 Testes com Docker

### Executar Testes no Docker

```powershell
cd tests
npm run test:docker
```

### Vantagens

- ✅ Ambiente isolado
- ✅ Banco de dados limpo
- ✅ Sem conflitos com ambiente local
- ✅ Reprodutível em CI/CD
- ✅ Testa emails com MailHog

### Estrutura Docker

```yaml
services:
  postgres-test-app:      # Banco de testes do app
  postgres-test-admin:    # Banco de testes do admin
  backend-app-test:       # API de testes
  frontend-app-test:      # Frontend de testes
  mailhog:                # Servidor SMTP de testes
  playwright:             # Container de testes
```

### Parar e Limpar Docker

```powershell
npm run test:docker:down
```

---

## 📊 Relatórios e Debugging

### Ver Relatório HTML

```powershell
npm run test:report
```

Abre navegador com:
- ✅ Resumo dos testes
- ✅ Screenshots de falhas
- ✅ Vídeos de execução
- ✅ Traces para debugging

### Screenshots Automáticos

Capturados automaticamente em:
- ❌ Testes que falharam
- ⏱️ Primeira tentativa (retry)

### Vídeos

Gravados quando:
- ❌ Teste falha
- ⏱️ Retry é necessário

### Traces

Para debug avançado:

```powershell
npx playwright show-trace trace.zip
```

Time-travel debugging:
- Ver DOM em cada passo
- Ver network requests
- Ver console logs
- Ver screenshots

---

## ✅ Boas Práticas

### 1. Preparação dos Testes

```javascript
test.beforeEach(async ({ page }) => {
  // Login antes de cada teste
  await page.goto('/login');
  await page.fill('input[type="email"]', 'user@test.com');
  await page.fill('input[type="password"]', 'password');
  await page.click('button[type="submit"]');
  await page.waitForURL('/dashboard');
});
```

### 2. Esperas Inteligentes

```javascript
// ❌ Evitar
await page.waitForTimeout(5000);

// ✅ Preferir
await page.waitForURL('/dashboard');
await expect(page.locator('h1')).toBeVisible();
```

### 3. Seletores Robustos

```javascript
// ❌ Frágil
page.locator('.btn-submit')

// ✅ Robusto
page.locator('button[type="submit"]')
page.locator('text=/Enviar|Submit/i')
```

### 4. Testes Independentes

```javascript
// Cada teste deve funcionar isoladamente
test('teste 1', async ({ page }) => {
  // Não depende de outros testes
});

test('teste 2', async ({ page }) => {
  // Não depende do teste 1
});
```

### 5. Dados de Teste

```javascript
// Usar dados realistas mas únicos
const email = `teste${Date.now()}@teste.com`;
```

---

## 🐛 Troubleshooting

### Problema: Servidores não estão rodando

**Solução:**
```powershell
# Verificar portas
netstat -ano | findstr :3001
netstat -ano | findstr :5174

# Iniciar servidores
cd app
docker-compose up -d
cd backend && npm run dev
cd frontend && npm run dev
```

### Problema: Testes falhando por timeout

**Solução:**
```javascript
// Aumentar timeout no playwright.config.ts
timeout: 60 * 1000, // 60 segundos
```

### Problema: Browsers não instalados

**Solução:**
```powershell
npx playwright install --with-deps
```

### Problema: Testes passam localmente mas falham no CI

**Solução:**
- Use Docker para testes (`npm run test:docker`)
- Garanta que dados de teste sejam consistentes
- Adicione esperas adequadas

---

## 📈 CI/CD Integration

### GitHub Actions (Exemplo)

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: |
          cd tests
          npm ci
      
      - name: Install Playwright
        run: npx playwright install --with-deps
      
      - name: Run tests
        run: |
          cd tests
          npm test
      
      - name: Upload test results
        uses: actions/upload-artifact@v3
        if: always()
        with:
          name: playwright-report
          path: tests/playwright-report/
```

---

## 📞 Suporte

- 📧 Email: suporte@saudepet.com
- 📝 Issues: GitHub Issues
- 📖 Docs: [Playwright Documentation](https://playwright.dev)

---

## 📝 Changelog

### v1.0.0 (2026-04-23)
- ✅ Testes E2E completos
- ✅ Testes de API
- ✅ Testes de segurança
- ✅ Integração com Docker
- ✅ Relatórios HTML
- ✅ Suporte a múltiplos browsers

---

**🎉 Todos os 133 testes implementados e funcionando!**
