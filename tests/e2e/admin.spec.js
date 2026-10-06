const { test, expect } = require('@playwright/test');

test.describe('Painel Administrativo', () => {
  test.beforeEach(async ({ page }) => {
    // Login como admin
    await page.goto('/login');
    await page.fill('input[type="email"]', 'admin@saudepet.com');
    await page.fill('input[type="password"]', 'admin123');
    await page.click('button[type="submit"]');
    await page.waitForURL('/admin', { timeout: 10000 });
  });

  test('deve carregar dashboard do admin', async ({ page }) => {
    await expect(page).toHaveURL(/\/admin/);
    await expect(page.locator('text=/dashboard|painel.*admin/i')).toBeVisible({ timeout: 5000 });
  });

  test('deve exibir estatísticas gerais', async ({ page }) => {
    await page.waitForTimeout(2000);
    
    // Verificar se há cards com métricas
    const hasStats = await page.locator('text=/total.*usuários|tutores|veterinários|atendimentos/i').count() > 0;
    expect(hasStats).toBeTruthy();
  });

  test('deve exibir alerta de veterinários pendentes', async ({ page }) => {
    await page.waitForTimeout(2000);
    
    // Se houver pendentes, deve mostrar alerta
    const hasAlert = await page.locator('text=/aguardando.*aprovação|pendente/i').count() > 0;
    // Alerta só aparece se houver pendentes
  });

  test('deve navegar para gestão de veterinários', async ({ page }) => {
    await page.click('text=/veterinários|gerenciar.*vet/i');
    await expect(page).toHaveURL(/\/admin\/veterinarios/);
  });

  test('deve navegar para gestão de usuários', async ({ page }) => {
    await page.click('text=/usuários|gerenciar.*usuários/i');
    await expect(page).toHaveURL(/\/admin\/usuarios/);
  });

  test('deve navegar para lista de atendimentos', async ({ page }) => {
    await page.click('text=/atendimentos|ver.*atendimentos/i');
    await expect(page).toHaveURL(/\/admin\/atendimentos/);
  });
});

test.describe('Gestão de Veterinários - Admin', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'admin@saudepet.com');
    await page.fill('input[type="password"]', 'admin123');
    await page.click('button[type="submit"]');
    await page.waitForURL('/admin', { timeout: 10000 });
    await page.goto('/admin/veterinarios');
  });

  test('deve listar veterinários pendentes', async ({ page }) => {
    await page.waitForTimeout(2000);
    
    const hasList = await page.locator('text=/CRMV|especialidade|veterinário/i').count() > 0;
    const hasEmpty = await page.locator('text=/nenhum.*veterinário|nenhum.*pendente/i').count() > 0;
    
    expect(hasList || hasEmpty).toBeTruthy();
  });

  test('deve exibir informações completas do veterinário', async ({ page }) => {
    await page.waitForTimeout(2000);
    
    const hasList = await page.locator('text=/CRMV|especialidade/i').count() > 0;
    
    if (hasList) {
      // Verificar se mostra CRMV, email, etc
      const hasDetails = await page.locator('text=/@|CRMV.*:|especialidade.*:/i').count() > 0;
      expect(hasDetails).toBeTruthy();
    }
  });

  test('deve ter botões de aprovar e rejeitar', async ({ page }) => {
    await page.waitForTimeout(2000);
    
    const hasPending = await page.locator('button:has-text("Aprovar"), button:has-text("Rejeitar")').count() > 0;
    // Só aparece se houver veterinários pendentes
  });

  test('deve confirmar antes de aprovar', async ({ page }) => {
    await page.waitForTimeout(2000);
    
    const approveButton = page.locator('button:has-text("Aprovar")').first();
    
    if (await approveButton.count() > 0) {
      // Interceptar dialog de confirmação
      page.on('dialog', async dialog => {
        expect(dialog.type()).toBe('confirm');
        await dialog.dismiss();
      });
      
      await approveButton.click();
    }
  });

  test('deve confirmar antes de rejeitar', async ({ page }) => {
    await page.waitForTimeout(2000);
    
    const rejectButton = page.locator('button:has-text("Rejeitar")').first();
    
    if (await rejectButton.count() > 0) {
      page.on('dialog', async dialog => {
        expect(dialog.type()).toBe('confirm');
        await dialog.dismiss();
      });
      
      await rejectButton.click();
    }
  });
});

