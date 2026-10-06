Param(
  [string]$SSHKey = "C:\Users\nicol\.ssh\hetzner_avilaops",
  [string]$Server = "root@saudepet.app.br",
  [string]$RemoteDir = "/opt/saudepet"
)

$ErrorActionPreference = "Stop"

Write-Host "1. Building Frontend..."
Set-Location "$PSScriptRoot\..\frontend"
npm run build

Write-Host "2. Creating deployment archives..."
Set-Location "$PSScriptRoot\.."
if (Test-Path "backend_deploy.tar.gz") { Remove-Item "backend_deploy.tar.gz" }
if (Test-Path "frontend_deploy.tar.gz") { Remove-Item "frontend_deploy.tar.gz" }

tar -czf backend_deploy.tar.gz backend/src backend/prisma/schema.prisma backend/prisma/migrations backend/package.json backend/tsconfig.json
tar -czf frontend_deploy.tar.gz -C frontend/dist .

Write-Host "3. Uploading to VPS via SCP..."
scp -i $SSHKey backend_deploy.tar.gz frontend_deploy.tar.gz docker-compose.yml "${Server}:${RemoteDir}/"

Write-Host "4. Extracting and restarting containers on VPS..."
# prisma migrate deploy (nao db push) - aplica só as migrations versionadas e
# registra no historico. db push sincroniza direto sem migration, o que gerou
# um drift grande entre codigo e banco em sessoes anteriores.
$remoteCmd = "cd /opt/saudepet; tar -xzf backend_deploy.tar.gz; mkdir -p frontend/dist; tar -xzf frontend_deploy.tar.gz -C frontend/dist; cd backend && npm install; cd ..; docker compose up -d --build; docker compose exec -T backend npx prisma generate; docker compose exec -T backend npx prisma migrate deploy; docker compose restart backend web"
ssh -i $SSHKey $Server $remoteCmd

Write-Host "DEPLOY COMPLETED SUCCESSFULLY IN 1 STEP!"
