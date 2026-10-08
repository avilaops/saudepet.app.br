# 🧪 Script de Execução de Testes - Saúde Pet
# Facilita a execução dos testes E2E e de segurança

param(
    [Parameter(HelpMessage="Tipo de teste a executar")]
    [ValidateSet("all", "e2e", "api", "security", "auth", "tutor", "vet", "admin", "docker", "ui", "report")]
    [string]$Tipo = "all",
    
    [Parameter(HelpMessage="Browser para executar")]
    [ValidateSet("all", "chromium", "firefox", "webkit", "mobile")]
    [string]$Browser = "all",
    
    [Parameter(HelpMessage="Modo headed (ver navegador)")]
    [switch]$Headed,
    
    [Parameter(HelpMessage="Modo debug")]
    [switch]$Debug
)

Write-Host "`n🧪 SAÚDE PET - TESTE AUTOMATIZADO`n" -ForegroundColor Cyan

# Verificar se está no diretório correto
if (-not (Test-Path ".\package.json")) {
    Write-Host "❌ Erro: Execute este script de dentro do diretório 'tests'" -ForegroundColor Red
    Write-Host "   Navegue até: d:\Projetos\Android\Saude Pet\tests`n" -ForegroundColor Yellow
    exit 1
}

# Verificar se dependências estão instaladas
if (-not (Test-Path ".\node_modules")) {
    Write-Host "📦 Instalando dependências..." -ForegroundColor Yellow
    npm install
    
    Write-Host "🌐 Instalando browsers do Playwright..." -ForegroundColor Yellow
    npx playwright install
}

# Verificar se servidores estão rodando (para testes locais)
if ($Tipo -ne "docker") {
    Write-Host "🔍 Verificando servidores..." -ForegroundColor Cyan
    
    $backend = Test-NetConnection -ComputerName localhost -Port 3001 -InformationLevel Quiet -WarningAction SilentlyContinue
    $frontend = Test-NetConnection -ComputerName localhost -Port 5174 -InformationLevel Quiet -WarningAction SilentlyContinue
    
    if (-not $backend) {
        Write-Host "⚠️  Backend não está rodando na porta 3001" -ForegroundColor Yellow
        Write-Host "   Inicie com: cd app\backend && npm run dev`n" -ForegroundColor Gray
    }
    
    if (-not $frontend) {
        Write-Host "⚠️  Frontend não está rodando na porta 5174" -ForegroundColor Yellow
        Write-Host "   Inicie com: cd app\frontend && npm run dev`n" -ForegroundColor Gray
    }
    
    if (-not $backend -or -not $frontend) {
        $continuar = Read-Host "Continuar mesmo assim? (s/n)"
        if ($continuar -ne "s") {
            exit 0
        }
    }
}

# Construir comando
$comando = "npx playwright test"

# Aplicar filtros de tipo de teste
switch ($Tipo) {
    "e2e" { }
    "api" { $comando += " api.spec.ts" }
    "security" { $comando += " security.spec.ts" }
    "auth" { $comando += " auth.spec.ts" }
    "tutor" { $comando += " tutor.spec.ts" }
    "vet" { $comando += " veterinario.spec.ts" }
    "admin" { $comando += " admin.spec.ts" }
    "ui" { 
        Write-Host "🎭 Abrindo UI do Playwright..." -ForegroundColor Green
        npx playwright test --ui
        exit 0
    }
    "report" {
        Write-Host "📊 Abrindo relatório..." -ForegroundColor Green
        npx playwright show-report
        exit 0
    }
    "docker" {
        Write-Host "🐳 Executando testes no Docker..." -ForegroundColor Green
        docker-compose -f docker-compose.test.yml up --abort-on-container-exit
        Write-Host "`n🧹 Limpando containers..." -ForegroundColor Yellow
        docker-compose -f docker-compose.test.yml down -v
        exit 0
    }
}

# Aplicar filtros de browser
if ($Browser -ne "all") {
    $comando += " --project=$Browser"
}

# Aplicar modo headed
if ($Headed) {
    $comando += " --headed"
}

# Aplicar modo debug
if ($Debug) {
    Write-Host "🐛 Iniciando modo debug..." -ForegroundColor Magenta
    npx playwright test --debug
    exit 0
}

# Executar testes
Write-Host "🚀 Executando: $comando`n" -ForegroundColor Green
Invoke-Expression $comando

# Verificar resultado
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✅ Testes concluídos com sucesso!" -ForegroundColor Green
    Write-Host "📊 Ver relatório: npm run test:report`n" -ForegroundColor Cyan
} else {
    Write-Host "`n❌ Alguns testes falharam!" -ForegroundColor Red
    Write-Host "📊 Ver relatório: npm run test:report" -ForegroundColor Yellow
    Write-Host "🐛 Debug: npm run test:e2e:debug`n" -ForegroundColor Yellow
}

# Mostrar ajuda
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
Write-Host "💡 Exemplos de uso:" -ForegroundColor Cyan
Write-Host "   .\run-tests.ps1                    # Todos os testes" -ForegroundColor Gray
Write-Host "   .\run-tests.ps1 -Tipo api          # Apenas API" -ForegroundColor Gray
Write-Host "   .\run-tests.ps1 -Tipo e2e -Headed  # E2E com navegador visível" -ForegroundColor Gray
Write-Host "   .\run-tests.ps1 -Tipo ui           # Interface gráfica" -ForegroundColor Gray
Write-Host "   .\run-tests.ps1 -Debug             # Modo debug" -ForegroundColor Gray
Write-Host "   .\run-tests.ps1 -Tipo docker       # Testes no Docker`n" -ForegroundColor Gray
