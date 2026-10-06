const { test, expect } = require('@playwright/test');

test.describe('Autenticação', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('deve carregar a página de login', async ({ page }) => {
    await expect(page).toHaveTitle(/Saúde Pet/i);
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test('deve mostrar erro com credenciais inválidas', async ({ page }) => {
    await page.fill('input[type="email"]', 'invalido@teste.com');
    await page.fill('input[type="password"]', 'senhaerrada');
    await page.click('button[type="submit"]');
    
    await expect(page.locator('text=/credenciais inválidas/i')).toBeVisible({ timeout: 5000 });
  });

  test('deve fazer login como tutor com sucesso', async ({ page }) => {
    await page.fill('input[type="email"]', 'abraao.saantos@gmail.com');
    await page.fill('input[type="password"]', '12345678');
    await page.click('button[type="submit"]');
    
    // Aguardar redirecionamento
    await page.waitForURL('/tutor', { timeout: 10000 });
    await expect(page).toHaveURL(/\/tutor/);
  });

  test('deve fazer login como veterinário com sucesso', async ({ page }) => {
    await page.fill('input[type="email"]', 'ricardo@teste.com');
    await page.fill('input[type="password"]', '12345678');
    await page.click('button[type="submit"]');
    
    // Aguardar redirecionamento
    await page.waitForURL(/\/veterinario/, { timeout: 10000 });
    await expect(page).toHaveURL(/\/veterinario/);
  });

  test('deve fazer login como admin com sucesso', async ({ page }) => {
    await page.fill('input[type="email"]', 'admin@saudepet.com');
    await page.fill('input[type="password"]', 'admin123');
    await page.click('button[type="submit"]');
    
    // Aguardar redirecionamento
    await page.waitForURL('/admin', { timeout: 10000 });
    await expect(page).toHaveURL(/\/admin/);
  });

  test('deve validar campos obrigatórios', async ({ page }) => {
    await page.click('button[type="submit"]');
    
    // HTML5 validation should prevent submission
    const emailInput = page.locator('input[type="email"]');
    await expect(emailInput).toHaveAttribute('required');
  });

  test('deve navegar para registro', async ({ page }) => {
    await page.click('text=/Criar conta|Cadastre-se/i');
    await expect(page).toHaveURL(/\/register/);
  });
});

test.describe('Registro', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/register');
  });

  test('deve carregar a página de registro', async ({ page }) => {
    await expect(page.locator('input[name="nome"]')).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test('deve validar senhas diferentes', async ({ page }) => {
    await page.fill('input[name="nome"]', 'Teste Usuario');
    await page.fill('input[type="email"]', 'novo@teste.com');
    await page.fill('input[type="tel"]', '41999999999');
    await page.fill('input[name="cidade"]', 'Curitiba');
    
    const senhaInputs = await page.locator('input[type="password"]').all();
    await senhaInputs[0].fill('senha123');
    await senhaInputs[1].fill('senha456');
    
    await page.click('button[type="submit"]');
    
    await expect(page.locator('text=/senhas.*diferentes|senhas.*não.*correspondem/i')).toBeVisible({ timeout: 3000 });
  });

  test('deve validar tamanho mínimo da senha', async ({ page }) => {
    await page.fill('input[name="nome"]', 'Teste Usuario');
    await page.fill('input[type="email"]', 'novo@teste.com');
    await page.fill('input[type="tel"]', '41999999999');
    await page.fill('input[name="cidade"]', 'Curitiba');
    
    const senhaInputs = await page.locator('input[type="password"]').all();
    await senhaInputs[0].fill('123');
    await senhaInputs[1].fill('123');
    
    await page.click('button[type="submit"]');
    
    await expect(page.locator('text=/senha.*mínimo|senha.*caracteres/i')).toBeVisible({ timeout: 3000 });
  });
});

test.describe('Proteção de Rotas', () => {
  test('deve redirecionar para login ao acessar rota protegida sem autenticação', async ({ page }) => {
    await page.goto('/tutor');
    await expect(page).toHaveURL(/\/login/);
    
    await page.goto('/veterinario');
    await expect(page).toHaveURL(/\/login/);
    
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/login/);
  });

  test('deve impedir acesso de tutor a rotas de veterinário', async ({ page }) => {
    // Login como tutor
    await page.goto('/login');
    await page.fill('input[type="email"]', 'abraao.saantos@gmail.com');
    await page.fill('input[type="password"]', '12345678');
    await page.click('button[type="submit"]');
    await page.waitForURL('/tutor', { timeout: 10000 });
    
    // Tentar acessar rota de veterinário
    await page.goto('/veterinario/home');
    await expect(page).not.toHaveURL(/\/veterinario/);
  });

  test('deve impedir acesso de veterinário a rotas de admin', async ({ page }) => {
    // Login como veterinário
    await page.goto('/login');
    await page.fill('input[type="email"]', 'ricardo@teste.com');
    await page.fill('input[type="password"]', '12345678');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/veterinario/, { timeout: 10000 });
    
    // Tentar acessar rota de admin
    await page.goto('/admin');
    await expect(page).not.toHaveURL(/\/admin/);
  });
});

test.describe('Logout', () => {
  test('deve fazer logout com sucesso', async ({ page }) => {
    // Login
    await page.goto('/login');
    await page.fill('input[type="email"]', 'abraao.saantos@gmail.com');
    await page.fill('input[type="password"]', '12345678');
    await page.click('button[type="submit"]');
    await page.waitForURL('/tutor', { timeout: 10000 });
    
    // Logout
    await page.click('text=/Sair|Logout/i');
    await expect(page).toHaveURL(/\/login/);
    
    // Tentar acessar rota protegida deve redirecionar
    await page.goto('/tutor');
    await expect(page).toHaveURL(/\/login/);
  });
});
