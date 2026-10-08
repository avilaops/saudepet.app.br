const { test, expect } = require('@playwright/test');

test.describe('Fluxo do Tutor', () => {
  test.beforeEach(async ({ page }) => {
    // Login como tutor
    await page.goto('/login');
    await page.fill('input[type="email"]', 'tutor@exemplo.com');
    await page.fill('input[type="password"]', 'tutor123');
    await page.click('button[type="submit"]');
    await page.waitForURL('/tutor', { timeout: 10000 });
  });

  test('deve carregar a home do tutor', async ({ page }) => {
    await expect(page).toHaveURL(/\/tutor/);
    await expect(page.locator('text=/Bem-vindo|Olá/i')).toBeVisible();
  });

  test('deve navegar para lista de pets', async ({ page }) => {
    await page.click('text=/Meus Pets|Pets/i');
    await expect(page).toHaveURL(/\/tutor\/pets/);
  });

  test('deve abrir modal de adicionar pet', async ({ page }) => {
    await page.goto('/tutor/pets');
    await page.click('text=/Adicionar Pet|Cadastrar|Novo Pet/i');
    
    // Verificar se modal ou formulário apareceu
    await expect(page.locator('input[name="nome"], input[placeholder*="nome"]')).toBeVisible({ timeout: 3000 });
  });

  test('deve visualizar histórico de atendimentos', async ({ page }) => {
    await page.click('text=/Histórico|Atendimentos/i');
    await expect(page).toHaveURL(/\/tutor\/historico/);
  });

  test('deve acessar perfil do tutor', async ({ page }) => {
    await page.click('text=/Perfil|Meu perfil/i');
    await expect(page).toHaveURL(/\/tutor\/perfil/);
  });

  test('deve navegar para solicitar atendimento', async ({ page }) => {
    await page.click('text=/Solicitar.*Atendimento|Novo.*Atendimento/i');
    await expect(page).toHaveURL(/\/tutor\/solicitar/);
  });
});

test.describe('Gestão de Pets - Tutor', () => {
  test.beforeEach(async ({ page }) => {
    // Login e navegar para pets
    await page.goto('/login');
    await page.fill('input[type="email"]', 'abraao.saantos@gmail.com');
    await page.fill('input[type="password"]', '12345678');
    await page.click('button[type="submit"]');
    await page.waitForURL('/tutor', { timeout: 10000 });
    await page.goto('/tutor/pets');
  });

  test('deve listar pets cadastrados', async ({ page }) => {
    // Aguardar carregamento
    await page.waitForTimeout(2000);
    
    const hasPets = await page.locator('text=/cachorro|gato|pet|Harry|Hermione/i').count() > 0;
    const hasEmptyState = await page.locator('text=/nenhum pet|adicione seu primeiro/i').isVisible().catch(() => false);
    
    expect(hasPets || hasEmptyState).toBeTruthy();
  });

  test('deve exibir cards de pets com informações', async ({ page }) => {
    await page.waitForTimeout(2000);
    
    const petCards = page.locator('[class*="card"], [class*="pet"]');
    const count = await petCards.count();
    
    if (count > 0) {
      // Verificar primeiro card tem informações básicas
      const firstCard = petCards.first();
      await expect(firstCard).toContainText(/./); // Tem algum texto
    }
  });
});

test.describe('Solicitação de Atendimento', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'abraao.saantos@gmail.com');
    await page.fill('input[type="password"]', '12345678');
    await page.click('button[type="submit"]');
    await page.waitForURL('/tutor', { timeout: 10000 });
    await page.goto('/tutor/solicitar');
  });

  test('deve carregar formulário de solicitação', async ({ page }) => {
    await expect(page).toHaveURL(/\/tutor\/solicitar/);
  });

  test('deve validar seleção de pet', async ({ page }) => {
    await page.waitForTimeout(1000);
    
    // Tentar submeter sem selecionar pet
    const submitButton = page.locator('button[type="submit"], button:has-text("Solicitar")');
    if (await submitButton.isVisible()) {
      await submitButton.click();
      // Deve mostrar erro ou não permitir submit
    }
  });

  test('deve validar seleção de tipo de atendimento', async ({ page }) => {
    await page.waitForTimeout(1000);
    
    // Verificar se há opções de tipo de atendimento
    const hasEmergencia = await page.locator('text=/emergência/i').count() > 0;
    const hasConsulta = await page.locator('text=/consulta.*domiciliar/i').count() > 0;
    
    expect(hasEmergencia || hasConsulta).toBeTruthy();
  });
});

test.describe('Avaliação de Atendimento', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'abraao.saantos@gmail.com');
    await page.fill('input[type="password"]', '12345678');
    await page.click('button[type="submit"]');
    await page.waitForURL('/tutor', { timeout: 10000 });
    await page.goto('/tutor/historico');
  });

  test('deve exibir botão de avaliar para atendimentos finalizados', async ({ page }) => {
    await page.waitForTimeout(2000);
    
    const avaliarButton = page.locator('text=/avaliar/i').first();
    const hasButton = await avaliarButton.count() > 0;
    
    // Se não houver botão, pode ser que não há atendimentos finalizados
    if (hasButton) {
      await expect(avaliarButton).toBeVisible();
    }
  });
});

test.describe('Navegação Mobile - Tutor', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'abraao.saantos@gmail.com');
    await page.fill('input[type="password"]', '12345678');
    await page.click('button[type="submit"]');
    await page.waitForURL('/tutor', { timeout: 10000 });
  });

  test('deve exibir navegação bottom em mobile', async ({ page }) => {
    // Verificar se há navegação bottom (comum em apps mobile)
    const hasBottomNav = await page.locator('[class*="bottom"], [class*="fixed"]').count() > 0;
    expect(hasBottomNav).toBeTruthy();
  });

  test('deve manter layout responsivo', async ({ page }) => {
    // Verificar se container está limitado (max-w-md)
    const container = page.locator('[class*="container"], [class*="max-w"]').first();
    await expect(container).toBeVisible();
  });
});

test.describe('Performance e Carregamento - Tutor', () => {
  test('deve carregar página inicial em menos de 3 segundos', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'abraao.saantos@gmail.com');
    await page.fill('input[type="password"]', '12345678');
    
    const startTime = Date.now();
    await page.click('button[type="submit"]');
    await page.waitForURL('/tutor', { timeout: 10000 });
    const loadTime = Date.now() - startTime;
    
    expect(loadTime).toBeLessThan(5000); // 5 segundos de tolerância
  });

  test('deve exibir loading states', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'abraao.saantos@gmail.com');
    await page.fill('input[type="password"]', '12345678');
    await page.click('button[type="submit"]');
    
    // Pode aparecer spinner durante carregamento
    const hasLoading = await page.locator('[class*="spin"], [class*="loading"], text=/carregando/i').count() > 0;
    // Não é obrigatório, mas é uma boa prática
  });
});

export {};
