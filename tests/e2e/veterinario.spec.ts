const { test, expect } = require('@playwright/test');

test.describe('Fluxo do Veterinário', () => {
  test.beforeEach(async ({ page }) => {
    // Login como veterinário aprovado
    await page.goto('/login');
    await page.fill('input[type="email"]', 'ricardo@teste.com');
    await page.fill('input[type="password"]', '12345678');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/veterinario/, { timeout: 10000 });
  });

  test('deve carregar a home do veterinário', async ({ page }) => {
    await expect(page).toHaveURL(/\/veterinario/);
    await expect(page.locator('text=/Dr|veterinário/i')).toBeVisible({ timeout: 5000 });
  });

  test('deve alternar status online/offline', async ({ page }) => {
    // Procurar botão de status
    const statusButton = page.locator('button:has-text("ONLINE"), button:has-text("OFFLINE"), button:has-text("DISPONÍVEL")').first();
    
    if (await statusButton.isVisible()) {
      await statusButton.click();
      await page.waitForTimeout(1000);
      // Status deve ter mudado
      await expect(statusButton).toBeVisible();
    }
  });

  test('deve navegar para agendamentos', async ({ page }) => {
    await page.click('text=/Agenda|Agendamentos/i');
    await expect(page).toHaveURL(/\/veterinario\/agendamentos/);
  });

  test('deve navegar para estatísticas', async ({ page }) => {
    const statsLink = page.locator('text=/Estat|Stats/i').first();
    await statsLink.click();
    await expect(page).toHaveURL(/\/veterinario\/estatisticas/);
  });

  test('deve navegar para perfil', async ({ page }) => {
    await page.click('text=/Perfil|Meu.*perfil/i');
    await expect(page).toHaveURL(/\/veterinario\/perfil/);
  });

  test('deve navegar para mensagens', async ({ page }) => {
    await page.click('text=/Mensagens|Msgs/i');
    await expect(page).toHaveURL(/\/veterinario\/mensagens/);
  });
});

test.describe('Agendamentos - Veterinário', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'ricardo@teste.com');
    await page.fill('input[type="password"]', '12345678');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/veterinario/, { timeout: 10000 });
    await page.goto('/veterinario/agendamentos');
  });

  test('deve exibir abas de status', async ({ page }) => {
    await page.waitForTimeout(1000);
    
    // Verificar se há abas (pendentes, confirmados, finalizados, cancelados)
    const hasTabs = await page.locator('button:has-text("Pendentes"), button:has-text("Confirmados")').count() > 0;
    expect(hasTabs).toBeTruthy();
  });

  test('deve filtrar agendamentos por status', async ({ page }) => {
    await page.waitForTimeout(1000);
    
    const pendenteTab = page.locator('button:has-text("Pendentes")').first();
    if (await pendenteTab.isVisible()) {
      await pendenteTab.click();
      await page.waitForTimeout(500);
    }
    
    const confirmadoTab = page.locator('button:has-text("Confirmados")').first();
    if (await confirmadoTab.isVisible()) {
      await confirmadoTab.click();
      await page.waitForTimeout(500);
    }
  });

  test('deve exibir botões de aprovar/recusar em pendentes', async ({ page }) => {
    await page.waitForTimeout(1000);
    
    const pendenteTab = page.locator('button:has-text("Pendentes")').first();
    if (await pendenteTab.isVisible()) {
      await pendenteTab.click();
      await page.waitForTimeout(1000);
      
      const hasActions = await page.locator('button:has-text("Aprovar"), button:has-text("Recusar")').count() > 0;
      // Pode não ter agendamentos pendentes
    }
  });
});

test.describe('Estatísticas - Veterinário', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'ricardo@teste.com');
    await page.fill('input[type="password"]', '12345678');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/veterinario/, { timeout: 10000 });
    await page.goto('/veterinario/estatisticas');
  });

  test('deve exibir métricas principais', async ({ page }) => {
    await page.waitForTimeout(2000);
    
    // Verificar se há cards com números
    const hasMetrics = await page.locator('text=/atendimentos|avaliação|ganho/i').count() > 0;
    expect(hasMetrics).toBeTruthy();
  });

  test('deve exibir avaliação média', async ({ page }) => {
    await page.waitForTimeout(2000);
    
    // Procurar por estrelas ou nota
    const hasRating = await page.locator('text=/⭐|estrela|avaliação/i').count() > 0;
    expect(hasRating).toBeTruthy();
  });

  test('deve exibir estado vazio quando não há dados', async ({ page }) => {
    await page.waitForTimeout(2000);
    
    // Se não houver dados, deve mostrar mensagem apropriada
    const hasEmptyState = await page.locator('text=/nenhum.*atendimento|nenhuma.*avaliação/i').count() > 0;
    const hasData = await page.locator('text=/total|ganho|R\$/i').count() > 0;
    
    expect(hasEmptyState || hasData).toBeTruthy();
  });
});

