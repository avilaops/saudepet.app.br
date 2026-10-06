# 🚀 Início Rápido - Testes Saúde Pet

## 1️⃣ Primeira Execução

### Instalar tudo de uma vez:

```powershell
cd "d:\Projetos\Android\Saude Pet\tests"
npm run install:all
```

## 2️⃣ Preparar Ambiente

### Iniciar servidores necessários:

**Terminal 1:**
```powershell
cd "d:\Projetos\Android\Saude Pet\app"
docker-compose up -d
```

**Terminal 2:**
```powershell
cd "d:\Projetos\Android\Saude Pet\app\backend"
npm run dev
```

**Terminal 3:**
```powershell
cd "d:\Projetos\Android\Saude Pet\app\frontend"
npm run dev
```

## 3️⃣ Executar Testes

### Modo Recomendado (Interface Gráfica):

```powershell
cd tests
npm run test:e2e:ui
```

### Todos os Testes:

```powershell
npm test
```

### Testes Específicos:

```powershell
# Apenas autenticação
npm run test:auth

# Apenas API
npm run test:api

# Apenas segurança
npm run test:security
```

## 4️⃣ Ver Resultados

```powershell
npm run test:report
```

## 📝 Comandos Úteis

| Comando | Descrição |
|---------|-----------|
| `npm test` | Executa todos os testes |
| `npm run test:e2e:ui` | Interface gráfica (recomendado) |
| `npm run test:e2e:headed` | Ver navegador durante testes |
| `npm run test:e2e:debug` | Modo debug passo a passo |
| `npm run test:docker` | Testes no Docker (isolado) |
| `npm run test:report` | Ver relatório HTML |

## 🐛 Problemas Comuns

### "Servidores não estão rodando"

**Solução:** Inicie os servidores conforme passo 2️⃣

### "playwright: command not found"

**Solução:**
```powershell
npm install
npx playwright install
```

### "Testes estão falhando"

**Verifique:**
1. Backend rodando em http://localhost:3001
2. Frontend rodando em http://localhost:5174
3. Banco de dados conectado

## 🆘 Precisa de Ajuda?

Ver documentação completa em: [README.md](README.md)
