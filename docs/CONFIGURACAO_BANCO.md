# 🎯 Configuração do Banco de Dados - Saúde Pet

## 📊 Banco local (desenvolvimento e teste)

Sobe com um comando, a partir da raiz do repositório:

```bash
docker compose -f docker-compose.dev-db.yml up -d
```

| | Desenvolvimento | Teste |
| --- | --- | --- |
| Host | localhost | localhost |
| **Porta** | **5445** | **5445** |
| Database | `saudepet` | `saudepet_test` |
| Usuário / senha | `postgres` / `postgres` | `postgres` / `postgres` |

```
DATABASE_URL="postgresql://postgres:postgres@localhost:5445/saudepet"
```

Depois de subir pela primeira vez, criar o esquema nos dois:

```bash
cd backend
DATABASE_URL="postgresql://postgres:postgres@localhost:5445/saudepet"      npx prisma migrate deploy
DATABASE_URL="postgresql://postgres:postgres@localhost:5445/saudepet_test" npx prisma migrate deploy
```

A suíte (`npm test`, dentro de `backend/`) já aponta para o banco de teste por
padrão, `DATABASE_URL` no ambiente continua vencendo, se quiser apontar para
outro lugar.

### ⚠️ Por que 5445 e não 5432

A porta 5432 desta máquina é disputada por três coisas ao mesmo tempo: o cluster
nativo `postgresql-x64-18`, o container `avila_erp_postgres` (de outro projeto) e
o `odoo-db-1`. Quando o cluster nativo parou, o ERP assumiu a 5432, e aí todo
`postgresql://postgres:postgres@localhost:5432/...` do Saúde Pet passou a bater
num banco de outro projeto, falhando com `password authentication failed`. O
sintoma parece senha errada; a causa é servidor errado.

Por isso o banco do Saúde Pet não disputa mais essa porta.

### 🔧 Recuperar o cluster nativo (opcional, precisa de administrador)

O cluster do PostgreSQL 18 continua no disco, parado e sem porta:

- Serviço: `postgresql-x64-18` (Parado, inicialização Automática)
- Dados: `C:\Program Files\PostgreSQL\18\data` - **1,2 GB, 23 bancos**
- `postgresql.conf` ainda pede `port = 5432`, que está ocupada

Para trazê-lo de volta sem brigar com o ERP, num PowerShell **como
administrador**:

```powershell
# 1. Muda a porta do cluster nativo para uma livre
$conf = "C:\Program Files\PostgreSQL\18\data\postgresql.conf"
Copy-Item $conf "$conf.bak"
(Get-Content $conf -Raw) -replace "(?m)^\s*port\s*=\s*5432", "port = 5442" | Set-Content $conf -NoNewline

# 2. Sobe o serviço
Start-Service postgresql-x64-18

# 3. Confere o que sobreviveu
psql -h localhost -p 5442 -U postgres -c "\l"
```

Se os bancos `saudepet` / `saudepet_test` estiverem lá com os dados antigos, dá
para trazê-los para o container com `pg_dump` na 5442 e `psql` na 5445.

---

## 🗂️ Estrutura do Banco de Dados

### Tabelas Criadas

1. **usuarios** - Armazena todos os usuários (tutores, veterinários, admins)
2. **pets** - Informações dos animais de estimação
3. **veterinarios** - Dados adicionais dos veterinários (CRMV, especialidade)
4. **solicitacoes** - Pedidos de atendimento e histórico
5. **avaliacoes** - Avaliações dos atendimentos
6. **_prisma_migrations** - Controle de migrations do Prisma

---

## 👤 Contas de Teste Criadas

### 👨‍💼 ADMINISTRADOR
- **Email:** admin@saudepet.com
- **Senha:** admin123
- **Tipo:** admin
- **Acesso:** Painel administrativo completo

### 👤 TUTOR (Exemplo)
- **Email:** tutor@exemplo.com
- **Senha:** tutor123
- **Tipo:** tutor
- **Pet:** Rex (Labrador, 5 anos, 30.5kg)
- **Acesso:** Solicitar atendimentos, gerenciar pets

### 🏥 VETERINÁRIO (Exemplo)
- **Email:** vet@exemplo.com
- **Senha:** vet123
- **Tipo:** veterinario
- **CRMV:** SP-12345
- **Especialidade:** Clínica Geral
- **Status:** ✅ Aprovado pelo Admin
- **Acesso:** Receber solicitações, atender pacientes

---

## 🚀 Como Usar

### Testar a API
```bash
curl http://localhost:3000/api/health
```

### Acessar Frontend
```
http://localhost:5173
```

### Fazer Login
Use qualquer uma das contas acima para testar o sistema completo.

---

## 🔧 Comandos Úteis

### Ver Tabelas no Banco
```bash
docker exec -it avilaops-postgres psql -U avilaops_admin -d saude_pet -c "\dt"
```

### Ver Usuários Cadastrados
```bash
docker exec -it avilaops-postgres psql -U avilaops_admin -d saude_pet -c "SELECT nome, email, tipo_usuario FROM usuarios;"
```

### Resetar Banco de Dados
```bash
cd backend
npx prisma migrate reset
node prisma/seed.js
```

### Criar Nova Migration
```bash
cd backend
npx prisma migrate dev --name nome_da_migration
```

---

## 📝 Próximos Passos

1. ✅ Backend rodando (porta 3000)
2. ✅ Frontend rodando (porta 5173)
3. ✅ Banco de dados configurado
4. ✅ Dados de teste criados
5. 🎯 **Pronto para usar!**

### Para Testar o Sistema Completo:

1. Acesse http://localhost:5173
2. Faça login com uma das contas acima
3. Teste as funcionalidades:
   - **Admin:** Aprovar veterinários, gerenciar usuários
   - **Tutor:** Cadastrar pets, solicitar atendimentos
   - **Veterinário:** Aceitar solicitações, atender pacientes

---

## 🐳 Docker

O PostgreSQL está rodando no container `avilaops-postgres` que já existia no sistema.

### Comandos Docker Úteis
```bash
# Ver status do container
docker ps | grep postgres

# Parar container
docker stop avilaops-postgres

# Iniciar container
docker start avilaops-postgres

# Ver logs
docker logs avilaops-postgres
```

---

## 🔒 Segurança

⚠️ **IMPORTANTE:** As senhas acima são apenas para DESENVOLVIMENTO. 

Em produção:
- Altere todas as senhas
- Use variáveis de ambiente seguras
- Configure SSL/TLS no PostgreSQL
- Implemente rate limiting
- Use HTTPS no frontend

---

## 📚 Documentação Adicional

- [Prisma Documentation](https://www.prisma.io/docs)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- Ver `README.md` para documentação completa do projeto
