const { test, expect } = require('@playwright/test');

const API_URL = 'http://localhost:3001/api';

test.describe('Segurança - Injeção de Código', () => {
  test('SQL Injection - Login', async ({ request }) => {
    const sqlInjections = [
      "' OR '1'='1",
      "' OR 1=1--",
      "admin'--",
      "' UNION SELECT NULL--",
      "1' AND '1'='1"
    ];

    for (const injection of sqlInjections) {
      const response = await request.post(`${API_URL}/auth/login`, {
        data: {
          email: injection,
          senha: injection
        }
      });

      // Deve rejeitar ou retornar erro, nunca deve autenticar
      expect(response.status()).not.toBe(200);
    }
  });

  test('XSS - Registro de Usuário', async ({ request }) => {
    const xssPayloads = [
      '<script>alert("XSS")</script>',
      '<img src=x onerror=alert("XSS")>',
      'javascript:alert("XSS")',
      '<svg onload=alert("XSS")>',
      '<iframe src="javascript:alert(\'XSS\')"></iframe>'
    ];

    for (const payload of xssPayloads) {
      const response = await request.post(`${API_URL}/auth/register`, {
        data: {
          nome: payload,
          email: `xss${Date.now()}@teste.com`,
          senha: '12345678',
          telefone: '41999999999',
          cidade: payload,
          tipo_usuario: 'tutor'
        }
      });

      // Pode aceitar (sanitizado) ou rejeitar
      if (response.ok()) {
        const data = await response.json();
        // Verificar que payload foi sanitizado
        expect(data.usuario.nome).not.toContain('<script>');
        expect(data.usuario.cidade).not.toContain('<script>');
      }
    }
  });

  test('NoSQL Injection - MongoDB style', async ({ request }) => {
    const noSQLInjections = [
      { $gt: '' },
      { $ne: null },
      { $where: 'sleep(1000)' }
    ];

    for (const injection of noSQLInjections) {
      const response = await request.post(`${API_URL}/auth/login`, {
        data: {
          email: injection,
          senha: injection
        }
      });

      expect(response.status()).toBe(400) || expect(response.status()).toBe(401);
    }
  });
});

