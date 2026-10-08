# 🏢 Multi-Tenant - Saúde Pet

## 📋 Visão Geral

O sistema Saúde Pet agora suporta **multi-tenancy**, permitindo que múltiplas organizações (clínicas veterinárias) usem a mesma plataforma com **isolamento total de dados**.

## 🎯 Conceitos-Chave

### Tenant (Organização)
- Cada tenant representa uma clínica veterinária independente
- Dados completamente isolados entre tenants
- Configurações personalizadas por tenant
- Limites de recursos por plano

### Tipos de Usuário
1. **super_admin** - Administra múltiplos tenants (sem tenant_id)
2. **admin** - Administra um tenant específico
3. **veterinario** - Profissional vinculado a um tenant
4. **tutor** - Cliente vinculado a um tenant

## 🔧 Arquitetura

### Modelo de Dados

```prisma
model Tenant {
  id              String
  slug            String @unique  // URL-friendly identifier
  nome            String
  cnpj            String? @unique
  plano           PlanoTenant     // free, basic, premium, enterprise
  status          StatusTenant     // ativo, suspenso, trial, cancelado
  limite_usuarios Int
  limite_pets     Int
  expira_em       DateTime?
}
```

Todos os modelos principais têm `tenant_id`:
- Usuario
- Pet
- Veterinario
- Solicitacao
- Mensagem
- Avaliacao

### Índices para Performance
- `@@index([tenant_id])` em todas as tabelas
- `@@index([tenant_id, status])` em solicitações
- `@@unique([tenant_id, email])` para unicidade por tenant

## 🚀 Como Usar

### 1. Registro de Usuário

Agora é necessário fornecer o `tenant_slug`:

```http
POST /api/v1/auth/register
Content-Type: application/json

{
  "nome": "João Silva",
  "email": "joao@example.com",
  "telefone": "(11) 98765-4321",
  "senha": "senha123",
  "tipo_usuario": "tutor",
  "cidade": "São Paulo",
  "tenant_slug": "clinica-demo"
}
```

### 2. Login

Opcional fornecer `tenant_slug` no login:

```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "joao@example.com",
  "senha": "senha123",
  "tenant_slug": "clinica-demo"
}
```

### 3. Buscar Tenant por Slug (Público)

```http
GET /api/v1/tenants/slug/clinica-demo
```

Retorna:
```json
{
  "id": "...",
  "nome": "Clínica Veterinária Demo",
  "slug": "clinica-demo",
  "logo": "...",
  "status": "ativo",
  "configuracoes": {
    "permitir_cadastro": true,
    "cor_primaria": "#3B82F6",
    "cor_secundaria": "#10B981"
  }
}
```

## 🔐 Autenticação Multi-Tenant

### JWT Token

O token JWT agora inclui `tenant_id`:

```javascript
{
  "id": "user-uuid",
  "tipo_usuario": "tutor",
  "tenant_id": "tenant-uuid"
}
```

### Middlewares

#### 1. `authMiddleware`
- Valida JWT e busca usuário
- Adiciona `req.user` (com tenant_id)

#### 2. `tenantContext`
- Extrai tenant_id do usuário autenticado
- Adiciona `req.tenantId` e `req.isSuperAdmin`

```javascript
router.get('/', 
  authMiddleware,        // Autentica usuário
  tenantContext,         // Extrai tenant_id
  controller.listar      // Controller usa req.tenantId
);
```

#### 3. `requireActiveTenant`
- Verifica se tenant está ativo
- Valida expiração do plano
- Bloqueia tenants suspensos

```javascript
router.post('/', 
  authMiddleware,
  tenantContext,
  requireActiveTenant,   // Valida status do tenant
  controller.criar
);
```

#### 4. `checkTenantLimit`
- Valida limites de recursos do plano

```javascript
router.post('/', 
  authMiddleware,
  tenantContext,
  requireActiveTenant,
  checkTenantLimit('usuario', 'limite_usuarios'),
  controller.criar
);
```

#### 5. `requireSameTenant`
- Garante que usuário só acesse recursos do seu tenant

```javascript
router.get('/:id', 
  authMiddleware,
  tenantContext,
  requireSameTenant('pet'),  // Valida tenant_id do pet
  controller.buscarPorId
);
```

## 🛠️ Helpers para Controllers

### `addTenantFilter(req, where)`

Adiciona filtro de tenant automaticamente:

```javascript
const { addTenantFilter } = require('../middleware/tenant.middleware');

class PetController {
  listar = asyncHandler(async (req, res) => {
    const where = addTenantFilter(req, { tipo: 'cachorro' });
    // where = { tenant_id: '...', tipo: 'cachorro' }
    
    const pets = await prisma.pet.findMany({ where });
    res.json(pets);
  });
}
```

**Super admin:**
- Sem tenant_id → vê todos os tenants
- Com `?tenant_id=xxx` → filtra por tenant específico

**Usuário normal:**
- Sempre filtra por seu `req.tenantId`

## 📊 Planos e Limites

### Planos Disponíveis

| Plano      | Usuários | Pets | Preço     |
|------------|----------|------|-----------|
| free       | 10       | 100  | Grátis    |
| basic      | 25       | 250  | R$ 99/mês |
| premium    | 50       | 500  | R$ 199/mês|
| enterprise | Ilimitado| Ilimitado | Custom |