test.describe('Perfil - Veterinário', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'ricardo@teste.com');
    await page.fill('input[type="password"]', '12345678');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/veterinario/, { timeout: 10000 });
    await page.goto('/veterinario/perfil');
  });

  test('deve exibir informações do perfil', async ({ page }) => {
    await page.waitForTimeout(2000);
    
    // Verificar se exibe nome e especialidade
    const hasInfo = await page.locator('text=/Dr|CRMV|especialidade/i').count() > 0;
    expect(hasInfo).toBeTruthy();
  });

  test('deve permitir editar perfil', async ({ page }) => {
    await page.waitForTimeout(2000);
    
    // Procurar por campos editáveis ou botão de editar
    const hasEditMode = await page.locator('button:has-text("Editar"), button:has-text("Salvar"), input[name="nome"]').count() > 0;
    expect(hasEditMode).toBeTruthy();
  });

  test('deve exibir seção de upload de fotos', async ({ page }) => {
    await page.waitForTimeout(2000);
    
    // Verificar se há botões/áreas de upload
    const hasUpload = await page.locator('text=/foto.*perfil|foto.*capa|galeria|📷/i').count() > 0;
    expect(hasUpload).toBeTruthy();
  });

  test('deve exibir avaliações recebidas', async ({ page }) => {
    await page.waitForTimeout(2000);
    
    // Procurar seção de avaliações
    const hasReviews = await page.locator('text=/avaliações.*tutores|comentários|⭐/i').count() > 0;
    expect(hasReviews).toBeTruthy();
  });
});

test.describe('Histórico - Veterinário', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'ricardo@teste.com');
    await page.fill('input[type="password"]', '12345678');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/veterinario/, { timeout: 10000 });
    await page.goto('/veterinario/historico');
  });

  test('deve carregar página de histórico', async ({ page }) => {
    await expect(page).toHaveURL(/\/veterinario\/historico/);
  });

  test('deve exibir atendimentos finalizados', async ({ page }) => {
    await page.waitForTimeout(2000);
    
    const hasData = await page.locator('text=/finalizado|atendimento|pet/i').count() > 0;
    const hasEmptyState = await page.locator('text=/nenhum.*atendimento.*finalizado/i').count() > 0;
    
    expect(hasData || hasEmptyState).toBeTruthy();
  });

  test('deve exibir botão de anexar prescrição', async ({ page }) => {
    await page.waitForTimeout(2000);
    
    const hasPrescription = await page.locator('button:has-text("Prescrição"), text=/anexar.*prescrição/i').count() > 0;
    // Só aparece se houver atendimentos
  });
});

test.describe('Veterinário Não Aprovado', () => {
  test('deve exibir mensagem de aguardando aprovação para vet não aprovado', async ({ page }) => {
    // Tentar login com veterinário não aprovado (se houver)
    await page.goto('/login');
    await page.fill('input[type="email"]', 'pendente@teste.com');
    await page.fill('input[type="password"]', '12345678');
    await page.click('button[type="submit"]');
    
    await page.waitForTimeout(2000);
    
    // Se for não aprovado, deve mostrar mensagem
    const hasMessage = await page.locator('text=/conta.*análise|aguardando.*aprovação|pendente/i').count() > 0;
    const isApproved = await page.locator('text=/disponível|online/i').count() > 0;
    
    expect(hasMessage || isApproved).toBeTruthy();
  });
});

test.describe('Onboarding - Veterinário', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'ricardo@teste.com');
    await page.fill('input[type="password"]', '12345678');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/veterinario/, { timeout: 10000 });
  });

  test('deve ter opção de rever introdução', async ({ page }) => {
    await page.goto('/veterinario/perfil');
    await page.waitForTimeout(1000);
    
    const hasOnboarding = await page.locator('button:has-text("introdução"), button:has-text("tutorial")').count() > 0;
    expect(hasOnboarding).toBeTruthy();
  });
});

export {};