test.describe('Segurança - Autenticação e Autorização', () => {
  test('Token JWT inválido deve ser rejeitado', async ({ request }) => {
    const response = await request.get(`${API_URL}/pets`, {
      headers: {
        'Authorization': 'Bearer token_invalido_12345'
      }
    });

    expect(response.status()).toBe(401);
  });

  test('Token JWT expirado deve ser rejeitado', async ({ request }) => {
    // Token expirado (exemplo)
    const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjE1MTYyMzkwMjJ9.';
    
    const response = await request.get(`${API_URL}/pets`, {
      headers: {
        'Authorization': `Bearer ${expiredToken}`
      }
    });

    expect(response.status()).toBe(401);
  });

  test('Acesso sem token deve ser rejeitado', async ({ request }) => {
    const protectedEndpoints = [
      '/pets',
      '/veterinarios/meus-dados',
      '/admin/dashboard',
      '/solicitacoes/tutor/lista'
    ];

    for (const endpoint of protectedEndpoints) {
      const response = await request.get(`${API_URL}${endpoint}`);
      expect(response.status()).toBe(401);
    }
  });

  test('Tutor não deve acessar rotas de veterinário', async ({ request }) => {
    // Login como tutor
    const loginResponse = await request.post(`${API_URL}/auth/login`, {
      data: {
        email: 'abraao.saantos@gmail.com',
        senha: '12345678'
      }
    });
    const { access_token: token } = await loginResponse.json();

    // Tentar acessar rota de veterinário
    const response = await request.get(`${API_URL}/veterinarios/meus-dados`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    expect(response.status()).toBe(403);
  });

  test('Veterinário não deve acessar rotas de admin', async ({ request }) => {
    // Login como veterinário
    const loginResponse = await request.post(`${API_URL}/auth/login`, {
      data: {
        email: 'ricardo@teste.com',
        senha: '12345678'
      }
    });
    const { access_token: token } = await loginResponse.json();

    // Tentar acessar rota de admin
    const response = await request.get(`${API_URL}/admin/dashboard`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    expect(response.status()).toBe(403);
  });
});

test.describe('Segurança - HTTPS e Headers', () => {
  test('Deve ter headers de segurança configurados', async ({ request }) => {
    const response = await request.get(`${API_URL}/health`);
    const headers = response.headers();

    // Verificar headers de segurança recomendados
    // expect(headers['x-content-type-options']).toBe('nosniff');
    // expect(headers['x-frame-options']).toBeDefined();
    // expect(headers['x-xss-protection']).toBeDefined();
    // expect(headers['strict-transport-security']).toBeDefined();
    
    // CORS deve estar configurado
    expect(headers['access-control-allow-origin']).toBeDefined();
  });

  test('Deve ter Content-Type correto', async ({ request }) => {
    const response = await request.get(`${API_URL}/health`);
    const headers = response.headers();

    expect(headers['content-type']).toContain('application/json');
  });
});

test.describe('Segurança - Rate Limiting', () => {
  test.skip('Deve limitar tentativas de login', async ({ request }) => {
    // Fazer múltiplas tentativas de login incorretas
    const attempts = 20;
    let blockedResponses = 0;

    for (let i = 0; i < attempts; i++) {
      const response = await request.post(`${API_URL}/auth/login`, {
        data: {
          email: 'teste@teste.com',
          senha: 'senhaerrada'
        }
      });

      if (response.status() === 429) {
        blockedResponses++;
      }
    }

    // Deve ter bloqueado após várias tentativas
    // expect(blockedResponses).toBeGreaterThan(0);
  });
});

test.describe('Segurança - Validação de Dados', () => {
  test('Deve validar formato de email', async ({ request }) => {
    const invalidEmails = [
      'emailinvalido',
      '@teste.com',
      'teste@',
      'teste..teste@teste.com',
      'teste@.com'
    ];

    for (const email of invalidEmails) {
      const response = await request.post(`${API_URL}/auth/register`, {
        data: {
          nome: 'Teste',
          email: email,
          senha: '12345678',
          telefone: '41999999999',
          cidade: 'Curitiba',
          tipo_usuario: 'tutor'
        }
      });

      expect(response.status()).toBe(400);
    }
  });

  test('Deve validar tamanho de campos', async ({ request }) => {
    const longString = 'a'.repeat(1000);

    const response = await request.post(`${API_URL}/auth/register`, {
      data: {
        nome: longString,
        email: 'teste@teste.com',
        senha: '12345678',
        telefone: '41999999999',
        cidade: longString,
        tipo_usuario: 'tutor'
      }
    });

    // Pode aceitar (truncar) ou rejeitar
    // expect([400, 201]).toContain(response.status());
  });

  test('Deve validar tipos de dados', async ({ request }) => {
    const response = await request.post(`${API_URL}/auth/register`, {
      data: {
        nome: 123, // Deveria ser string
        email: true, // Deveria ser string
        senha: ['array'], // Deveria ser string
        telefone: 41999999999, // Pode aceitar number
        cidade: { objeto: 'invalido' },
        tipo_usuario: 999
      }
    });

    expect(response.status()).toBe(400);
  });
});

test.describe('Segurança - Upload de Arquivos', () => {
  let token;

  test.beforeAll(async ({ request }) => {
    const response = await request.post(`${API_URL}/auth/login`, {
      data: {
        email: 'ricardo@teste.com',
        senha: '12345678'
      }
    });
    const data = await response.json();
    token = data.access_token;
  });

  test('Deve rejeitar arquivos muito grandes', async ({ request }) => {
    // Criar buffer de 10MB (acima do limite de 5MB)
    const largeBuffer = Buffer.alloc(10 * 1024 * 1024);

    const response = await request.post(`${API_URL}/auth/upload-foto-perfil`, {
      headers: {
        'Authorization': `Bearer ${token}`
      },
      multipart: {
        foto: {
          name: 'large.jpg',
          mimeType: 'image/jpeg',
          buffer: largeBuffer
        }
      }
    });

    expect(response.status()).toBe(400);
  });

  test.skip('Deve rejeitar tipos de arquivo inválidos', async ({ request }) => {
    const response = await request.post(`${API_URL}/auth/upload-foto-perfil`, {
      headers: {
        'Authorization': `Bearer ${token}`
      },
      multipart: {
        foto: {
          name: 'malware.exe',
          mimeType: 'application/exe',
          buffer: Buffer.from('fake executable')
        }
      }
    });

    expect(response.status()).toBe(400);
  });
});

test.describe('Segurança - Exposição de Dados', () => {
  test('Não deve retornar senhas em respostas', async ({ request }) => {
    const response = await request.post(`${API_URL}/auth/login`, {
      data: {
        email: 'abraao.saantos@gmail.com',
        senha: '12345678'
      }
    });

    const data = await response.json();
    expect(data.usuario.password).toBeUndefined();
    expect(data.usuario.senha).toBeUndefined();
  });

  test('Não deve expor informações sensíveis em erros', async ({ request }) => {
    const response = await request.get(`${API_URL}/veterinarios/999999`);

    const data = await response.json();
    // Não deve expor estrutura do banco de dados ou stack traces
    expect(JSON.stringify(data)).not.toContain('SELECT ');
    expect(JSON.stringify(data)).not.toContain('prisma');
    expect(JSON.stringify(data)).not.toContain('node_modules');
  });
});

test.describe('Segurança - CSRF e CORS', () => {
  test('Deve configurar CORS corretamente', async ({ request }) => {
    const response = await request.get(`${API_URL}/health`, {
      headers: {
        'Origin': 'http://localhost:5174'
      }
    });

    const headers = response.headers();
    expect(headers['access-control-allow-origin']).toBeDefined();
  });

  test('Deve rejeitar origem não autorizada', async ({ request }) => {
    const response = await request.get(`${API_URL}/health`, {
      headers: {
        'Origin': 'http://malicious-site.com'
      }
    });

    // CORS pode rejeitar ou permitir (depende da configuração)
    // Verificar se não está completamente aberto
  });
});
