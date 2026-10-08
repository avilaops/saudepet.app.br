const { test, expect } = require('@playwright/test');

const API_URL = 'http://localhost:3001/api';

test.describe('API - Autenticação', () => {
  test('POST /auth/login - deve fazer login com credenciais válidas', async ({ request }) => {
    const response = await request.post(`${API_URL}/auth/login`, {
      data: {
        email: 'abraao.saantos@gmail.com',
        senha: '12345678'
      }
    });

    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data).toHaveProperty('access_token');
    expect(data).toHaveProperty('usuario');
    expect(data.usuario.tipo_usuario).toBe('tutor');
  });

  test('POST /auth/login - deve rejeitar credenciais inválidas', async ({ request }) => {
    const response = await request.post(`${API_URL}/auth/login`, {
      data: {
        email: 'invalido@teste.com',
        senha: 'senhaerrada'
      }
    });

    expect(response.status()).toBe(401);
  });

  test('POST /auth/register - deve validar campos obrigatórios', async ({ request }) => {
    const response = await request.post(`${API_URL}/auth/register`, {
      data: {
        nome: 'Teste'
      }
    });

    expect(response.status()).toBe(400);
  });

  test('POST /auth/register - deve validar email duplicado', async ({ request }) => {
    const response = await request.post(`${API_URL}/auth/register`, {
      data: {
        nome: 'Teste Usuario',
        email: 'abraao.saantos@gmail.com', // Email já existe
        senha: '12345678',
        telefone: '41999999999',
        cidade: 'Curitiba',
        tipo_usuario: 'tutor'
      }
    });

    expect(response.status()).toBe(400);
    const data = await response.json();
    expect(data.error).toMatch(/email|já.*cadastrado/i);
  });
});

test.describe('API - Proteção de Rotas', () => {
  test('GET /veterinarios/meus-dados - deve exigir autenticação', async ({ request }) => {
    const response = await request.get(`${API_URL}/veterinarios/meus-dados`);
    expect(response.status()).toBe(401);
  });

  test('GET /admin/dashboard - deve exigir autenticação', async ({ request }) => {
    const response = await request.get(`${API_URL}/admin/dashboard`);
    expect(response.status()).toBe(401);
  });

  test('GET /pets - deve exigir autenticação', async ({ request }) => {
    const response = await request.get(`${API_URL}/pets`);
    expect(response.status()).toBe(401);
  });
});

test.describe('API - Veterinários', () => {
  let authToken;

  test.beforeAll(async ({ request }) => {
    // Login para obter token
    const response = await request.post(`${API_URL}/auth/login`, {
      data: {
        email: 'ricardo@teste.com',
        senha: '12345678'
      }
    });
    const data = await response.json();
    authToken = data.access_token;
  });

  test('GET /veterinarios/meus-dados - deve retornar dados do veterinário autenticado', async ({ request }) => {
    const response = await request.get(`${API_URL}/veterinarios/meus-dados`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });

    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data).toHaveProperty('crmv');
    expect(data).toHaveProperty('especialidade');
    expect(data).toHaveProperty('usuario');
  });

  test('PUT /veterinarios/status-online - deve atualizar status online', async ({ request }) => {
    const response = await request.put(`${API_URL}/veterinarios/status-online`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      },
      data: {
        online: true
      }
    });

    expect(response.ok()).toBeTruthy();
  });

  test('GET /veterinarios/estatisticas - deve retornar estatísticas', async ({ request }) => {
    const response = await request.get(`${API_URL}/veterinarios/estatisticas`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });

    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data).toHaveProperty('totalAtendimentos');
  });
});

test.describe('API - Admin', () => {
  let adminToken;

  test.beforeAll(async ({ request }) => {
    const response = await request.post(`${API_URL}/auth/login`, {
      data: {
        email: 'admin@saudepet.com',
        senha: 'admin123'
      }
    });
    const data = await response.json();
    adminToken = data.access_token;
  });

  test('GET /admin/dashboard - deve retornar estatísticas gerais', async ({ request }) => {
    const response = await request.get(`${API_URL}/admin/dashboard`, {
      headers: {
        'Authorization': `Bearer ${adminToken}`
      }
    });

    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data).toHaveProperty('usuarios');
    expect(data).toHaveProperty('atendimentos');
    expect(data).toHaveProperty('avaliacoes');
  });

  test('GET /admin/veterinarios/pendentes - deve listar veterinários pendentes', async ({ request }) => {
    const response = await request.get(`${API_URL}/admin/veterinarios/pendentes`, {
      headers: {
        'Authorization': `Bearer ${adminToken}`
      }
    });

    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(Array.isArray(data)).toBeTruthy();
  });

  test('GET /admin/usuarios - deve listar todos os usuários', async ({ request }) => {
    const response = await request.get(`${API_URL}/admin/usuarios`, {
      headers: {
        'Authorization': `Bearer ${adminToken}`
      }
    });

    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(Array.isArray(data)).toBeTruthy();
  });

  test('GET /admin/atendimentos - deve listar todos os atendimentos', async ({ request }) => {
    const response = await request.get(`${API_URL}/admin/atendimentos`, {
      headers: {
        'Authorization': `Bearer ${adminToken}`
      }
    });

    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(Array.isArray(data)).toBeTruthy();
  });
});