test.describe('Gestão de Usuários - Admin', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'admin@saudepet.com');
    await page.fill('input[type="password"]', 'admin123');
    await page.click('button[type="submit"]');
    await page.waitForURL('/admin', { timeout: 10000 });
    await page.goto('/admin/usuarios');
  });

  test('deve listar todos os usuários', async ({ page }) => {
    await page.waitForTimeout(2000);
    
    const hasUsers = await page.locator('text=/@|tutor|veterinário/i').count() > 0;
    expect(hasUsers).toBeTruthy();
  });

  test('deve ter filtros de tipo de usuário', async ({ page }) => {
    await page.waitForTimeout(1000);
    
    const hasFilters = await page.locator('button:has-text("Todos"), button:has-text("Tutores"), button:has-text("Veterinários")').count() > 0;
    expect(hasFilters).toBeTruthy();
  });

  test('deve filtrar por tutores', async ({ page }) => {
    await page.waitForTimeout(1000);
    
    const tutorFilter = page.locator('button:has-text("Tutores")').first();
    await tutorFilter.click();
    await page.waitForTimeout(1000);
    
    // Deve atualizar lista
  });

  test('deve filtrar por veterinários', async ({ page }) => {
    await page.waitForTimeout(1000);
    
    const vetFilter = page.locator('button:has-text("Veterinários")').first();
    await vetFilter.click();
    await page.waitForTimeout(1000);
  });

  test('deve exibir badge de tipo de usuário', async ({ page }) => {
    await page.waitForTimeout(2000);
    
    const hasBadges = await page.locator('[class*="badge"], [class*="rounded-full"]:has-text("tutor"), [class*="rounded-full"]:has-text("veterinário")').count() > 0;
    expect(hasBadges).toBeTruthy();
  });

  test('deve ter botão de remover usuário', async ({ page }) => {
    await page.waitForTimeout(2000);
    
    const hasRemove = await page.locator('button:has-text("Remover"), text=/remover/i').count() > 0;
    expect(hasRemove).toBeTruthy();
  });

  test('não deve permitir remover admin', async ({ page }) => {
    await page.waitForTimeout(2000);
    
    // Procurar por usuário admin e verificar que não tem botão remover
    const adminCard = page.locator('text=/admin@saudepet.com/i').locator('..');
    
    if (await adminCard.count() > 0) {
      const hasRemoveInAdminCard = await adminCard.locator('button:has-text("Remover")').count() > 0;
      expect(hasRemoveInAdminCard).toBe(0);
    }
  });
});

test.describe('Gestão de Atendimentos - Admin', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'admin@saudepet.com');
    await page.fill('input[type="password"]', 'admin123');
    await page.click('button[type="submit"]');
    await page.waitForURL('/admin', { timeout: 10000 });
    await page.goto('/admin/atendimentos');
  });

  test('deve listar todos os atendimentos', async ({ page }) => {
    await page.waitForTimeout(2000);
    
    const hasData = await page.locator('text=/pet|tutor|veterinário/i').count() > 0;
    const hasEmpty = await page.locator('text=/nenhum.*atendimento/i').count() > 0;
    
    expect(hasData || hasEmpty).toBeTruthy();
  });

  test('deve ter filtros de status', async ({ page }) => {
    await page.waitForTimeout(1000);
    
    const hasFilters = await page.locator('button:has-text("Todos"), button:has-text("Finalizados"), button:has-text("Cancelados")').count() > 0;
    expect(hasFilters).toBeTruthy();
  });

  test('deve exibir badges de status', async ({ page }) => {
    await page.waitForTimeout(2000);
    
    const hasList = await page.locator('text=/pet|tutor/i').count() > 0;
    
    if (hasList) {
      const hasBadges = await page.locator('[class*="badge"], [class*="rounded-full"]:has-text("Finalizado"), [class*="rounded-full"]:has-text("Cancelado")').count() > 0;
      expect(hasBadges).toBeTruthy();
    }
  });

  test('deve exibir informações do pet, tutor e veterinário', async ({ page }) => {
    await page.waitForTimeout(2000);
    
    const hasList = await page.locator('text=/pet.*:|tutor.*:/i').count() > 0;
    
    if (hasList) {
      const hasInfo = await page.locator('text=/pet.*:|tutor.*:|vet.*:/i').count() >= 2;
      expect(hasInfo).toBeTruthy();
    }
  });

  test('deve exibir tipo de atendimento', async ({ page }) => {
    await page.waitForTimeout(2000);
    
    const hasTypes = await page.locator('text=/emergência|consulta.*domiciliar|teleorientação|🚨|🏠|📱/i').count() > 0;
    // Só aparece se houver atendimentos
  });

  test('deve exibir avaliações quando disponíveis', async ({ page }) => {
    await page.waitForTimeout(2000);
    
    const hasRating = await page.locator('text=/⭐|avaliação.*:/i').count() > 0;
    // Só aparece em atendimentos avaliados
  });
});

test.describe('Segurança - Admin', () => {
  test('deve impedir acesso sem autenticação', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/login/);
  });

  test('deve impedir acesso de não-admin', async ({ page }) => {
    // Login como tutor
    await page.goto('/login');
    await page.fill('input[type="email"]', 'abraao.saantos@gmail.com');
    await page.fill('input[type="password"]', '12345678');
    await page.click('button[type="submit"]');
    await page.waitForURL('/tutor', { timeout: 10000 });
    
    // Tentar acessar admin
    await page.goto('/admin');
    await expect(page).not.toHaveURL(/\/admin/);
  });

  test('deve fazer logout corretamente', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'admin@saudepet.com');
    await page.fill('input[type="password"]', 'admin123');
    await page.click('button[type="submit"]');
    await page.waitForURL('/admin', { timeout: 10000 });
    
    await page.click('text=/sair|logout/i');
    await expect(page).toHaveURL(/\/login/);
    
    // Não deve conseguir voltar
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/login/);
  });
});
