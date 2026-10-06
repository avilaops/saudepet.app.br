# 📦 Script de Instalação Completa - Testes Saúde Pet
# Execute este script para configurar todo o ambiente de testes

Write-Host "🚀 Instalando ambiente de testes Saúde Pet..." -ForegroundColor Cyan
Write-Host ""

# Navegar para o diretório de testes
$testsDir = "d:\Projetos\Android\Saude Pet\tests"
Set-Location $testsDir

Write-Host "📦 1/4: Instalando dependências do NPM..." -ForegroundColor Yellow
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Erro ao instalar dependências NPM" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Dependências NPM instaladas com sucesso" -ForegroundColor Green
Write-Host ""

Write-Host "🌐 2/4: Instalando navegadores Playwright..." -ForegroundColor Yellow
npx playwright install chromium firefox webkit
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Erro ao instalar navegadores" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Navegadores instalados com sucesso" -ForegroundColor Green
Write-Host ""

Write-Host "🔧 3/4: Criando arquivo de configuração .env..." -ForegroundColor Yellow
if (!(Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "✅ Arquivo .env criado a partir do .env.example" -ForegroundColor Green
} else {
    Write-Host "ℹ️  Arquivo .env já existe, mantendo configuração atual" -ForegroundColor Cyan
}
Write-Host ""

Write-Host "📋 4/4: Verificando instalação..." -ForegroundColor Yellow
Write-Host "   - Node version:" (node --version)
Write-Host "   - NPM version:" (npm --version)
Write-Host "   - Playwright version:" (npx playwright --version)
Write-Host ""

Write-Host "🎉 Instalação concluída com sucesso!" -ForegroundColor Green
Write-Host ""
Write-Host "📝 Próximos passos:" -ForegroundColor Cyan
Write-Host "   1. Iniciar os servidores (backend e frontend)"
Write-Host "   2. Executar testes: npm test"
Write-Host "   3. Ver interface gráfica: npm run test:e2e:ui"
Write-Host ""
Write-Host "💡 Dica: Execute '.\run-tests.ps1 -Tipo all' para rodar todos os testes" -ForegroundColor Yellow
Write-Host ""