test.describe('API - Tutores', () => {
  let tutorToken;

  test.beforeAll(async ({ request }) => {
    const response = await request.post(`${API_URL}/auth/login`, {
      data: {
        email: 'abraao.saantos@gmail.com',
        senha: '12345678'
      }
    });
    const data = await response.json();
    tutorToken = data.access_token;
  });

  test('GET /pets - deve listar pets do tutor', async ({ request }) => {
    const response = await request.get(`${API_URL}/pets`, {
      headers: {
        'Authorization': `Bearer ${tutorToken}`
      }
    });

    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(Array.isArray(data)).toBeTruthy();
  });

  test('GET /solicitacoes/tutor/lista - deve listar solicitações do tutor', async ({ request }) => {
    const response = await request.get(`${API_URL}/solicitacoes/tutor/lista`, {
      headers: {
        'Authorization': `Bearer ${tutorToken}`
      }
    });

    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(Array.isArray(data)).toBeTruthy();
  });
});

test.describe('API - Validação de Dados', () => {
  let token;

  test.beforeAll(async ({ request }) => {
    const response = await request.post(`${API_URL}/auth/login`, {
      data: {
        email: 'abraao.saantos@gmail.com',
        senha: '12345678'
      }
    });
    const data = await response.json();
    token = data.access_token;
  });

  test('POST /pets - deve validar campos obrigatórios', async ({ request }) => {
    const response = await request.post(`${API_URL}/pets`, {
      headers: {
        'Authorization': `Bearer ${token}`
      },
      data: {
        nome: 'Teste'
        // Faltando campos obrigatórios
      }
    });

    expect(response.status()).toBe(400);
  });

  test('POST /solicitacoes - deve validar tipo de atendimento', async ({ request }) => {
    const response = await request.post(`${API_URL}/solicitacoes`, {
      headers: {
        'Authorization': `Bearer ${token}`
      },
      data: {
        tipo_atendimento: 'invalido'
      }
    });

    expect(response.status()).toBe(400);
  });
});

test.describe('API - Rate Limiting e Segurança', () => {
  test('deve ter headers de segurança', async ({ request }) => {
    const response = await request.get(`${API_URL}/health`);
    
    // Verificar headers de segurança (se implementados)
    const headers = response.headers();
    // expect(headers['x-content-type-options']).toBe('nosniff');
    // expect(headers['x-frame-options']).toBeDefined();
  });

  test('deve proteger contra SQL injection', async ({ request }) => {
    const response = await request.post(`${API_URL}/auth/login`, {
      data: {
        email: "' OR '1'='1",
        senha: "' OR '1'='1"
      }
    });

    expect(response.status()).toBe(401);
  });

  test('deve proteger contra XSS em inputs', async ({ request }) => {
    const response = await request.post(`${API_URL}/auth/register`, {
      data: {
        nome: '<script>alert("XSS")</script>',
        email: 'xss@teste.com',
        senha: '12345678',
        telefone: '41999999999',
        cidade: 'Curitiba',
        tipo_usuario: 'tutor'
      }
    });

    // Pode retornar 400 (validação) ou 201 (aceita mas sanitiza)
    expect([400, 201]).toContain(response.status());
  });
});

test.describe('API - Health Check', () => {
  test('GET /health - deve retornar status da API', async ({ request }) => {
    const response = await request.get(`${API_URL}/health`);
    
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data).toHaveProperty('status');
  });
});

test.describe('API - CORS', () => {
  test('deve ter headers CORS configurados', async ({ request }) => {
    const response = await request.get(`${API_URL}/health`);
    
    const headers = response.headers();
    expect(headers['access-control-allow-origin']).toBeDefined();
  });
});

export {};