### Validação de Limites

```javascript
// No registro
router.post('/', 
  checkTenantLimit('usuario', 'limite_usuarios'),
  controller.criar
);

// No cadastro de pets
router.post('/', 
  checkTenantLimit('pet', 'limite_pets'),
  controller.criar
);
```

## 🎨 Configurações por Tenant

Cada tenant pode personalizar:

```javascript
{
  "permitir_cadastro": true,
  "requer_aprovacao_vet": true,
  "notificacoes_email": true,
  "notificacoes_sms": false,
  "cor_primaria": "#3B82F6",
  "cor_secundaria": "#10B981"
}
```

## 👨‍💼 Gestão de Tenants (Super Admin)

### Criar Tenant

```http
POST /api/v1/tenants
Authorization: Bearer {super_admin_token}

{
  "nome": "Clínica VetCare",
  "slug": "vetcare",
  "email": "contato@vetcare.com",
  "telefone": "(11) 99999-9999",
  "cidade": "São Paulo",
  "estado": "SP",
  "plano": "premium"
}
```

### Atualizar Status

```http
PUT /api/v1/tenants/{id}/status
Authorization: Bearer {super_admin_token}

{
  "status": "suspenso"
}
```

### Atualizar Plano

```http
PUT /api/v1/tenants/{id}/plano
Authorization: Bearer {super_admin_token}

{
  "plano": "enterprise",
  "limite_usuarios": 100,
  "limite_pets": 1000,
  "expira_em": "2027-12-31T23:59:59Z"
}
```

### Estatísticas do Tenant

```http
GET /api/v1/tenants/{id}/stats
Authorization: Bearer {token}
```

Retorna:
```json
{
  "usuarios": {
    "total": 25,
    "limite": 50,
    "percentual": "50.0"
  },
  "pets": {
    "total": 150,
    "limite": 500,
    "percentual": "30.0"
  },
  "atendimentos": {
    "total": 350,
    "ativos": 5
  },
  "veterinarios": {
    "total": 8,
    "online": 3
  }
}
```

## 🧪 Dados de Teste

Execute o seed para criar dados demo:

```bash
cd backend
npx tsx scripts/seed-tenant.ts
```

### Credenciais de Teste

**Super Admin:**
- Email: `superadmin@saudepet.com`
- Senha: `Admin@123`
- Pode gerenciar todos os tenants

**Tenant: clinica-demo**

**Admin:**
- Email: `admin@clinica-demo.com`
- Senha: `Admin@123`

**Veterinário:**
- Email: `vet@clinica-demo.com`
- Senha: `Vet@123`
- CRMV: SP-12345

**Tutor:**
- Email: `tutor@clinica-demo.com`
- Senha: `Tutor@123`
- Pet: Rex (Labrador, 3 anos)

## 🔒 Isolamento de Dados

### Unicidade por Tenant

Email e telefone são únicos **por tenant**:

```sql
-- Válido: mesmo email em tenants diferentes
Tenant A: joao@example.com
Tenant B: joao@example.com

-- Inválido: email duplicado no mesmo tenant
Tenant A: joao@example.com
Tenant A: joao@example.com ❌
```

### Queries Automáticas

Todos os controllers devem usar `addTenantFilter`:

```javascript
// ❌ ERRADO - sem filtro de tenant
const pets = await prisma.pet.findMany();

// ✅ CORRETO - com filtro de tenant
const where = addTenantFilter(req);
const pets = await prisma.pet.findMany({ where });
```

## 📝 Migration e Rollback

### Aplicar Migration

```bash
cd backend
npx prisma migrate deploy
```

### Ver Migrations Aplicadas

```bash
npx prisma migrate status
```

## 🎯 Próximos Passos

- [x] Modelo de dados multi-tenant
- [x] Middlewares de tenant context
- [x] Autenticação com tenant_slug
- [x] Gestão de tenants (CRUD)
- [x] Seed de dados demo
- [ ] Atualizar todos os controllers com filtro tenant_id
- [ ] Subdomínios por tenant (vetcare.saudepet.com)
- [ ] Whitelabel completo (logo, cores, domínio)
- [ ] Billing e pagamentos por tenant
- [ ] Métricas e analytics por tenant

## 🐛 Troubleshooting

### "É necessário fornecer o identificador da organização"
- Inclua `tenant_slug` no registro/login
- Exemplo: `"tenant_slug": "clinica-demo"`

### "Sua organização está suspensa"
- Entre em contato com super admin
- Ou ajuste o status no banco: `UPDATE tenants SET status = 'ativo'`

### "Limite de usuários atingido"
- Faça upgrade do plano
- Ou aumente o limite: `UPDATE tenants SET limite_usuarios = 100`

### "Usuário não tem permissão para acessar este recurso"
- Tentando acessar recurso de outro tenant
- Verifique se está autenticado com o tenant correto

## 📚 Referências

- [Prisma Multi-Tenancy Guide](https://www.prisma.io/docs/guides/database/multi-tenancy)
- [Best Practices for Multi-Tenant SaaS](https://aws.amazon.com/blogs/apn/saas-architecture-patterns/)
